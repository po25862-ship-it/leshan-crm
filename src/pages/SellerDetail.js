import React, { useState, useEffect } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { doc, updateDoc, addDoc, deleteDoc, collection, serverTimestamp } from "firebase/firestore";
import { ref, uploadBytes, getDownloadURL, deleteObject } from "firebase/storage";
import { db, storage } from "../firebase";
import { useDoc } from "../hooks/useDoc";
import { useCollection } from "../hooks/useCollection";
import { formatDate, todayStr } from "../lib/dates";
import { withAgid } from "../lib/url";
import { PROPERTY_CATEGORIES, PROPERTY_STORES } from "../lib/propertyConstants";
import ContactInteractions from "./ContactInteractions";
import SellerAppointments from "./SellerAppointments";
import { useGoogleAuth } from "../GoogleAuthContext";
import RocDateHint from "./RocDateHint";

const STATUS_LABELS = { tracking: "追蹤中", listed: "已委託", expired: "已過期", sold: "已出售" };
const STATUS_ORDER = ["tracking", "listed", "expired", "sold"];

function linkify(text) {
  if (!text) return null;
  const parts = text.split(/(https?:\/\/[^\s]+)/g);
  return parts.map((part, i) =>
    /^https?:\/\//.test(part) ? (
      <a key={i} href={part} target="_blank" rel="noreferrer">{part}</a>
    ) : (
      <React.Fragment key={i}>{part}</React.Fragment>
    )
  );
}

function ProgressLog({ contactId, listingId }) {
  const { items, add, remove } = useCollection(`contacts/${contactId}/listings/${listingId}/progressLogs`, "date");
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
    <div>
      <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 12 }}>銷售進度回報</div>
      <form onSubmit={onAdd} style={{ display: "flex", gap: 8, marginBottom: 14 }}>
        <input type="date" value={date} onChange={(e) => setDate(e.target.value)} style={{ width: 150, padding: "9px 10px", border: "1px solid var(--border)", borderRadius: 7, fontSize: 13 }} />
        <input
          value={content}
          onChange={(e) => setContent(e.target.value)}
          placeholder="例如：591 詢問度增加、屋主同意降價…（含網址會自動變連結）"
          style={{ flex: 1, padding: "9px 10px", border: "1px solid var(--border)", borderRadius: 7, fontSize: 13 }}
        />
        <button className="btn" type="submit">新增</button>
      </form>
      {sorted.length === 0 && <div style={{ fontSize: 13, color: "var(--muted)" }}>還沒有進度回報</div>}
      {sorted.map((log) => (
        <div key={log.id} style={{ display: "flex", justifyContent: "space-between", padding: "10px 0", borderBottom: "1px solid var(--border)", fontSize: 13 }}>
          <div><span className="mono" style={{ color: "var(--muted)", marginRight: 10 }}>{formatDate(log.date)}</span>{linkify(log.content)}</div>
          <button onClick={() => remove(log.id)} style={{ border: "none", background: "none", color: "var(--muted)", cursor: "pointer", fontSize: 12 }}>刪除</button>
        </div>
      ))}
    </div>
  );
}

export default function SellerDetail() {
  const { contactId, listingId } = useParams();
  const navigate = useNavigate();
  const listingPath = `contacts/${contactId}/listings/${listingId}`;
  const { data: listing, save: saveListing } = useDoc(listingPath);
  const { data: contact, save: saveContact } = useDoc(`contacts/${contactId}`);
  const { items: properties } = useCollection("properties", "title");
  const { isConnected, createEvent, updateEvent, deleteEvent } = useGoogleAuth();

  const [form, setForm] = useState(null);
  const [ownerForm, setOwnerForm] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [syncing, setSyncing] = useState(false);

  useEffect(() => {
    if (listing && Object.keys(listing).length > 0) {
      setForm({ adPlatforms: [], ...listing });
    }
  }, [listing]);

  useEffect(() => {
    if (contact && Object.keys(contact).length > 0) {
      setOwnerForm({ tags: [], ...contact });
    }
  }, [contact]);

  if (!form || !ownerForm) {
    return <main><div className="panel">載入中…</div></main>;
  }

  const isListed = form.status === "listed" || form.status === "expired" || form.status === "sold";

  const syncToPropertyDatabase = async (data) => {
    const propertyData = {
      title: data.title,
      address: data.propertyAddress,
      totalPrice: data.askingPrice || data.price || "",
      listingNo: data.listingNo,
      websiteUrl: withAgid(data.propertyUrl),
      category: data.category || PROPERTY_CATEGORIES[0],
      store: data.store || PROPERTY_STORES[3],
    };
    if (data.status === "listed") {
      propertyData.status = "active";
    }
    if (data.propertyId) {
      await updateDoc(doc(db, "properties", data.propertyId), propertyData);
      return data.propertyId;
    }
    const newRef = await addDoc(collection(db, "properties"), {
      ...propertyData,
      status: propertyData.status || "active",
      statusChangedAt: todayStr(),
      lastPriceChange: null,
      customFields: [],
      createdAt: serverTimestamp(),
    });
    await addDoc(collection(db, `properties/${newRef.id}/statusLogs`), {
      status: "active", date: todayStr(), note: "由賣方委託自動建立", createdAt: serverTimestamp(),
    });
    return newRef.id;
  };

  const onSave = async () => {
    let resolved = { ...form, propertyUrl: withAgid(form.propertyUrl) };
    if (!resolved.propertyId) {
      const match = properties.find((p) => p.title === (form.title || "").trim());
      if (match) resolved.propertyId = match.id;
    }
    if (resolved.propertyId || resolved.status === "listed") {
      setSyncing(true);
      try {
        const pid = await syncToPropertyDatabase(resolved);
        resolved.propertyId = pid;
      } catch (err) {
        console.error("同步到物件資料庫失敗", err);
      }
      setSyncing(false);
    }

    if (isConnected && resolved.agreementEndDate) {
      setSyncing(true);
      const payload = {
        title: `${resolved.title || "委託"}・委託到期`,
        date: resolved.agreementEndDate,
        notes: `委託形式：${resolved.agreementType || ""}`,
      };
      try {
        if (resolved.agreementEndSyncToCalendar) {
          if (resolved.agreementEndGoogleEventId) {
            await updateEvent(resolved.agreementEndGoogleEventId, payload);
          } else {
            const created = await createEvent(payload);
            resolved.agreementEndGoogleEventId = created.id;
            resolved.agreementEndGoogleEventLink = created.htmlLink;
          }
        } else if (resolved.agreementEndGoogleEventId) {
          await deleteEvent(resolved.agreementEndGoogleEventId);
          resolved.agreementEndGoogleEventId = null;
          resolved.agreementEndGoogleEventLink = null;
        }
      } catch (err) {
        console.error("Google 行事曆同步失敗", err);
      }
      setSyncing(false);
    }

    await saveListing(resolved);
    setForm(resolved);
    navigate(-1);
  };

  const onSaveOwner = async () => {
    await saveContact(ownerForm);
    alert("屋主資料已儲存");
  };

  const onDelete = async () => {
    if (!window.confirm("確定要刪除這筆委託物件嗎？")) return;
    if (form.agreementEndGoogleEventId) {
      try {
        await deleteEvent(form.agreementEndGoogleEventId);
      } catch {
        // 行事曆刪不掉也不擋
      }
    }
    await deleteDoc(doc(db, listingPath));
    navigate("/sellers");
  };

  const updatePlatform = (idx, key, val) => {
    const next = [...form.adPlatforms];
    next[idx] = { ...next[idx], [key]: val };
    setForm({ ...form, adPlatforms: next });
  };
  const addPlatform = () => setForm({ ...form, adPlatforms: [...form.adPlatforms, { name: "", url: "", expiryDate: "" }] });
  const removePlatform = (idx) => setForm({ ...form, adPlatforms: form.adPlatforms.filter((_, i) => i !== idx) });

  const handleUpload = async (e) => {
    const files = Array.from(e.target.files || []);
    e.target.value = "";
    if (files.length === 0) return;
    setUploading(true);
    try {
      const newDocs = [];
      for (const file of files) {
        const safeName = file.name.replace(/[^\w.\-\u4e00-\u9fff]/g, "_");
        const storageRef = ref(storage, `sellerListings/${contactId}/${listingId}/documents/${Date.now()}_${safeName}`);
        await uploadBytes(storageRef, file);
        const url = await getDownloadURL(storageRef);
        newDocs.push({ url, name: file.name, type: file.type });
      }
      const next = { ...form, documents: [...(form.documents || []), ...newDocs] };
      setForm(next);
      await saveListing(next);
    } catch (err) {
      console.error(err);
      alert("上傳失敗，請確認 Firebase Storage 是否已啟用。");
    }
    setUploading(false);
  };

  const removeDocument = async (idx) => {
    const docToRemove = (form.documents || [])[idx];
    try {
      if (docToRemove) {
        // 從網址反推 storage 路徑比較麻煩，直接用已知的下載網址刪除
        const decoded = decodeURIComponent(docToRemove.url.split("/o/")[1].split("?")[0]);
        await deleteObject(ref(storage, decoded));
      }
    } catch {
      // 檔案本體刪不掉也不擋
    }
    const next = { ...form, documents: (form.documents || []).filter((_, i) => i !== idx) };
    setForm(next);
    await saveListing(next);
  };

  return (
    <main>
      <div className="top-actions">
        <Link to="/sellers" className="btn ghost" style={{ textDecoration: "none" }}>← 回賣方列表</Link>
        <div style={{ display: "flex", gap: 10 }}>
          <button className="btn" onClick={onSave} disabled={syncing}>{syncing ? "同步物件中…" : "儲存變更"}</button>
          <button className="btn danger" onClick={onDelete}>刪除</button>
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "340px 1fr", gap: 24, alignItems: "start" }}>
        <div className="panel">
          <div className="section-title" style={{ fontSize: 14 }}>屋主資料</div>
          <div className="form-field">
            <label>姓名</label>
            <input value={ownerForm.name || ""} onChange={(e) => setOwnerForm({ ...ownerForm, name: e.target.value })} />
          </div>
          <div className="form-field">
            <label>電話</label>
            <input value={ownerForm.phone || ""} onChange={(e) => setOwnerForm({ ...ownerForm, phone: e.target.value })} />
          </div>
          <div className="form-field">
            <label>備註</label>
            <textarea rows="2" value={ownerForm.notes || ""} onChange={(e) => setOwnerForm({ ...ownerForm, notes: e.target.value })} />
          </div>
          <button className="btn ghost" onClick={onSaveOwner}>儲存屋主資料</button>

          <div style={{ marginTop: 24, borderTop: "1px solid var(--border)", paddingTop: 16 }}>
            <div className="form-field">
              <label>物件名稱／案名（打字若跟現有物件案名一致，離開欄位時會自動帶入該物件資料）</label>
              <input
                list="seller-detail-property-options"
                value={form.title || ""}
                onChange={(e) => setForm({ ...form, title: e.target.value })}
                onBlur={() => {
                  if (form.propertyId) return; // 已經連結過了，不要覆蓋你後續手動改過的內容
                  const match = properties.find((p) => p.title === (form.title || "").trim());
                  if (match) {
                    setForm((f) => ({
                      ...f,
                      propertyId: match.id,
                      propertyAddress: match.address || f.propertyAddress,
                      propertyUrl: match.websiteUrl || f.propertyUrl,
                      price: match.totalPrice || f.price,
                      category: match.category || f.category,
                      store: match.store || f.store,
                    }));
                  }
                }}
              />
              <datalist id="seller-detail-property-options">
                {properties.map((p) => <option key={p.id} value={p.title} />)}
              </datalist>
              {form.propertyId && (
                <div style={{ fontSize: 11, color: "var(--accent)", marginTop: 4 }}>
                  ✓ 已連結物件資料庫，之後改這裡的地址/網址/價格，存檔時會同步回物件那邊
                </div>
              )}
            </div>
            <div className="form-field">
              <label>物件地址</label>
              <input value={form.propertyAddress || ""} onChange={(e) => setForm({ ...form, propertyAddress: e.target.value })} />
            </div>
            <div className="form-field">
              <label>物件網址</label>
              <div style={{ display: "flex", gap: 8 }}>
                <input style={{ flex: 1 }} value={form.propertyUrl || ""} onChange={(e) => setForm({ ...form, propertyUrl: e.target.value })} />
                {form.propertyUrl && <a href={form.propertyUrl} target="_blank" rel="noreferrer" className="btn ghost" style={{ textDecoration: "none" }}>開啟</a>}
              </div>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
              <div className="form-field">
                <label>類別</label>
                <select value={form.category || PROPERTY_CATEGORIES[0]} onChange={(e) => setForm({ ...form, category: e.target.value })}>
                  {PROPERTY_CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
              <div className="form-field">
                <label>店名</label>
                <select value={form.store || PROPERTY_STORES[3]} onChange={(e) => setForm({ ...form, store: e.target.value })}>
                  {PROPERTY_STORES.map((s) => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>
            </div>
            <div className="form-field">
              <label>價格（萬）</label>
              <input value={form.price || ""} onChange={(e) => setForm({ ...form, price: e.target.value })} />
            </div>
            <div className="form-field">
              <label>狀態</label>
              <select value={form.status || "tracking"} onChange={(e) => setForm({ ...form, status: e.target.value })}>
                {STATUS_ORDER.map((s) => <option key={s} value={s}>{STATUS_LABELS[s]}</option>)}
              </select>
              {form.status !== "listed" && (
                <div style={{ fontSize: 11, color: "var(--muted)", marginTop: 4 }}>轉為「已委託」並儲存時，會自動建立/更新【物件】資料</div>
              )}
            </div>
          </div>

          <div style={{ marginTop: 20, borderTop: "1px solid var(--border)", paddingTop: 16 }}>
            <div className="form-field">
              <label>委託資料（PDF 或圖片，可以一次選多個檔案，或分好幾次上傳）</label>
              {(form.documents || []).map((doc, idx) => (
                <div key={idx} style={{ marginBottom: 10, background: "#FAFAF8", border: "1px solid var(--border)", borderRadius: 8, padding: 10 }}>
                  {doc.type && doc.type.startsWith("image/") ? (
                    <img src={doc.url} alt={doc.name} style={{ maxWidth: 200, borderRadius: 8, border: "1px solid var(--border)", display: "block", marginBottom: 8 }} />
                  ) : (
                    <div style={{ fontSize: 13 }}>📄 {doc.name}</div>
                  )}
                  <div style={{ display: "flex", gap: 8, marginTop: 6 }}>
                    <a href={doc.url} target="_blank" rel="noreferrer" className="btn ghost" style={{ textDecoration: "none" }}>開啟／下載</a>
                    <button className="btn ghost" onClick={() => removeDocument(idx)}>移除</button>
                  </div>
                </div>
              ))}
              <label className="btn ghost" style={{ cursor: "pointer", display: "inline-block" }}>
                {uploading ? "上傳中…" : "新增檔案"}
                <input type="file" accept=".pdf,image/*" multiple onChange={handleUpload} style={{ display: "none" }} disabled={uploading} />
              </label>
            </div>
          </div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
          <div className="panel">
            <div className="section-title" style={{ fontSize: 14 }}>委託細節</div>
            <div className="form-field">
              <label>委託書編號</label>
              <input value={form.listingNo || ""} onChange={(e) => setForm({ ...form, listingNo: e.target.value })} />
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 14 }}>
              <div className="form-field">
                <label>委託形式</label>
                <select value={form.agreementType || "一般"} onChange={(e) => setForm({ ...form, agreementType: e.target.value })}>
                  <option value="一般">一般</option>
                  <option value="專任">專任</option>
                </select>
              </div>
              <div className="form-field">
                <label>委託起始日</label>
                <input type="date" value={form.agreementStartDate || ""} onChange={(e) => setForm({ ...form, agreementStartDate: e.target.value })} />
                <RocDateHint date={form.agreementStartDate} />
              </div>
              <div className="form-field">
                <label>委託到期日</label>
                <input type="date" value={form.agreementEndDate || ""} onChange={(e) => setForm({ ...form, agreementEndDate: e.target.value })} />
                <RocDateHint date={form.agreementEndDate} />
              </div>
            </div>

            {form.agreementEndDate && (
              <div style={{ background: "#FAFAF8", border: "1px solid var(--border)", borderRadius: 8, padding: "12px 14px", marginBottom: 14 }}>
                {isConnected ? (
                  <label style={{ display: "flex", alignItems: "center", gap: 10, cursor: "pointer", fontSize: 13 }}>
                    <input
                      type="checkbox"
                      checked={!!form.agreementEndSyncToCalendar}
                      onChange={(e) => setForm({ ...form, agreementEndSyncToCalendar: e.target.checked })}
                    />
                    <span>
                      <strong>委託到期日同步到 Google 行事曆</strong>
                      <br />
                      <span style={{ color: "var(--muted)", fontSize: 11 }}>存檔時會建立/更新提醒事件</span>
                    </span>
                  </label>
                ) : (
                  <div style={{ fontSize: 12, color: "var(--muted)" }}>尚未連結 Google 帳號，前往「設定」頁面連結後可同步</div>
                )}
                {form.agreementEndGoogleEventLink && (
                  <div style={{ marginTop: 8, fontSize: 12 }}>
                    ✓ 已同步・
                    <a href={form.agreementEndGoogleEventLink} target="_blank" rel="noreferrer">在 Google 行事曆開啟</a>
                  </div>
                )}
              </div>
            )}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
              <div className="form-field">
                <label>開價（萬）</label>
                <input value={form.askingPrice || ""} onChange={(e) => setForm({ ...form, askingPrice: e.target.value })} />
              </div>
              <div className="form-field">
                <label>底價（萬）</label>
                <input value={form.floorPrice || ""} onChange={(e) => setForm({ ...form, floorPrice: e.target.value })} />
              </div>
            </div>

            {isListed && (
              <div className="form-field">
                <label>廣告網站</label>
                {(form.adPlatforms || []).map((p, idx) => (
                  <div key={idx} style={{ display: "flex", gap: 8, marginBottom: 8 }}>
                    <input value={p.name} onChange={(e) => updatePlatform(idx, "name", e.target.value)} placeholder="平台名稱" style={{ width: 100 }} />
                    <input value={p.url} onChange={(e) => updatePlatform(idx, "url", e.target.value)} placeholder="廣告網址" style={{ flex: 1 }} />
                    {p.url && <a href={p.url} target="_blank" rel="noreferrer" className="btn ghost" style={{ textDecoration: "none" }}>開啟</a>}
                    <input type="date" value={p.expiryDate} onChange={(e) => updatePlatform(idx, "expiryDate", e.target.value)} style={{ width: 140 }} />
                    <button type="button" className="btn ghost" onClick={() => removePlatform(idx)}>刪除</button>
                  </div>
                ))}
                <button type="button" className="btn ghost" onClick={addPlatform}>＋ 新增廣告平台</button>
              </div>
            )}
          </div>

          <div className="panel">
            <ProgressLog contactId={contactId} listingId={listingId} />
          </div>

          <div className="panel">
            <SellerAppointments contactId={contactId} listingId={listingId} listingTitle={form.title} />
          </div>
          <div className="panel">
            <ContactInteractions contactId={contactId} contactName={ownerForm.name} onLogged={() => saveContact({ lastContactDate: todayStr() })} />
          </div>
        </div>
      </div>
    </main>
  );
}
