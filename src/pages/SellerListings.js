import React, { useState } from "react";
import { doc, updateDoc, addDoc, collection, serverTimestamp } from "firebase/firestore";
import { ref, uploadBytes, getDownloadURL, deleteObject } from "firebase/storage";
import { db, storage } from "../firebase";
import { useCollection } from "../hooks/useCollection";
import { formatDate, todayStr } from "../lib/dates";
import { PROPERTY_CATEGORIES, PROPERTY_STORES } from "../lib/propertyConstants";

const STATUS_LABELS = { tracking: "追蹤中", listed: "已委託", expired: "已過期", sold: "已出售" };
const STATUS_ORDER = ["tracking", "listed", "expired", "sold"];

const emptyListing = {
  title: "",
  propertyId: null,
  category: PROPERTY_CATEGORIES[0],
  store: PROPERTY_STORES[3],
  propertyUrl: "",
  propertyAddress: "",
  price: "",
  status: "tracking",
  listingNo: "",
  agreementType: "一般",
  agreementStartDate: "",
  agreementEndDate: "",
  askingPrice: "",
  floorPrice: "",
  adPlatforms: [],
  documentUrl: null,
  documentName: null,
  documentType: null,
};

// 把文字裡的網址自動變成可點擊連結
function linkify(text) {
  if (!text) return null;
  const parts = text.split(/(https?:\/\/[^\s]+)/g);
  return parts.map((part, i) =>
    /^https?:\/\//.test(part) ? (
      <a key={i} href={part} target="_blank" rel="noreferrer">
        {part}
      </a>
    ) : (
      <React.Fragment key={i}>{part}</React.Fragment>
    )
  );
}

function ProgressLog({ contactId, listingId }) {
  const { items, add, remove } = useCollection(
    `contacts/${contactId}/listings/${listingId}/progressLogs`,
    "date"
  );
  const [date, setDate] = useState(todayStr());
  const [content, setContent] = useState("");

  const sorted = [...items].sort((a, b) => (a.date < b.date ? 1 : -1));

  const onAdd = async (e) => {
    e.preventDefault();
    if (!content.trim()) return;
    await add({ date, content });
    setContent("");
  };

  return (
    <div style={{ marginTop: 14, borderTop: "1px solid var(--border)", paddingTop: 12 }}>
      <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 8 }}>銷售進度回報</div>
      <form onSubmit={onAdd} style={{ display: "flex", gap: 8, marginBottom: 10 }}>
        <input
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
          style={{ width: 140, padding: "8px 10px", border: "1px solid var(--border)", borderRadius: 7, fontSize: 12 }}
        />
        <input
          value={content}
          onChange={(e) => setContent(e.target.value)}
          placeholder="例如：591 詢問度增加、屋主同意降價…（含網址會自動變連結）"
          style={{ flex: 1, padding: "8px 10px", border: "1px solid var(--border)", borderRadius: 7, fontSize: 12 }}
        />
        <button className="btn ghost" type="submit">新增</button>
      </form>
      {sorted.length === 0 && <div style={{ fontSize: 12, color: "var(--muted)" }}>還沒有進度回報</div>}
      {sorted.map((log) => (
        <div key={log.id} style={{ display: "flex", justifyContent: "space-between", padding: "8px 0", borderBottom: "1px solid var(--border)", fontSize: 12 }}>
          <div>
            <span className="mono" style={{ color: "var(--muted)", marginRight: 8 }}>{formatDate(log.date)}</span>
            {linkify(log.content)}
          </div>
          <button onClick={() => remove(log.id)} style={{ border: "none", background: "none", color: "var(--muted)", cursor: "pointer", fontSize: 11 }}>
            刪除
          </button>
        </div>
      ))}
    </div>
  );
}

export default function SellerListings({ contactId }) {
  const { items, add, update, remove } = useCollection(`contacts/${contactId}/listings`, "createdAt");
  const { items: properties } = useCollection("properties", "title");
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState(emptyListing);
  const [uploading, setUploading] = useState(false);
  const [syncingProperty, setSyncingProperty] = useState(false);

  const openNew = () => {
    setForm(emptyListing);
    setEditingId(null);
    setShowForm(true);
  };
  const openEdit = (item) => {
    setForm({ ...emptyListing, ...item, adPlatforms: item.adPlatforms || [] });
    setEditingId(item.id);
    setShowForm(true);
  };

  const addPlatform = () => setForm({ ...form, adPlatforms: [...form.adPlatforms, { name: "", url: "", expiryDate: "" }] });
  const updatePlatform = (idx, key, val) => {
    const next = [...form.adPlatforms];
    next[idx] = { ...next[idx], [key]: val };
    setForm({ ...form, adPlatforms: next });
  };
  const removePlatform = (idx) => setForm({ ...form, adPlatforms: form.adPlatforms.filter((_, i) => i !== idx) });

  const onSubmit = async (e) => {
    e.preventDefault();
    if (!form.title.trim()) return;

    // 如果標題剛好對到現有物件的案名，自動視為連結（沒對到就維持獨立輸入）
    let resolvedForm = { ...form };
    if (!resolvedForm.propertyId) {
      const match = properties.find((p) => p.title === form.title.trim());
      if (match) resolvedForm.propertyId = match.id;
    }

    if (editingId) {
      await update(editingId, resolvedForm);
      if (resolvedForm.status === "listed") {
        try {
          await syncToPropertyDatabase(resolvedForm, editingId);
        } catch (err) {
          console.error("同步到物件資料庫失敗", err);
        }
      }
    } else {
      const ref2 = await add(resolvedForm);
      if (resolvedForm.status === "listed") {
        try {
          await syncToPropertyDatabase(resolvedForm, ref2.id);
        } catch (err) {
          console.error("同步到物件資料庫失敗", err);
        }
      }
    }
    setShowForm(false);
  };

  const syncToPropertyDatabase = async (listing, listingId) => {
    const propertyData = {
      title: listing.title,
      address: listing.propertyAddress,
      totalPrice: listing.askingPrice || listing.price || "",
      listingNo: listing.listingNo,
      websiteUrl: listing.propertyUrl,
      category: listing.category || PROPERTY_CATEGORIES[0],
      store: listing.store || PROPERTY_STORES[3],
      status: "active",
    };
    if (listing.propertyId) {
      await updateDoc(doc(db, "properties", listing.propertyId), propertyData);
      return listing.propertyId;
    }
    const newRef = await addDoc(collection(db, "properties"), {
      ...propertyData,
      statusChangedAt: todayStr(),
      lastPriceChange: null,
      customFields: [],
      createdAt: serverTimestamp(),
    });
    await addDoc(collection(db, `properties/${newRef.id}/statusLogs`), {
      status: "active",
      date: todayStr(),
      note: "由賣方委託自動建立",
      createdAt: serverTimestamp(),
    });
    await update(listingId, { propertyId: newRef.id });
    return newRef.id;
  };

  const changeStatus = async (item, status) => {
    await update(item.id, { status });
    if (status === "listed") {
      setSyncingProperty(true);
      try {
        await syncToPropertyDatabase({ ...item, status }, item.id);
      } catch (err) {
        console.error("同步到物件資料庫失敗", err);
      }
      setSyncingProperty(false);
    }
    if (editingId === item.id) setForm((f) => ({ ...f, status }));
  };

  const handleUpload = async (e) => {
    const file = e.target.files[0];
    e.target.value = "";
    if (!file || !editingId) return;
    setUploading(true);
    try {
      const ext = file.name.split(".").pop();
      const path = `sellerListings/${contactId}/${editingId}/document.${ext}`;
      const storageRef = ref(storage, path);
      await uploadBytes(storageRef, file);
      const url = await getDownloadURL(storageRef);
      await update(editingId, { documentUrl: url, documentName: file.name, documentType: file.type });
      setForm((f) => ({ ...f, documentUrl: url, documentName: file.name, documentType: file.type }));
    } catch (err) {
      console.error(err);
      alert("上傳失敗，請確認 Firebase Storage 是否已啟用。");
    }
    setUploading(false);
  };

  const removeDocument = async () => {
    if (!editingId || !form.documentUrl) return;
    try {
      const ext = form.documentName ? form.documentName.split(".").pop() : "";
      await deleteObject(ref(storage, `sellerListings/${contactId}/${editingId}/document.${ext}`));
    } catch {
      // 檔案本體刪不掉也不擋
    }
    await update(editingId, { documentUrl: null, documentName: null, documentType: null });
    setForm((f) => ({ ...f, documentUrl: null, documentName: null, documentType: null }));
  };

  const isListed = form.status === "listed" || form.status === "expired" || form.status === "sold";

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
        <div style={{ fontSize: 13, fontWeight: 700 }}>委託物件（{items.length}）</div>
        <button className="btn ghost" onClick={openNew} style={{ fontSize: 12 }}>＋ 新增委託物件</button>
      </div>

      {showForm && (
        <form onSubmit={onSubmit} style={{ background: "#FAFAF8", border: "1px solid var(--border)", borderRadius: 8, padding: 14, marginBottom: 14 }}>
          <div className="form-field">
            <label>物件名稱／案名（打字時若跟現有物件案名一致會自動連結，也可以先自由輸入）</label>
            <input list="seller-property-options" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} required />
            <datalist id="seller-property-options">
              {properties.map((p) => (
                <option key={p.id} value={p.title} />
              ))}
            </datalist>
            {form.propertyId && (
              <div style={{ fontSize: 11, color: "var(--accent)", marginTop: 4 }}>
                ✓ 已連結物件資料庫裡的既有物件
              </div>
            )}
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
            <div className="form-field">
              <label>類別</label>
              <select value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}>
                {PROPERTY_CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <div className="form-field">
              <label>店名</label>
              <select value={form.store} onChange={(e) => setForm({ ...form, store: e.target.value })}>
                {PROPERTY_STORES.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
          </div>
          <div className="form-field">
            <label>物件地址</label>
            <input value={form.propertyAddress} onChange={(e) => setForm({ ...form, propertyAddress: e.target.value })} />
          </div>
          <div className="form-field">
            <label>物件網址</label>
            <div style={{ display: "flex", gap: 8 }}>
              <input style={{ flex: 1 }} value={form.propertyUrl} onChange={(e) => setForm({ ...form, propertyUrl: e.target.value })} />
              {form.propertyUrl && (
                <a href={form.propertyUrl} target="_blank" rel="noreferrer" className="btn ghost" style={{ textDecoration: "none" }}>開啟</a>
              )}
            </div>
          </div>
          <div className="form-field">
            <label>價格（萬）</label>
            <input value={form.price} onChange={(e) => setForm({ ...form, price: e.target.value })} />
          </div>
          <div className="form-field">
            <label>狀態</label>
            {editingId ? (
              <select value={form.status} onChange={(e) => changeStatus(form, e.target.value)}>
                {STATUS_ORDER.map((s) => <option key={s} value={s}>{STATUS_LABELS[s]}</option>)}
              </select>
            ) : (
              <select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}>
                {STATUS_ORDER.map((s) => <option key={s} value={s}>{STATUS_LABELS[s]}</option>)}
              </select>
            )}
            {form.status !== "listed" && (
              <div style={{ fontSize: 11, color: "var(--muted)", marginTop: 4 }}>
                轉為「已委託」時，會自動在【物件】資料庫建立或更新對應的物件資料
              </div>
            )}
          </div>

          {isListed && (
            <>
              <div className="form-field">
                <label>委託書編號</label>
                <input value={form.listingNo} onChange={(e) => setForm({ ...form, listingNo: e.target.value })} />
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 14 }}>
                <div className="form-field">
                  <label>委託形式</label>
                  <select value={form.agreementType} onChange={(e) => setForm({ ...form, agreementType: e.target.value })}>
                    <option value="一般">一般</option>
                    <option value="專任">專任</option>
                  </select>
                </div>
                <div className="form-field">
                  <label>委託起始日</label>
                  <input type="date" value={form.agreementStartDate} onChange={(e) => setForm({ ...form, agreementStartDate: e.target.value })} />
                </div>
                <div className="form-field">
                  <label>委託到期日</label>
                  <input type="date" value={form.agreementEndDate} onChange={(e) => setForm({ ...form, agreementEndDate: e.target.value })} />
                </div>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
                <div className="form-field">
                  <label>開價（萬）</label>
                  <input value={form.askingPrice} onChange={(e) => setForm({ ...form, askingPrice: e.target.value })} />
                </div>
                <div className="form-field">
                  <label>底價（萬）</label>
                  <input value={form.floorPrice} onChange={(e) => setForm({ ...form, floorPrice: e.target.value })} />
                </div>
              </div>
              <div className="form-field">
                <label>廣告網站（可自由新增，各自可設到期日期）</label>
                {form.adPlatforms.map((p, idx) => (
                  <div key={idx} style={{ display: "flex", gap: 8, marginBottom: 8 }}>
                    <input value={p.name} onChange={(e) => updatePlatform(idx, "name", e.target.value)} placeholder="平台名稱，例如：591" style={{ width: 100 }} />
                    <input value={p.url} onChange={(e) => updatePlatform(idx, "url", e.target.value)} placeholder="廣告網址" style={{ flex: 1 }} />
                    <input type="date" value={p.expiryDate} onChange={(e) => updatePlatform(idx, "expiryDate", e.target.value)} style={{ width: 140 }} />
                    <button type="button" className="btn ghost" onClick={() => removePlatform(idx)}>刪除</button>
                  </div>
                ))}
                <button type="button" className="btn ghost" onClick={addPlatform}>＋ 新增廣告平台</button>
              </div>
            </>
          )}

          <div className="form-field">
            <label>上傳資料（圖片或 PDF）</label>
            {!editingId && <div style={{ fontSize: 11, color: "var(--muted)" }}>請先儲存這筆委託物件，之後編輯時就可以上傳</div>}
            {editingId && (
              <>
                {form.documentUrl && (
                  <div style={{ marginBottom: 8 }}>
                    {form.documentType && form.documentType.startsWith("image/") ? (
                      <img src={form.documentUrl} alt="委託資料" style={{ maxWidth: 180, borderRadius: 8, border: "1px solid var(--border)", display: "block", marginBottom: 6 }} />
                    ) : (
                      <div style={{ fontSize: 12 }}>📄 {form.documentName}</div>
                    )}
                    <div style={{ display: "flex", gap: 8, marginTop: 6 }}>
                      <a href={form.documentUrl} target="_blank" rel="noreferrer" className="btn ghost" style={{ textDecoration: "none" }}>開啟／下載</a>
                      <button type="button" className="btn ghost" onClick={removeDocument}>移除</button>
                    </div>
                  </div>
                )}
                <label className="btn ghost" style={{ cursor: "pointer", display: "inline-block" }}>
                  {uploading ? "上傳中…" : form.documentUrl ? "重新上傳" : "上傳資料"}
                  <input type="file" accept=".pdf,image/*" onChange={handleUpload} style={{ display: "none" }} disabled={uploading} />
                </label>
              </>
            )}
          </div>

          <div style={{ display: "flex", gap: 10, marginTop: 10 }}>
            <button className="btn" type="submit" disabled={syncingProperty}>
              {syncingProperty ? "同步物件資料中…" : editingId ? "儲存變更" : "新增委託物件"}
            </button>
            <button className="btn ghost" type="button" onClick={() => setShowForm(false)}>取消</button>
            {editingId && (
              <button
                className="btn danger"
                type="button"
                onClick={async () => {
                  if (window.confirm("確定要刪除這筆委託物件嗎？")) {
                    await remove(editingId);
                    setShowForm(false);
                  }
                }}
              >
                刪除
              </button>
            )}
          </div>

          {editingId && <ProgressLog contactId={contactId} listingId={editingId} />}
        </form>
      )}

      {items.length === 0 && !showForm && (
        <div style={{ fontSize: 12, color: "var(--muted)" }}>還沒有委託物件</div>
      )}
      {items.map((item) => (
        <div key={item.id} onClick={() => openEdit(item)} style={{ cursor: "pointer", background: "#fff", border: "1px solid var(--border)", borderRadius: 8, padding: 12, marginBottom: 10 }}>
          <div style={{ display: "flex", justifyContent: "space-between" }}>
            <div style={{ fontWeight: 700, fontSize: 13 }}>{item.title}</div>
            <span className="tag">{STATUS_LABELS[item.status] || item.status}</span>
          </div>
          <div style={{ fontSize: 11, color: "var(--muted)", marginTop: 4 }}>
            {item.propertyAddress}
            {item.price && <>　價格：{item.price} 萬</>}
            {item.askingPrice && <>　開價：{item.askingPrice} 萬</>}
            {item.agreementType && item.status === "listed" && <>　{item.agreementType}委託</>}
            {item.agreementEndDate && item.status === "listed" && <>　到期：{formatDate(item.agreementEndDate)}</>}
          </div>
        </div>
      ))}
    </div>
  );
}
