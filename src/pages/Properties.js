import React, { useState, useMemo } from "react";
import * as XLSX from "xlsx";
import { writeBatch, doc, collection, addDoc, serverTimestamp } from "firebase/firestore";
import { ref, uploadBytes, getDownloadURL, deleteObject } from "firebase/storage";
import { db, storage } from "../firebase";
import { useCollection } from "../hooks/useCollection";
import { todayStr } from "../lib/dates";
import { withAgid } from "../lib/url";
import PropertyHistory from "./PropertyHistory";
import { PROPERTY_CATEGORIES as CATEGORIES, PROPERTY_STORES as STORES } from "../lib/propertyConstants";

const STATUS_LABELS = { active: "在售", onHold: "暫時不賣", sold: "已售出" };
const STATUS_ORDER = ["active", "onHold", "sold"];

// 解析「房/廳/衛」格式的格局字串，例如 "4+1/2/4" 會取每段開頭的數字
function parseLayout(layout) {
  if (!layout) return { rooms: null, living: null, bath: null };
  const parts = String(layout).split("/").map((s) => s.trim());
  const parseNum = (s) => {
    if (!s) return null;
    const m = s.match(/\d+/);
    return m ? parseInt(m[0], 10) : null;
  };
  return { rooms: parseNum(parts[0]), living: parseNum(parts[1]), bath: parseNum(parts[2]) };
}

// mode: "eq" 精確等於 / "gte" 以上（大於等於）
function matchNum(value, filterVal, mode) {
  if (filterVal === "" || filterVal === null || filterVal === undefined) return true;
  if (value === null) return false;
  const f = Number(filterVal);
  return mode === "eq" ? value === f : value >= f;
}

const emptyForm = {
  store: STORES[3],
  listingNo: "",
  title: "",
  address: "",
  landPing: "",
  titlePing: "",
  floor: "",
  orientation: "",
  age: "",
  layout: "",
  parkingCount: "",
  totalPrice: "",
  occupancy: "",
  laneWidth: "",
  agentInfo: "",
  websiteUrl: "",
  notes: "",
  category: CATEGORIES[0],
  status: "active",
  statusChangedAt: todayStr(),
  lastPriceChange: null,
  sheetFileUrl: null,
  sheetFileName: null,
  sheetFileType: null,
  customFields: [],
};

export default function Properties() {
  const { items, add, update, remove } = useCollection("properties", "createdAt");
  const { items: linkedCases } = useCollection("cases", "createdAt");
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState(emptyForm);
  const [originalTotalPrice, setOriginalTotalPrice] = useState(null);
  const [keyword, setKeyword] = useState("");
  const [minPrice, setMinPrice] = useState("");
  const [maxPrice, setMaxPrice] = useState("");
  const [layoutKeyword, setLayoutKeyword] = useState("");
  const [roomFilter, setRoomFilter] = useState("");
  const [roomMode, setRoomMode] = useState("eq");
  const [livingFilter, setLivingFilter] = useState("");
  const [livingMode, setLivingMode] = useState("eq");
  const [bathFilter, setBathFilter] = useState("");
  const [bathMode, setBathMode] = useState("eq");
  const [activeCategory, setActiveCategory] = useState("全部");
  const [viewMode, setViewMode] = useState("active"); // active | onHold | sold
  const [importing, setImporting] = useState(false);
  const [backfilling, setBackfilling] = useState(false);
  const [uploadingSheet, setUploadingSheet] = useState(false);

  const openNew = () => {
    setForm(emptyForm);
    setEditingId(null);
    setOriginalTotalPrice(null);
    setShowForm(true);
  };

  const openEdit = (item) => {
    setForm({ ...emptyForm, ...item, customFields: item.customFields || [] });
    setEditingId(item.id);
    setOriginalTotalPrice(item.totalPrice);
    setShowForm(true);
    requestAnimationFrame(() => {
      window.scrollTo({ top: 0, behavior: "smooth" });
    });
  };

  const addCustomField = () => {
    setForm({ ...form, customFields: [...form.customFields, { label: "", value: "" }] });
  };
  const updateCustomField = (idx, key, val) => {
    const next = [...form.customFields];
    next[idx] = { ...next[idx], [key]: val };
    setForm({ ...form, customFields: next });
  };
  const removeCustomField = (idx) =>
    setForm({ ...form, customFields: form.customFields.filter((_, i) => i !== idx) });

  const onSubmit = async (e) => {
    e.preventDefault();
    if (!form.title.trim()) return;

    const formToSave = { ...form, websiteUrl: withAgid(form.websiteUrl) };

    if (editingId) {
      const priceChanged =
        form.totalPrice !== "" &&
        String(form.totalPrice) !== String(originalTotalPrice) &&
        originalTotalPrice !== null &&
        originalTotalPrice !== "";
      const updates = { ...formToSave };
      if (priceChanged) {
        updates.lastPriceChange = {
          oldPrice: originalTotalPrice,
          newPrice: form.totalPrice,
          date: todayStr(),
        };
      }
      await update(editingId, updates);
      if (priceChanged) {
        await addDoc(collection(db, `properties/${editingId}/priceLogs`), {
          oldPrice: originalTotalPrice,
          newPrice: form.totalPrice,
          date: todayStr(),
          createdAt: serverTimestamp(),
        });
      }
    } else {
      const ref2 = await add(formToSave);
      await addDoc(collection(db, `properties/${ref2.id}/statusLogs`), {
        status: form.status,
        date: todayStr(),
        createdAt: serverTimestamp(),
      });
    }
    setShowForm(false);
  };

  const changeStatus = async (item, newStatus) => {
    const dateStr = todayStr();
    await update(item.id, { status: newStatus, statusChangedAt: dateStr });
    await addDoc(collection(db, `properties/${item.id}/statusLogs`), {
      status: newStatus,
      date: dateStr,
      createdAt: serverTimestamp(),
    });
    if (editingId === item.id) {
      setForm((f) => ({ ...f, status: newStatus, statusChangedAt: dateStr }));
    }
  };

  const deleteForever = async (item) => {
    if (window.confirm(`確定要永久刪除「${item.title}」嗎？此動作無法復原。`)) {
      await remove(item.id);
    }
  };

  const handleSheetUpload = async (e) => {
    const file = e.target.files[0];
    e.target.value = "";
    if (!file || !editingId) return;
    setUploadingSheet(true);
    try {
      const ext = file.name.split(".").pop();
      const path = `properties/${editingId}/sheet.${ext}`;
      const storageRef = ref(storage, path);
      await uploadBytes(storageRef, file);
      const url = await getDownloadURL(storageRef);
      await update(editingId, { sheetFileUrl: url, sheetFileName: file.name, sheetFileType: file.type });
      setForm((f) => ({ ...f, sheetFileUrl: url, sheetFileName: file.name, sheetFileType: file.type }));
    } catch (err) {
      console.error(err);
      alert("上傳失敗，請確認 Firebase Storage 是否已啟用。");
    }
    setUploadingSheet(false);
  };

  const removeSheet = async () => {
    if (!editingId || !form.sheetFileUrl) return;
    if (!window.confirm("確定要移除這份資料表嗎？")) return;
    try {
      const ext = form.sheetFileName ? form.sheetFileName.split(".").pop() : "";
      await deleteObject(ref(storage, `properties/${editingId}/sheet.${ext}`));
    } catch {
      // 檔案本體刪不掉也不擋
    }
    await update(editingId, { sheetFileUrl: null, sheetFileName: null, sheetFileType: null });
    setForm((f) => ({ ...f, sheetFileUrl: null, sheetFileName: null, sheetFileType: null }));
  };

  // ---- 分類與狀態統計 ----
  const byStatus = (s) => items.filter((p) => (p.status || "active") === s);
  const activeItems = byStatus("active");
  const onHoldItems = byStatus("onHold");
  const soldItems = byStatus("sold");
  const pool = viewMode === "active" ? activeItems : viewMode === "onHold" ? onHoldItems : soldItems;

  const categoryCounts = useMemo(() => {
    const map = {};
    pool.forEach((p) => {
      const c = p.category || "未分類";
      map[c] = (map[c] || 0) + 1;
    });
    return map;
  }, [pool]);

  const filtered = pool.filter((p) => {
    if (activeCategory !== "全部" && (p.category || "未分類") !== activeCategory) return false;
    if (minPrice && Number(p.totalPrice || 0) < Number(minPrice)) return false;
    if (maxPrice && Number(p.totalPrice || 0) > Number(maxPrice)) return false;
    if (layoutKeyword.trim() && !String(p.layout || "").includes(layoutKeyword.trim())) return false;
    const { rooms, living, bath } = parseLayout(p.layout);
    if (!matchNum(rooms, roomFilter, roomMode)) return false;
    if (!matchNum(living, livingFilter, livingMode)) return false;
    if (!matchNum(bath, bathFilter, bathMode)) return false;
    if (!keyword.trim()) return true;
    const k = keyword.trim();
    return (
      (p.title || "").includes(k) ||
      (p.address || "").includes(k) ||
      (p.listingNo || "").includes(k) ||
      (p.store || "").includes(k)
    );
  });

  // ---- 匯入 Excel（智慧更新：用委託書編號比對新增/更新，並標記消失的物件）----
  const handleImportFile = async (e) => {
    const file = e.target.files[0];
    e.target.value = "";
    if (!file) return;

    try {
      const buf = await file.arrayBuffer();
      const wb = XLSX.read(buf, { type: "array" });

      const rowsToImport = [];
      CATEGORIES.forEach((cat) => {
        if (!wb.SheetNames.includes(cat)) return;
        const ws = wb.Sheets[cat];
        const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: "" });
        for (let i = 1; i < rows.length; i++) {
          const r = rows[i];
          if (!r || !r[1]) continue;
          rowsToImport.push({
            store: String(r[0] || ""),
            listingNo: String(r[1] || ""),
            title: String(r[2] || ""),
            address: String(r[3] || ""),
            landPing: r[4] === "" ? "" : Number(r[4]) || r[4],
            titlePing: r[5] === "" ? "" : Number(r[5]) || r[5],
            floor: String(r[6] || ""),
            orientation: String(r[7] || ""),
            age: String(r[8] || ""),
            layout: String(r[9] || ""),
            parkingCount: r[10] === "" ? 0 : Number(r[10]) || 0,
            totalPrice: r[11] === "" ? "" : Number(r[11]) || r[11],
            occupancy: String(r[12] || ""),
            laneWidth: String(r[13] || ""),
            agentInfo: String(r[14] || ""),
            websiteUrl: withAgid(String(r[15] || "")),
            notes: String(r[17] || ""),
            category: cat,
          });
        }
      });

      if (rowsToImport.length === 0) {
        alert("在這個檔案裡沒有找到符合格式的資料列，請確認分頁名稱與欄位順序跟範本一致。");
        return;
      }

      const existingByListingNo = {};
      items.forEach((p) => {
        if (p.listingNo) existingByListingNo[p.listingNo] = p;
      });

      const seen = new Set();
      let newCount = 0;
      let updateCount = 0;
      let priceChangedCount = 0;
      const ops = []; // { ref, data, merge }

      rowsToImport.forEach((row) => {
        if (!row.listingNo) return;
        seen.add(row.listingNo);
        const existing = existingByListingNo[row.listingNo];

        if (!existing) {
          const newRef = doc(collection(db, "properties"));
          ops.push({
            ref: newRef,
            data: {
              ...row,
              status: "active",
              statusChangedAt: todayStr(),
              lastPriceChange: null,
              customFields: [],
              createdAt: new Date(),
            },
            merge: false,
          });
          ops.push({
            ref: doc(collection(db, `properties/${newRef.id}/statusLogs`)),
            data: { status: "active", date: todayStr(), createdAt: serverTimestamp() },
            merge: false,
          });
          newCount++;
        } else {
          // 地址、備註保留你自己在系統裡填寫/修改過的內容，不被 Excel 覆蓋
          const { address, notes, totalPrice, ...rest } = row;
          const updates = { ...rest };
          const priceChanged = totalPrice !== "" && String(totalPrice) !== String(existing.totalPrice);
          if (priceChanged) {
            updates.totalPrice = totalPrice;
            updates.lastPriceChange = { oldPrice: existing.totalPrice, newPrice: totalPrice, date: todayStr() };
            ops.push({
              ref: doc(collection(db, `properties/${existing.id}/priceLogs`)),
              data: { oldPrice: existing.totalPrice, newPrice: totalPrice, date: todayStr(), createdAt: serverTimestamp() },
              merge: false,
            });
            priceChangedCount++;
          }
          ops.push({ ref: doc(db, "properties", existing.id), data: updates, merge: true });
          updateCount++;
        }
      });

      // 這次 Excel 沒出現、但資料庫裡還標記「在售」的物件，自動標為「暫時不賣」
      const missing = items.filter(
        (p) => p.listingNo && !seen.has(p.listingNo) && (p.status || "active") === "active"
      );
      missing.forEach((p) => {
        ops.push({
          ref: doc(db, "properties", p.id),
          data: { status: "onHold", statusChangedAt: todayStr() },
          merge: true,
        });
        ops.push({
          ref: doc(collection(db, `properties/${p.id}/statusLogs`)),
          data: {
            status: "onHold",
            date: todayStr(),
            note: "Excel 更新後未再出現，系統自動標記",
            createdAt: serverTimestamp(),
          },
          merge: false,
        });
      });

      const confirmMsg =
        `這次匯入：\n新增 ${newCount} 筆\n更新 ${updateCount} 筆（其中 ${priceChangedCount} 筆總價異動）\n` +
        `${missing.length} 筆物件這次沒出現在檔案裡，將自動標記為「暫時不賣」\n\n` +
        `地址與備註不會被覆蓋，會保留你在系統裡填寫的內容。確定要繼續嗎？`;
      if (!window.confirm(confirmMsg)) return;

      setImporting(true);
      const CHUNK = 450;
      for (let i = 0; i < ops.length; i += CHUNK) {
        const batch = writeBatch(db);
        ops.slice(i, i + CHUNK).forEach((op) => {
          if (op.merge) batch.set(op.ref, op.data, { merge: true });
          else batch.set(op.ref, op.data);
        });
        await batch.commit();
      }
      setImporting(false);
      alert(
        `匯入完成：新增 ${newCount} 筆、更新 ${updateCount} 筆（${priceChangedCount} 筆調價）、自動標記暫時不賣 ${missing.length} 筆。`
      );
    } catch (err) {
      console.error(err);
      setImporting(false);
      alert("匯入失敗，請確認檔案格式是否跟範本一致。");
    }
  };

  // ---- 匯出 Excel（維持原始檔案的分頁與欄位格式）----
  const handleExport = () => {
    const exportItems = items.filter((p) => (p.status || "active") === "active");

    const HEADER = [
      "店名", "委託書編號", "案名", "地址", "地坪", "權狀坪", "樓別", "座向",
      "屋齡", "格局", "車位", "總價(萬)", "空／自", "巷寬", "開發姓名",
      "官網點閱網址", "詳細資料表", "備註",
    ];

    const wb = XLSX.utils.book_new();

    // 索引總覽（維持原始格式）
    const indexRows = [
      ["物件查詢總表 - 索引", null, null],
      [null, null, null],
      ["類別", "筆數", "涵蓋店別"],
    ];
    let total = 0;
    CATEGORIES.forEach((cat) => {
      const rowsInCat = exportItems.filter((p) => (p.category || "") === cat);
      const stores = [...new Set(rowsInCat.map((p) => p.store).filter(Boolean))];
      indexRows.push([cat, rowsInCat.length, stores.join("、")]);
      total += rowsInCat.length;
    });
    indexRows.push([null, null, null]);
    indexRows.push(["總計", total, null]);
    const indexSheet = XLSX.utils.aoa_to_sheet(indexRows);
    XLSX.utils.book_append_sheet(wb, indexSheet, "索引總覽");

    // 15 個分類分頁
    CATEGORIES.forEach((cat) => {
      const rowsInCat = exportItems.filter((p) => (p.category || "") === cat);
      const aoa = [HEADER];
      rowsInCat.forEach((p) => {
        aoa.push([
          p.store || "",
          p.listingNo || "",
          p.title || "",
          p.address || "",
          p.landPing ?? "",
          p.titlePing ?? "",
          p.floor || "",
          p.orientation || "",
          p.age || "",
          p.layout || "",
          p.parkingCount ?? "",
          p.totalPrice ?? "",
          p.occupancy || "",
          p.laneWidth || "",
          p.agentInfo || "",
          p.websiteUrl || "",
          "",
          p.notes || "",
        ]);
      });
      const sheet = XLSX.utils.aoa_to_sheet(aoa);
      XLSX.utils.book_append_sheet(wb, sheet, cat);
    });

    XLSX.writeFile(wb, `物件總表_匯出_${todayStr()}.xlsx`);
  };

  // ---- 一次性補齊所有既有物件的 agid（給還沒補到的舊資料用）----
  const handleBackfillAgid = async () => {
    const targets = items.filter((p) => p.websiteUrl && !p.websiteUrl.includes("agid="));
    if (targets.length === 0) {
      alert("所有物件的網址都已經有 agid 了，不需要補。");
      return;
    }
    if (!window.confirm(`即將幫 ${targets.length} 筆物件（含在售與已售出）的網址補上 agid，確定要繼續嗎？`)) {
      return;
    }
    setBackfilling(true);
    try {
      const CHUNK = 400;
      for (let i = 0; i < targets.length; i += CHUNK) {
        const batch = writeBatch(db);
        targets.slice(i, i + CHUNK).forEach((p) => {
          batch.update(doc(db, "properties", p.id), { websiteUrl: withAgid(p.websiteUrl) });
        });
        await batch.commit();
      }
      alert(`已完成，補上了 ${targets.length} 筆物件的 agid。`);
    } catch (err) {
      console.error(err);
      alert("補齊失敗，請再試一次。");
    }
    setBackfilling(false);
  };

  const fieldStyle2 = { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 };
  const fieldStyle3 = { display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 14 };

  return (
    <main>
      <div className="top-actions">
        <div className="section-title">
          物件（{pool.length}）
        </div>
        <div style={{ display: "flex", gap: 10 }}>
          <button className="btn ghost" onClick={handleExport}>
            匯出 Excel
          </button>
          <button className="btn ghost" onClick={handleBackfillAgid} disabled={backfilling}>
            {backfilling ? "補齊中…" : "補齊網址 agid"}
          </button>
          <label className="btn ghost" style={{ cursor: "pointer" }}>
            {importing ? "處理中…" : "匯入／更新 Excel"}
            <input
              type="file"
              accept=".xlsx,.xls"
              onChange={handleImportFile}
              style={{ display: "none" }}
              disabled={importing}
            />
          </label>
          <button className="btn" onClick={openNew}>
            ＋ 新增物件
          </button>
        </div>
      </div>

      {/* 狀態切換 */}
      <div style={{ display: "flex", gap: 8, marginBottom: 14 }}>
        <button className={viewMode === "active" ? "btn" : "btn ghost"} onClick={() => { setViewMode("active"); setShowForm(false); }}>
          在售（{activeItems.length}）
        </button>
        <button className={viewMode === "onHold" ? "btn" : "btn ghost"} onClick={() => { setViewMode("onHold"); setShowForm(false); }}>
          暫時不賣（{onHoldItems.length}）
        </button>
        <button className={viewMode === "sold" ? "btn" : "btn ghost"} onClick={() => { setViewMode("sold"); setShowForm(false); }}>
          已售出（{soldItems.length}）
        </button>
      </div>

      {/* 分類篩選 */}
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 18 }}>
        <button
          style={{
            cursor: "pointer", border: "none", borderRadius: 20, padding: "2px 10px", fontSize: 10, fontWeight: 700,
            background: activeCategory === "全部" ? "var(--accent)" : "var(--accent-soft)",
            color: activeCategory === "全部" ? "#fff" : "var(--accent)",
          }}
          onClick={() => { setActiveCategory("全部"); setShowForm(false); }}
        >
          全部（{pool.length}）
        </button>
        {CATEGORIES.map((c) => (
          <button
            key={c}
            style={{
              cursor: "pointer", border: "none", borderRadius: 20, padding: "2px 10px", fontSize: 10, fontWeight: 700,
              background: activeCategory === c ? "var(--accent)" : "var(--accent-soft)",
              color: activeCategory === c ? "#fff" : "var(--accent)",
            }}
            onClick={() => { setActiveCategory(c); setShowForm(false); }}
          >
            {c}（{categoryCounts[c] || 0}）
          </button>
        ))}
      </div>

      {/* 搜尋與篩選 */}
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 10 }}>
        <input
          value={keyword}
          onChange={(e) => setKeyword(e.target.value)}
          placeholder="搜尋案名、地址、委託書編號、店名…"
          style={{ flex: 1, minWidth: 220, padding: "10px 12px", border: "1px solid var(--border)", borderRadius: 7, fontSize: 14 }}
        />
        <input
          value={minPrice}
          onChange={(e) => setMinPrice(e.target.value)}
          placeholder="最低總價(萬)"
          type="number"
          style={{ width: 130, padding: "10px 12px", border: "1px solid var(--border)", borderRadius: 7, fontSize: 14 }}
        />
        <input
          value={maxPrice}
          onChange={(e) => setMaxPrice(e.target.value)}
          placeholder="最高總價(萬)"
          type="number"
          style={{ width: 130, padding: "10px 12px", border: "1px solid var(--border)", borderRadius: 7, fontSize: 14 }}
        />
      </div>

      {/* 房／廳／衛 結構化搜尋 */}
      <div style={{ display: "flex", gap: 16, flexWrap: "wrap", alignItems: "center", marginBottom: 18 }}>
        {[
          { label: "房", value: roomFilter, setValue: setRoomFilter, mode: roomMode, setMode: setRoomMode },
          { label: "廳", value: livingFilter, setValue: setLivingFilter, mode: livingMode, setMode: setLivingMode },
          { label: "衛", value: bathFilter, setValue: setBathFilter, mode: bathMode, setMode: setBathMode },
        ].map((f) => (
          <div key={f.label} style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <span style={{ fontSize: 12, color: "var(--muted)", fontWeight: 700 }}>{f.label}</span>
            <input
              type="number"
              min="0"
              value={f.value}
              onChange={(e) => f.setValue(e.target.value)}
              style={{ width: 56, padding: "8px 8px", border: "1px solid var(--border)", borderRadius: 7, fontSize: 13 }}
            />
            <select
              value={f.mode}
              onChange={(e) => f.setMode(e.target.value)}
              style={{ padding: "8px 6px", border: "1px solid var(--border)", borderRadius: 7, fontSize: 12 }}
            >
              <option value="eq">＝</option>
              <option value="gte">以上</option>
            </select>
          </div>
        ))}
        <input
          value={layoutKeyword}
          onChange={(e) => setLayoutKeyword(e.target.value)}
          placeholder="格局關鍵字（備用，例如非標準格局的物件）"
          style={{ width: 220, padding: "8px 12px", border: "1px solid var(--border)", borderRadius: 7, fontSize: 13 }}
        />
      </div>

      {showForm && (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: editingId ? "minmax(320px, 720px) 1fr" : "minmax(320px, 720px)",
            gap: 24,
            marginBottom: 24,
            alignItems: "start",
          }}
        >
          <div className="panel">
          <form className="form-grid" onSubmit={onSubmit}>
            <div style={fieldStyle3}>
              <div className="form-field">
                <label>店名</label>
                <select value={form.store} onChange={(e) => setForm({ ...form, store: e.target.value })}>
                  {STORES.map((s) => (
                    <option key={s} value={s}>{s}</option>
                  ))}
                </select>
              </div>
              <div className="form-field">
                <label>類別</label>
                <select value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}>
                  {CATEGORIES.map((c) => (
                    <option key={c} value={c}>{c}</option>
                  ))}
                </select>
              </div>
              <div className="form-field">
                <label>狀態</label>
                {editingId ? (
                  <select value={form.status} onChange={(e) => changeStatus({ id: editingId }, e.target.value)}>
                    {STATUS_ORDER.map((s) => (
                      <option key={s} value={s}>{STATUS_LABELS[s]}</option>
                    ))}
                  </select>
                ) : (
                  <select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}>
                    {STATUS_ORDER.map((s) => (
                      <option key={s} value={s}>{STATUS_LABELS[s]}</option>
                    ))}
                  </select>
                )}
              </div>
            </div>

            <div style={fieldStyle2}>
              <div className="form-field">
                <label>委託書編號</label>
                <input value={form.listingNo} onChange={(e) => setForm({ ...form, listingNo: e.target.value })} />
              </div>
              <div className="form-field">
                <label>案名</label>
                <input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} required />
              </div>
            </div>

            <div className="form-field">
              <label>地址</label>
              <input value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} />
            </div>

            <div style={fieldStyle3}>
              <div className="form-field">
                <label>地坪</label>
                <input value={form.landPing} onChange={(e) => setForm({ ...form, landPing: e.target.value })} />
              </div>
              <div className="form-field">
                <label>權狀坪</label>
                <input value={form.titlePing} onChange={(e) => setForm({ ...form, titlePing: e.target.value })} />
              </div>
              <div className="form-field">
                <label>樓別</label>
                <input value={form.floor} onChange={(e) => setForm({ ...form, floor: e.target.value })} placeholder="例如：5/5" />
              </div>
              <div className="form-field">
                <label>座向</label>
                <input value={form.orientation} onChange={(e) => setForm({ ...form, orientation: e.target.value })} placeholder="例如：坐北朝南" />
              </div>
              <div className="form-field">
                <label>屋齡</label>
                <input value={form.age} onChange={(e) => setForm({ ...form, age: e.target.value })} placeholder="例如：12年3個月" />
              </div>
              <div className="form-field">
                <label>格局</label>
                <input value={form.layout} onChange={(e) => setForm({ ...form, layout: e.target.value })} placeholder="房/廳/衛，例如：3/2/2" />
              </div>
              <div className="form-field">
                <label>車位（數量）</label>
                <input value={form.parkingCount} onChange={(e) => setForm({ ...form, parkingCount: e.target.value })} />
              </div>
              <div className="form-field">
                <label>總價（萬）</label>
                <input value={form.totalPrice} onChange={(e) => setForm({ ...form, totalPrice: e.target.value })} />
                {editingId && originalTotalPrice !== null && String(originalTotalPrice) !== String(form.totalPrice) && form.totalPrice !== "" && (
                  <div style={{ fontSize: 11, color: "var(--brass)", marginTop: 4 }}>
                    儲存後會記錄：{originalTotalPrice} 萬 → {form.totalPrice} 萬
                  </div>
                )}
              </div>
              <div className="form-field">
                <label>空／自</label>
                <input value={form.occupancy} onChange={(e) => setForm({ ...form, occupancy: e.target.value })} placeholder="空屋／自住／出租中" />
              </div>
              <div className="form-field">
                <label>巷寬</label>
                <input value={form.laneWidth} onChange={(e) => setForm({ ...form, laneWidth: e.target.value })} />
              </div>
            </div>

            <div className="form-field">
              <label>開發姓名（含電話）</label>
              <input value={form.agentInfo} onChange={(e) => setForm({ ...form, agentInfo: e.target.value })} />
            </div>
            <div className="form-field">
              <label>官網點閱網址</label>
              <div style={{ display: "flex", gap: 8 }}>
                <input
                  style={{ flex: 1 }}
                  value={form.websiteUrl}
                  onChange={(e) => setForm({ ...form, websiteUrl: e.target.value })}
                />
                {form.websiteUrl && (
                  <a href={withAgid(form.websiteUrl)} target="_blank" rel="noreferrer" className="btn ghost" style={{ textDecoration: "none", whiteSpace: "nowrap", display: "flex", alignItems: "center" }}>
                    開啟網頁
                  </a>
                )}
              </div>
            </div>
            <div className="form-field">
              <label>備註</label>
              <textarea rows="3" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
            </div>

            <div className="form-field">
              <label>物件資料表（PDF 或圖片，方便隨時查看、傳給客戶）</label>
              {!editingId && (
                <div style={{ fontSize: 12, color: "var(--muted)" }}>
                  請先儲存這筆物件，之後點進來編輯就可以上傳資料表了
                </div>
              )}
              {editingId && (
                <>
                  {form.sheetFileUrl && (
                    <div style={{ marginBottom: 10 }}>
                      {form.sheetFileType && form.sheetFileType.startsWith("image/") ? (
                        <img src={form.sheetFileUrl} alt="物件資料表" style={{ maxWidth: 200, borderRadius: 8, border: "1px solid var(--border)", display: "block", marginBottom: 8 }} />
                      ) : (
                        <div style={{ fontSize: 13, marginBottom: 8 }}>📄 {form.sheetFileName}</div>
                      )}
                      <div style={{ display: "flex", gap: 8 }}>
                        <a href={form.sheetFileUrl} target="_blank" rel="noreferrer" className="btn ghost" style={{ textDecoration: "none", display: "inline-block" }}>
                          開啟／下載
                        </a>
                        <button type="button" className="btn ghost" onClick={removeSheet}>
                          移除
                        </button>
                      </div>
                    </div>
                  )}
                  <label className="btn ghost" style={{ cursor: "pointer", display: "inline-block" }}>
                    {uploadingSheet ? "上傳中…" : form.sheetFileUrl ? "重新上傳" : "上傳資料表"}
                    <input type="file" accept=".pdf,image/*" onChange={handleSheetUpload} style={{ display: "none" }} disabled={uploadingSheet} />
                  </label>
                </>
              )}
            </div>

            <div className="form-field">
              <label>自訂欄位</label>
              {form.customFields.map((f, idx) => (
                <div key={idx} style={{ display: "flex", gap: 8, marginBottom: 8 }}>
                  <input value={f.label} onChange={(e) => updateCustomField(idx, "label", e.target.value)} placeholder="欄位名稱" style={{ flex: 1 }} />
                  <input value={f.value} onChange={(e) => updateCustomField(idx, "value", e.target.value)} placeholder="內容" style={{ flex: 1 }} />
                  <button type="button" className="btn ghost" onClick={() => removeCustomField(idx)}>刪除</button>
                </div>
              ))}
              <button type="button" className="btn ghost" onClick={addCustomField}>＋ 新增自訂欄位</button>
            </div>

            <div style={{ display: "flex", gap: 10 }}>
              <button className="btn" type="submit">
                {editingId ? "儲存變更" : "新增物件"}
              </button>
              <button className="btn ghost" type="button" onClick={() => setShowForm(false)}>取消</button>
              {editingId && (
                <button className="btn danger" type="button" onClick={async () => { await deleteForever({ id: editingId, title: form.title }); setShowForm(false); }}>
                  永久刪除
                </button>
              )}
            </div>
          </form>
          </div>

          {editingId && (
            <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
              {(() => {
                const usedIn = linkedCases.filter((c) => c.propertyId === editingId);
                if (usedIn.length === 0) return null;
                return (
                  <div className="panel">
                    <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 10 }}>
                      使用於成交案件（{usedIn.length}）
                    </div>
                    {usedIn.map((c) => (
                      <div key={c.id} style={{ fontSize: 13, padding: "8px 0", borderBottom: "1px solid var(--border)" }}>
                        {c.title}
                        {c.contactName && <span style={{ color: "var(--muted)" }}>　客戶：{c.contactName}</span>}
                      </div>
                    ))}
                    <div style={{ fontSize: 11, color: "var(--muted)", marginTop: 8 }}>
                      前往「成交案件」頁面可以編輯
                    </div>
                  </div>
                );
              })()}
              <div className="panel">
                <PropertyHistory propertyId={editingId} createdAt={form.createdAt} />
              </div>
            </div>
          )}
        </div>
      )}

      <div className="panel">
        {filtered.length === 0 && (
          <div className="empty-state">
            <div className="big">{items.length === 0 ? "還沒有物件資料" : "找不到符合的物件"}</div>
            {items.length === 0 && "點右上角「＋ 新增物件」開始建檔，或用「匯入 Excel」批次匯入"}
          </div>
        )}
        {filtered.map((p) => (
          <div className="list-row" key={p.id} onClick={() => openEdit(p)} style={{ cursor: "pointer" }}>
            <div>
              <div className="name">
                {p.title} <span className="tag">{p.category}</span>
                {p.sheetFileUrl && <span title="已上傳資料表"> 📄</span>}
              </div>
              <div className="meta">
                {p.store}　{p.listingNo}　{p.address}
              </div>
              <div className="meta">
                {Boolean(p.floor) && <>{p.floor}　</>}
                {Boolean(p.layout) && <>{p.layout}　</>}
                {Boolean(p.titlePing) && <>{p.titlePing} 坪　</>}
                {Boolean(p.totalPrice) && <>總價 {p.totalPrice} 萬　</>}
                {Boolean(p.occupancy) && <>{p.occupancy}</>}
              </div>
              {p.lastPriceChange && (
                <div className="meta" style={{ color: "var(--brass)" }}>
                  💰 已調整：{p.lastPriceChange.oldPrice} 萬 → {p.lastPriceChange.newPrice} 萬（{p.lastPriceChange.date}）
                </div>
              )}
            </div>
            <div className="actions" onClick={(e) => e.stopPropagation()}>
              {p.websiteUrl && (
                <a href={withAgid(p.websiteUrl)} target="_blank" rel="noreferrer" className="btn ghost" style={{ textDecoration: "none", display: "inline-flex", alignItems: "center" }}>
                  開啟網頁
                </a>
              )}
              <select
                value={p.status || "active"}
                onChange={(e) => changeStatus(p, e.target.value)}
                style={{ padding: "8px 10px", fontSize: 12 }}
              >
                {STATUS_ORDER.map((s) => (
                  <option key={s} value={s}>{STATUS_LABELS[s]}</option>
                ))}
              </select>
              <button className="btn ghost" onClick={() => openEdit(p)}>編輯</button>
            </div>
          </div>
        ))}
      </div>
    </main>
  );
}
