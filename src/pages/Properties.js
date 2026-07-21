import React, { useState, useMemo } from "react";
import * as XLSX from "xlsx";
import { writeBatch, doc, collection, addDoc, serverTimestamp } from "firebase/firestore";
import { ref, uploadBytes, getDownloadURL, deleteObject } from "firebase/storage";
import { db, storage } from "../firebase";
import { useCollection } from "../hooks/useCollection";
import { todayStr } from "../lib/dates";
import { withAgid } from "../lib/url";
import PropertyHistory from "./PropertyHistory";
import PropertyShare from "./PropertyShare";
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
  sheetFiles: [],
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
  const [importAnalysis, setImportAnalysis] = useState(null);
  const [importDecisions, setImportDecisions] = useState({});
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [showShare, setShowShare] = useState(false);

  const toggleSelect = (id) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };
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
    const files = Array.from(e.target.files || []);
    e.target.value = "";
    if (files.length === 0 || !editingId) return;
    setUploadingSheet(true);
    try {
      const newFiles = [];
      for (const file of files) {
        const safeName = file.name.replace(/[^\w.\-\u4e00-\u9fff]/g, "_");
        const storageRef = ref(storage, `properties/${editingId}/sheets/${Date.now()}_${safeName}`);
        await uploadBytes(storageRef, file);
        const url = await getDownloadURL(storageRef);
        newFiles.push({ url, name: file.name, type: file.type });
      }
      const nextFiles = [...(form.sheetFiles || []), ...newFiles];
      await update(editingId, { sheetFiles: nextFiles });
      setForm((f) => ({ ...f, sheetFiles: nextFiles }));
    } catch (err) {
      console.error(err);
      alert("上傳失敗，請確認 Firebase Storage 是否已啟用。");
    }
    setUploadingSheet(false);
  };

  const removeSheet = async (idx) => {
    if (!editingId) return;
    if (!window.confirm("確定要移除這份資料表嗎？")) return;
    const fileToRemove = (form.sheetFiles || [])[idx];
    try {
      if (fileToRemove) {
        const decoded = decodeURIComponent(fileToRemove.url.split("/o/")[1].split("?")[0]);
        await deleteObject(ref(storage, decoded));
      }
    } catch {
      // 檔案本體刪不掉也不擋
    }
    const nextFiles = (form.sheetFiles || []).filter((_, i) => i !== idx);
    await update(editingId, { sheetFiles: nextFiles });
    setForm((f) => ({ ...f, sheetFiles: nextFiles }));
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
  const analyzeImportFile = async (e) => {
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

      const matchedIds = new Set();
      const clearRows = []; // { row, existing(可能undefined), relinked }
      const leftoverRows = [];

      // 第一輪：委託書編號比對 ＋ 嚴格交叉比對（案名/坪數/房型/總價都對得上）
      rowsToImport.forEach((row) => {
        if (!row.listingNo) return;
        let existing = existingByListingNo[row.listingNo];
        let relinked = false;

        if (!existing) {
          const candidate = items.find((p) => {
            if (!p.listingNo || matchedIds.has(p.id)) return false;
            if (existingByListingNo[row.listingNo]) return false;
            if (!row.title || (p.title || "").trim() !== row.title.trim()) return false;
            const pingDiff = Math.abs(Number(p.titlePing || 0) - Number(row.titlePing || 0));
            if (pingDiff > 0.3) return false;
            if (String(p.layout || "").trim() !== String(row.layout || "").trim()) return false;
            const oldPrice = Number(p.totalPrice || 0);
            const newPrice = Number(row.totalPrice || 0);
            if (oldPrice && newPrice && Math.abs(newPrice - oldPrice) / oldPrice > 0.1) return false;
            return true;
          });
          if (candidate) {
            existing = candidate;
            relinked = true;
          }
        }

        if (existing) {
          matchedIds.add(existing.id);
          clearRows.push({ row, existing, relinked });
        } else {
          leftoverRows.push(row);
        }
      });

      // 第二輪：剩下的行，只用「案名一樣」做寬鬆比對，抓出可能是同一間、但其他條件對不齊的
      const ambiguousPairs = [];
      const newRows = [];
      leftoverRows.forEach((row) => {
        const candidate = items.find(
          (p) => p.listingNo && !matchedIds.has(p.id) && row.title && (p.title || "").trim() === row.title.trim()
        );
        if (candidate) {
          matchedIds.add(candidate.id); // 先佔位，避免同一筆existing被兩個ambiguous row搶
          ambiguousPairs.push({ row, existing: candidate });
        } else {
          newRows.push(row);
        }
      });

      const missingCandidates = items.filter(
        (p) => p.listingNo && !matchedIds.has(p.id) && (p.status || "active") === "active"
      );

      setImportAnalysis({ clearRows, newRows, ambiguousPairs, missingCandidates });
      const initialDecisions = {};
      ambiguousPairs.forEach((_, idx) => (initialDecisions[idx] = "separate"));
      setImportDecisions(initialDecisions);

      if (ambiguousPairs.length === 0) {
        await commitImport({ clearRows, newRows, ambiguousPairs: [], missingCandidates }, {});
      }
    } catch (err) {
      console.error(err);
      alert("匯入失敗，請確認檔案格式是否跟範本一致。");
    }
  };

  const commitImport = async (analysis, decisions) => {
    const { clearRows, newRows, ambiguousPairs, missingCandidates } = analysis;
    const ops = [];
    let newCount = 0;
    let updateCount = 0;
    let priceChangedCount = 0;
    let relinkedCount = 0;
    const finalMatchedIds = new Set();

    const applyUpdate = (row, existing, relinked) => {
      finalMatchedIds.add(existing.id);
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
      if (relinked) {
        ops.push({
          ref: doc(collection(db, `properties/${existing.id}/statusLogs`)),
          data: {
            status: existing.status || "active",
            date: todayStr(),
            note: `委託書編號由 ${existing.listingNo || "（無）"} 換成 ${row.listingNo}，判斷為同一物件`,
            createdAt: serverTimestamp(),
          },
          merge: false,
        });
        relinkedCount++;
      }
      ops.push({ ref: doc(db, "properties", existing.id), data: updates, merge: true });
      updateCount++;
    };

    const applyNew = (row) => {
      const newRef = doc(collection(db, "properties"));
      ops.push({
        ref: newRef,
        data: { ...row, status: "active", statusChangedAt: todayStr(), lastPriceChange: null, customFields: [], createdAt: new Date() },
        merge: false,
      });
      ops.push({
        ref: doc(collection(db, `properties/${newRef.id}/statusLogs`)),
        data: { status: "active", date: todayStr(), createdAt: serverTimestamp() },
        merge: false,
      });
      newCount++;
    };

    clearRows.forEach(({ row, existing, relinked }) => applyUpdate(row, existing, relinked));
    newRows.forEach((row) => applyNew(row));

    ambiguousPairs.forEach((pair, idx) => {
      if (decisions[idx] === "merge") {
        applyUpdate(pair.row, pair.existing, true);
      } else {
        applyNew(pair.row);
        // existing 沒被合併，維持在 missingCandidates 名單裡，等下會被標記暫時不賣
      }
    });

    const missing = missingCandidates.filter((p) => !finalMatchedIds.has(p.id));
    missing.forEach((p) => {
      ops.push({ ref: doc(db, "properties", p.id), data: { status: "onHold", statusChangedAt: todayStr() }, merge: true });
      ops.push({
        ref: doc(collection(db, `properties/${p.id}/statusLogs`)),
        data: { status: "onHold", date: todayStr(), note: "Excel 更新後未再出現，系統自動標記", createdAt: serverTimestamp() },
        merge: false,
      });
    });

    const confirmMsg =
      `這次匯入：\n新增 ${newCount} 筆\n更新 ${updateCount} 筆（其中 ${priceChangedCount} 筆總價異動、${relinkedCount} 筆換委託書編號）\n` +
      `${missing.length} 筆物件將自動標記為「暫時不賣」\n\n地址與備註不會被覆蓋。確定要繼續嗎？`;
    if (!window.confirm(confirmMsg)) return;

    setImporting(true);
    try {
      const CHUNK = 450;
      for (let i = 0; i < ops.length; i += CHUNK) {
        const batch = writeBatch(db);
        ops.slice(i, i + CHUNK).forEach((op) => {
          if (op.merge) batch.set(op.ref, op.data, { merge: true });
          else batch.set(op.ref, op.data);
        });
        await batch.commit();
      }
      alert(`匯入完成：新增 ${newCount} 筆、更新 ${updateCount} 筆（含 ${relinkedCount} 筆換委託書編號）、暫時不賣 ${missing.length} 筆。`);
    } catch (err) {
      console.error(err);
      alert("匯入失敗，請再試一次。");
    }
    setImporting(false);
    setImportAnalysis(null);
    setImportDecisions({});
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
              onChange={analyzeImportFile}
              style={{ display: "none" }}
              disabled={importing}
            />
          </label>
          <button className="btn" onClick={openNew}>
            ＋ 新增物件
          </button>
        </div>
      </div>

      {selectedIds.size > 0 && (
        <div style={{ display: "flex", alignItems: "center", gap: 12, background: "var(--accent-soft)", border: "1px solid var(--accent)", borderRadius: 8, padding: "10px 14px", marginBottom: 16 }}>
          <span style={{ fontSize: 13, color: "var(--accent)", fontWeight: 700 }}>已選 {selectedIds.size} 筆物件</span>
          <button className="btn" onClick={() => setShowShare(true)}>分享給客人</button>
          <button className="btn ghost" onClick={() => setSelectedIds(new Set())}>清除選取</button>
        </div>
      )}

      {showShare && (
        <PropertyShare
          properties={items.filter((p) => selectedIds.has(p.id))}
          onClose={() => setShowShare(false)}
        />
      )}

      {importAnalysis && importAnalysis.ambiguousPairs.length > 0 && (
        <div className="panel" style={{ marginBottom: 20, border: "1.5px solid var(--brass)" }}>
          <div className="section-title" style={{ fontSize: 15 }}>
            有 {importAnalysis.ambiguousPairs.length} 筆案名相同、但其他資料對不齊，請確認是不是同一間
          </div>
          <div style={{ fontSize: 12, color: "var(--muted)", marginBottom: 16 }}>
            預設是「當作不同物件」（比較安全，不會誤合併）。確認完按最下面「確認並匯入」才會真正寫入。
          </div>
          {importAnalysis.ambiguousPairs.map((pair, idx) => (
            <div key={idx} style={{ background: "#FAFAF8", border: "1px solid var(--border)", borderRadius: 8, padding: 14, marginBottom: 12 }}>
              <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 8 }}>{pair.row.title}</div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, fontSize: 12, marginBottom: 10 }}>
                <div>
                  <div style={{ color: "var(--muted)", fontWeight: 700, marginBottom: 4 }}>資料庫裡現有的</div>
                  委託書編號：{pair.existing.listingNo || "—"}<br />
                  權狀坪：{pair.existing.titlePing || "—"}　格局：{pair.existing.layout || "—"}<br />
                  總價：{pair.existing.totalPrice || "—"} 萬
                </div>
                <div>
                  <div style={{ color: "var(--brass)", fontWeight: 700, marginBottom: 4 }}>Excel 這次的</div>
                  委託書編號：{pair.row.listingNo || "—"}<br />
                  權狀坪：{pair.row.titlePing || "—"}　格局：{pair.row.layout || "—"}<br />
                  總價：{pair.row.totalPrice || "—"} 萬
                </div>
              </div>
              <div style={{ display: "flex", gap: 8 }}>
                <button
                  className={importDecisions[idx] === "merge" ? "btn" : "btn ghost"}
                  onClick={() => setImportDecisions({ ...importDecisions, [idx]: "merge" })}
                >
                  視為同一物件（合併）
                </button>
                <button
                  className={importDecisions[idx] === "separate" ? "btn" : "btn ghost"}
                  onClick={() => setImportDecisions({ ...importDecisions, [idx]: "separate" })}
                >
                  當作不同物件（分開）
                </button>
              </div>
            </div>
          ))}
          <div style={{ display: "flex", gap: 10, marginTop: 6 }}>
            <button className="btn" disabled={importing} onClick={() => commitImport(importAnalysis, importDecisions)}>
              {importing ? "匯入中…" : "確認並匯入"}
            </button>
            <button className="btn ghost" onClick={() => { setImportAnalysis(null); setImportDecisions({}); }}>
              取消這次匯入
            </button>
          </div>
        </div>
      )}

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
              <label>物件資料表（PDF 或圖片，可一次選多頁，方便隨時查看、傳給客戶）</label>
              {!editingId && (
                <div style={{ fontSize: 12, color: "var(--muted)" }}>
                  請先儲存這筆物件，之後點進來編輯就可以上傳資料表了
                </div>
              )}
              {editingId && (
                <>
                  {(form.sheetFiles || []).map((f, idx) => (
                    <div key={idx} style={{ marginBottom: 10, background: "#FAFAF8", border: "1px solid var(--border)", borderRadius: 8, padding: 10 }}>
                      {f.type && f.type.startsWith("image/") ? (
                        <img src={f.url} alt={f.name} style={{ maxWidth: 200, borderRadius: 8, border: "1px solid var(--border)", display: "block", marginBottom: 8 }} />
                      ) : (
                        <div style={{ fontSize: 13, marginBottom: 8 }}>📄 {f.name}</div>
                      )}
                      <div style={{ display: "flex", gap: 8 }}>
                        <a href={f.url} target="_blank" rel="noreferrer" className="btn ghost" style={{ textDecoration: "none", display: "inline-block" }}>
                          開啟／下載
                        </a>
                        <button type="button" className="btn ghost" onClick={() => removeSheet(idx)}>
                          移除
                        </button>
                      </div>
                    </div>
                  ))}
                  <label className="btn ghost" style={{ cursor: "pointer", display: "inline-block" }}>
                    {uploadingSheet ? "上傳中…" : "新增檔案"}
                    <input type="file" accept=".pdf,image/*" multiple onChange={handleSheetUpload} style={{ display: "none" }} disabled={uploadingSheet} />
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
            <div style={{ display: "flex", gap: 12, alignItems: "flex-start" }}>
              <input
                type="checkbox"
                checked={selectedIds.has(p.id)}
                onClick={(e) => e.stopPropagation()}
                onChange={() => toggleSelect(p.id)}
                style={{ marginTop: 4, width: 16, height: 16, flexShrink: 0 }}
              />
              <div>
              <div className="name">
                {p.title} <span className="tag">{p.category}</span>
                {(p.sheetFiles || []).length > 0 && <span title="已上傳資料表"> 📄</span>}
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
