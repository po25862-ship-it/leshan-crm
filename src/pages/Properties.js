import React, { useState, useMemo } from "react";
import * as XLSX from "xlsx";
import { writeBatch, doc, collection } from "firebase/firestore";
import { ref, uploadBytes, getDownloadURL, deleteObject } from "firebase/storage";
import { db, storage } from "../firebase";
import { useCollection } from "../hooks/useCollection";

const CATEGORIES = [
  "公寓", "電梯大樓", "套房", "別墅", "透天厝", "建地", "店面",
  "工廠", "辦公", "建物類其他", "工業地", "農地", "農舍", "廠辦", "土地類其他",
];

const STORES = ["長庚直營店", "長庚捷運直營店", "文青捷運直營店", "捷運樂善直營店"];

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
  sold: false,
  sheetFileUrl: null,
  sheetFileName: null,
  sheetFileType: null,
  customFields: [],
};

export default function Properties() {
  const { items, add, update, remove } = useCollection("properties", "createdAt");
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState(emptyForm);
  const [keyword, setKeyword] = useState("");
  const [activeCategory, setActiveCategory] = useState("全部");
  const [viewMode, setViewMode] = useState("active"); // active | sold
  const [importing, setImporting] = useState(false);
  const [uploadingSheet, setUploadingSheet] = useState(false);

  const openNew = () => {
    setForm(emptyForm);
    setEditingId(null);
    setShowForm(true);
  };

  const openEdit = (item) => {
    setForm({ ...emptyForm, ...item, customFields: item.customFields || [] });
    setEditingId(item.id);
    setShowForm(true);
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
    if (editingId) {
      await update(editingId, form);
    } else {
      await add(form);
    }
    setShowForm(false);
  };

  const markSold = async (item) => {
    await update(item.id, { sold: true });
  };
  const restoreSold = async (item) => {
    await update(item.id, { sold: false });
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
      // 檔案本體刪不掉也不擋，至少把資料庫的參照清掉
    }
    await update(editingId, { sheetFileUrl: null, sheetFileName: null, sheetFileType: null });
    setForm((f) => ({ ...f, sheetFileUrl: null, sheetFileName: null, sheetFileType: null }));
  };

  // ---- 分類統計（比照 Excel 索引總覽）----
  const activeItems = items.filter((p) => !p.sold);
  const soldItems = items.filter((p) => p.sold);
  const categoryCounts = useMemo(() => {
    const map = {};
    activeItems.forEach((p) => {
      const c = p.category || "未分類";
      map[c] = (map[c] || 0) + 1;
    });
    return map;
  }, [activeItems]);

  const pool = viewMode === "active" ? activeItems : soldItems;
  const filtered = pool.filter((p) => {
    if (activeCategory !== "全部" && (p.category || "未分類") !== activeCategory) return false;
    if (!keyword.trim()) return true;
    const k = keyword.trim();
    return (
      (p.title || "").includes(k) ||
      (p.address || "").includes(k) ||
      (p.listingNo || "").includes(k) ||
      (p.store || "").includes(k)
    );
  });

  // ---- 匯入 Excel ----
  const handleImportFile = async (e) => {
    const file = e.target.files[0];
    e.target.value = ""; // 允許重複選同一檔案
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
          if (!r || !r[1]) continue; // 沒有委託書編號就跳過（通常代表空列）
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
            websiteUrl: String(r[15] || ""),
            notes: String(r[17] || ""),
            category: cat,
            sold: false,
            customFields: [],
          });
        }
      });

      if (rowsToImport.length === 0) {
        alert("在這個檔案裡沒有找到符合格式的資料列，請確認分頁名稱與欄位順序跟範本一致。");
        return;
      }

      if (
        !window.confirm(
          `在檔案裡找到 ${rowsToImport.length} 筆物件，確定要全部匯入嗎？\n（重複匯入同一份檔案會產生重複資料，建議只匯入一次）`
        )
      ) {
        return;
      }

      setImporting(true);
      const CHUNK = 400;
      for (let i = 0; i < rowsToImport.length; i += CHUNK) {
        const batch = writeBatch(db);
        rowsToImport.slice(i, i + CHUNK).forEach((data) => {
          const ref = doc(collection(db, "properties"));
          batch.set(ref, { ...data, createdAt: new Date() });
        });
        await batch.commit();
      }
      setImporting(false);
      alert(`匯入完成，共新增 ${rowsToImport.length} 筆物件。`);
    } catch (err) {
      console.error(err);
      setImporting(false);
      alert("匯入失敗，請確認檔案格式是否跟範本一致。");
    }
  };

  const fieldStyle2 = { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 };
  const fieldStyle3 = { display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 14 };

  return (
    <main>
      <div className="top-actions">
        <div className="section-title">
          物件（{viewMode === "active" ? activeItems.length : soldItems.length}）
        </div>
        <div style={{ display: "flex", gap: 10 }}>
          <label className="btn ghost" style={{ cursor: "pointer" }}>
            {importing ? "匯入中…" : "匯入 Excel"}
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

      {/* 在售／已售出 切換 */}
      <div style={{ display: "flex", gap: 8, marginBottom: 14 }}>
        <button
          className={viewMode === "active" ? "btn" : "btn ghost"}
          onClick={() => setViewMode("active")}
        >
          在售（{activeItems.length}）
        </button>
        <button
          className={viewMode === "sold" ? "btn" : "btn ghost"}
          onClick={() => setViewMode("sold")}
        >
          已售出（{soldItems.length}）
        </button>
      </div>

      {/* 分類篩選（比照 Excel 索引總覽的分類） */}
      {viewMode === "active" && (
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 18 }}>
          <button
            className={activeCategory === "全部" ? "tag" : "tag"}
            style={{
              cursor: "pointer",
              border: "none",
              background: activeCategory === "全部" ? "var(--accent)" : "var(--accent-soft)",
              color: activeCategory === "全部" ? "#fff" : "var(--accent)",
            }}
            onClick={() => setActiveCategory("全部")}
          >
            全部（{activeItems.length}）
          </button>
          {CATEGORIES.map((c) => (
            <button
              key={c}
              style={{
                cursor: "pointer",
                border: "none",
                borderRadius: 20,
                padding: "2px 10px",
                fontSize: 10,
                fontWeight: 700,
                background: activeCategory === c ? "var(--accent)" : "var(--accent-soft)",
                color: activeCategory === c ? "#fff" : "var(--accent)",
              }}
              onClick={() => setActiveCategory(c)}
            >
              {c}（{categoryCounts[c] || 0}）
            </button>
          ))}
        </div>
      )}

      <div style={{ marginBottom: 18 }}>
        <input
          value={keyword}
          onChange={(e) => setKeyword(e.target.value)}
          placeholder="搜尋案名、地址、委託書編號、店名…"
          style={{
            width: "100%",
            maxWidth: 360,
            padding: "10px 12px",
            border: "1px solid var(--border)",
            borderRadius: 7,
            fontSize: 14,
          }}
        />
      </div>

      {showForm && (
        <div className="panel" style={{ marginBottom: 24, maxWidth: 720 }}>
          <form className="form-grid" onSubmit={onSubmit}>
            <div style={fieldStyle2}>
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
                  <a
                    href={form.websiteUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="btn ghost"
                    style={{ textDecoration: "none", whiteSpace: "nowrap", display: "flex", alignItems: "center" }}
                  >
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
                        <img
                          src={form.sheetFileUrl}
                          alt="物件資料表"
                          style={{ maxWidth: 200, borderRadius: 8, border: "1px solid var(--border)", display: "block", marginBottom: 8 }}
                        />
                      ) : (
                        <div style={{ fontSize: 13, marginBottom: 8 }}>📄 {form.sheetFileName}</div>
                      )}
                      <div style={{ display: "flex", gap: 8 }}>
                        <a
                          href={form.sheetFileUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="btn ghost"
                          style={{ textDecoration: "none", display: "inline-block" }}
                        >
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
                    <input
                      type="file"
                      accept=".pdf,image/*"
                      onChange={handleSheetUpload}
                      style={{ display: "none" }}
                      disabled={uploadingSheet}
                    />
                  </label>
                </>
              )}
            </div>

            <div className="form-field">
              <label>自訂欄位（需要記錄其他資訊時，自己加欄位）</label>
              {form.customFields.map((f, idx) => (
                <div key={idx} style={{ display: "flex", gap: 8, marginBottom: 8 }}>
                  <input
                    value={f.label}
                    onChange={(e) => updateCustomField(idx, "label", e.target.value)}
                    placeholder="欄位名稱"
                    style={{ flex: 1 }}
                  />
                  <input
                    value={f.value}
                    onChange={(e) => updateCustomField(idx, "value", e.target.value)}
                    placeholder="內容"
                    style={{ flex: 1 }}
                  />
                  <button type="button" className="btn ghost" onClick={() => removeCustomField(idx)}>
                    刪除
                  </button>
                </div>
              ))}
              <button type="button" className="btn ghost" onClick={addCustomField}>
                ＋ 新增自訂欄位
              </button>
            </div>

            <div style={{ display: "flex", gap: 10 }}>
              <button className="btn" type="submit">
                {editingId ? "儲存變更" : "新增物件"}
              </button>
              <button className="btn ghost" type="button" onClick={() => setShowForm(false)}>
                取消
              </button>
              {editingId && !form.sold && (
                <button
                  className="btn ghost"
                  type="button"
                  onClick={async () => {
                    await markSold({ id: editingId });
                    setShowForm(false);
                  }}
                >
                  標記為已售出
                </button>
              )}
              {editingId && form.sold && (
                <button
                  className="btn ghost"
                  type="button"
                  onClick={async () => {
                    await restoreSold({ id: editingId });
                    setShowForm(false);
                  }}
                >
                  復原為在售
                </button>
              )}
              {editingId && (
                <button
                  className="btn danger"
                  type="button"
                  onClick={async () => {
                    await deleteForever({ id: editingId, title: form.title });
                    setShowForm(false);
                  }}
                >
                  永久刪除
                </button>
              )}
            </div>
          </form>
        </div>
      )}

      <div className="panel">
        {filtered.length === 0 && (
          <div className="empty-state">
            <div className="big">
              {items.length === 0 ? "還沒有物件資料" : "找不到符合的物件"}
            </div>
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
                {p.floor && <>{p.floor}　</>}
                {p.layout && <>{p.layout}　</>}
                {p.titlePing && <>{p.titlePing} 坪　</>}
                {p.totalPrice && <>總價 {p.totalPrice} 萬　</>}
                {p.occupancy && <>{p.occupancy}</>}
              </div>
            </div>
            <div className="actions" onClick={(e) => e.stopPropagation()}>
              {p.websiteUrl && (
                <a
                  href={p.websiteUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="btn ghost"
                  style={{ textDecoration: "none", display: "inline-flex", alignItems: "center" }}
                >
                  開啟網頁
                </a>
              )}
              {viewMode === "active" ? (
                <button className="btn ghost" onClick={() => markSold(p)}>
                  標記已售出
                </button>
              ) : (
                <button className="btn ghost" onClick={() => restoreSold(p)}>
                  復原在售
                </button>
              )}
              <button className="btn ghost" onClick={() => openEdit(p)}>
                編輯
              </button>
            </div>
          </div>
        ))}
      </div>
    </main>
  );
}
