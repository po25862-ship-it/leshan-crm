import React, { useState, useEffect } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { doc, updateDoc, addDoc, deleteDoc, collection, serverTimestamp } from "firebase/firestore";
import { ref, uploadBytes, getDownloadURL, deleteObject } from "firebase/storage";
import { db, storage } from "../firebase";
import { useDoc } from "../hooks/useDoc";
import { useCollection } from "../hooks/useCollection";
import { formatDate, todayStr } from "../lib/dates";
import { withAgid, withoutAgid } from "../lib/url";
import { PROPERTY_CATEGORIES, PROPERTY_STORES } from "../lib/propertyConstants";
import SellerActivityLog from "./SellerActivityLog";
import ShareWithPicker from "./ShareWithPicker";
import PropertyPicker from "./PropertyPicker";
import { useGoogleAuth } from "../GoogleAuthContext";
import RocDateHint from "./RocDateHint";
import { useAuth } from "../AuthContext";
import { usePersonalAgid } from "../hooks/usePersonalAgid";
import ContactConversationAnalyses from "./ContactConversationAnalyses";

const STATUS_LABELS = { tracking: "追蹤中", listed: "已委託", expired: "已過期", sold: "已出售" };
const STATUS_ORDER = ["tracking", "listed", "expired", "sold"];

function SellerDetailValue({ label, value, accent = false }) {
  return (
    <div style={{ background: "#FAFAF8", border: "1px solid var(--border)", borderRadius: 10, padding: "12px 14px" }}>
      <div style={{ fontSize: 11, color: "var(--muted)", fontWeight: 700, marginBottom: 5 }}>{label}</div>
      <div style={{ fontSize: accent ? 19 : 14, color: accent ? "var(--accent)" : "var(--text)", fontWeight: accent ? 800 : 650, overflowWrap: "anywhere" }}>{value || "—"}</div>
    </div>
  );
}

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

export default function SellerDetail() {
  const { user } = useAuth();
  const { agid } = usePersonalAgid();
  const { contactId, listingId } = useParams();
  const navigate = useNavigate();
  const listingPath = `contacts/${contactId}/listings/${listingId}`;
  const { data: listing, save: saveListing } = useDoc(listingPath);
  const { data: contact, save: saveContact } = useDoc(`contacts/${contactId}`);
  const { items: properties } = useCollection("properties", "title");
  const { items: colleagues } = useCollection("colleagues", "name");
  const MAIN_OWNER_UID = "KiYlsnWcChW5muRkG167r7Mi1132";
  const ownerName = (uid) => {
    if (!uid) return "（尚未標記）";
    if (uid === MAIN_OWNER_UID) return colleagues.find((c) => c.id === uid)?.name || "劉昭佑";
    return colleagues.find((c) => c.id === uid)?.name || "（未知帳號）";
  };
  const { isConnected, createEvent, updateEvent, deleteEvent } = useGoogleAuth();

  const [form, setForm] = useState(null);
  const [ownerForm, setOwnerForm] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [promoting, setPromoting] = useState(false);
  const [editMode, setEditMode] = useState(false);

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
      websiteUrl: withoutAgid(data.propertyUrl),
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

  const saveListingData = async (input) => {
    let resolved = { ...input, propertyUrl: withoutAgid(input.propertyUrl) };
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

    await saveListing({ ...resolved, lastModifiedByUid: user.uid });
    // 同步分享名單到屋主聯絡人資料，確保被分享的同事兩邊都看得到
    await saveContact({ sharedWith: resolved.sharedWith || [], lastModifiedByUid: user.uid });
    setForm(resolved);
    setEditMode(false);
    return resolved;
  };

  const onSave = () => saveListingData(form);

  const promoteToListed = async () => {
    const agreementType = form.agreementType || "一般";
    if (!window.confirm(`確定將「${form.title || "這筆屋主資料"}」轉為已委託嗎？\n\n委託形式：${agreementType}委託\n起始日：${form.agreementStartDate || todayStr()}\n\n確認後會同步到物件管理。`)) return;
    setPromoting(true);
    try {
      const promoted = await saveListingData({
        ...form,
        status: "listed",
        customerStage: "正式",
        agreementType,
        agreementStartDate: form.agreementStartDate || todayStr(),
      });
      const nextTags = (ownerForm.tags || []).filter((tag) => tag !== "觀察中");
      await saveContact({ customerStage: "正式", tags: nextTags, lastModifiedByUid: user.uid });
      setForm(promoted);
      setOwnerForm((current) => ({ ...current, customerStage: "正式", tags: nextTags }));
    } catch (error) {
      console.error(error);
      alert("轉為已委託失敗，請確認網路後再試一次。");
    } finally {
      setPromoting(false);
    }
  };

  const onSaveOwner = async () => {
    await saveContact({ ...ownerForm, lastModifiedByUid: user.uid });
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
  const addPlatform = () => setForm({ ...form, adPlatforms: [...form.adPlatforms, { name: "", url: "", expiryDate: "", note: "" }] });
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
          {editMode ? (
            <>
              <button className="btn" onClick={onSave} disabled={syncing}>{syncing ? "同步物件中…" : "儲存變更"}</button>
              <button className="btn ghost" onClick={() => { setForm({ adPlatforms: [], ...listing }); setOwnerForm({ tags: [], ...contact }); setEditMode(false); }}>返回瀏覽</button>
              <button className="btn danger" onClick={onDelete}>刪除</button>
            </>
          ) : (
            <>
              {form.status === "tracking" && <button className="btn seller-promote-button" onClick={promoteToListed} disabled={promoting}>{promoting ? "轉換中…" : "✓ 轉為已委託"}</button>}
              <button className="btn" onClick={() => setEditMode(true)}>編輯資料</button>
            </>
          )}
        </div>
      </div>

      {!editMode && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))", gap: 20, alignItems: "start" }}>
          <div className="panel">
            <div style={{ fontSize: 12, color: "var(--muted)", marginBottom: 5 }}>{form.listingNo || "未填委託書編號"}</div>
            <div className="section-title" style={{ fontSize: 22, marginBottom: 8 }}>{form.title || "未命名委託"}</div>
            <span className="tag">{STATUS_LABELS[form.status || "tracking"]}</span>
            <span className="tag" style={{ marginLeft: 6 }}>{form.agreementType || "一般"}委託</span>
            <div style={{ display: "grid", gap: 10, marginTop: 18 }}>
              <SellerDetailValue label="屋主" value={ownerForm.name} />
              <SellerDetailValue label="電話" value={ownerForm.phone} />
              <SellerDetailValue label="屋主備註" value={ownerForm.notes} />
            </div>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
            <div className="panel">
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 10, marginBottom: 12 }}>
                <SellerDetailValue label="開價" value={form.askingPrice ? `${form.askingPrice} 萬` : form.price ? `${form.price} 萬` : "—"} accent />
                <SellerDetailValue label="底價" value={form.floorPrice ? `${form.floorPrice} 萬` : "—"} />
                <SellerDetailValue label="委託期間" value={[formatDate(form.agreementStartDate), formatDate(form.agreementEndDate)].filter(Boolean).join(" ～ ")} />
                <SellerDetailValue label="類別／店名" value={[form.category, form.store].filter(Boolean).join("・")} />
              </div>
              <SellerDetailValue label="物件地址" value={form.propertyAddress} />
              <div style={{ display: "flex", gap: 8, marginTop: 12, flexWrap: "wrap" }}>
                {form.propertyUrl && <a href={withAgid(form.propertyUrl, agid)} target="_blank" rel="noreferrer" className="btn ghost" style={{ textDecoration: "none" }}>開啟物件網頁</a>}
                {(form.documents || []).map((file, idx) => <a key={idx} href={file.url} target="_blank" rel="noreferrer" className="btn ghost" style={{ textDecoration: "none" }}>📄 {file.name || `委託文件 ${idx + 1}`}</a>)}
              </div>
            </div>
            {form.sellerAnalysis && <div className="panel">
              <div className="section-title" style={{ fontSize: 14 }}>LINE 屋主分析</div>
              <div style={{ display: "grid", gridTemplateColumns: "110px 1fr", gap: 12, alignItems: "start" }}>
                <div style={{ padding: 14, borderRadius: 10, background: "#EAF6EF", color: "#176B4B", textAlign: "center" }}>
                  <div style={{ fontSize: 10, fontWeight: 800 }}>委售意願</div>
                  <strong style={{ display: "block", fontSize: 28, marginTop: 4 }}>{form.sellerAnalysis.score}</strong>
                  <span style={{ fontSize: 10 }}>{form.sellerAnalysis.intentLevel}意願</span>
                </div>
                <div style={{ fontSize: 11, lineHeight: 1.7 }}>
                  {form.sellerAnalysis.motivations?.length > 0 && <div><b>售屋動機：</b>{form.sellerAnalysis.motivations.join("、")}</div>}
                  {form.sellerAnalysis.timeline && <div><b>出售時程：</b>{form.sellerAnalysis.timeline}</div>}
                  {form.sellerAnalysis.signals?.length > 0 && <div><b>委託訊號：</b>{form.sellerAnalysis.signals.join("、")}</div>}
                  {form.sellerAnalysis.objections?.length > 0 && <div><b>異議風險：</b>{form.sellerAnalysis.objections.join("、")}</div>}
                  <div style={{ marginTop: 6, color: "var(--accent)", fontWeight: 700 }}><b>下一步：</b>{form.sellerAnalysis.nextStep}</div>
                </div>
              </div>
            </div>}
            <div className="panel">
              <ContactConversationAnalyses contactId={contactId} />
            </div>
            <div className="panel">
              <SellerActivityLog
                contactId={contactId}
                listingId={listingId}
                listingTitle={form.title}
                onLogged={({ date, summary }) => saveContact({ lastContactDate: date, lastContactNote: summary })}
              />
            </div>
          </div>
        </div>
      )}

      {editMode && (
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

          <div style={{ marginTop: 20, borderTop: "1px solid var(--border)", paddingTop: 16 }}>
            <div className="form-field">
              <label>建立資料</label>
              <div style={{ fontSize: 14, fontWeight: 700 }}>{ownerName(form.ownerUid)}</div>
            </div>
            <div className="form-field">
              <ShareWithPicker value={form.sharedWith} onChange={(sharedWith) => setForm({ ...form, sharedWith })} />
              <div style={{ fontSize: 11, color: "var(--muted)", marginTop: 6 }}>
                分享後，同事按「儲存變更」才會真的生效（不是勾選當下就存檔）
              </div>
            </div>
          </div>

          <div style={{ marginTop: 24, borderTop: "1px solid var(--border)", paddingTop: 16 }}>
            <div className="form-field">
              <label>物件名稱／案名（打字若跟現有物件案名一致，離開欄位時會自動帶入該物件資料）</label>
              <PropertyPicker
                properties={properties}
                value={form.title || ""}
                onChange={(title) => setForm({ ...form, title, propertyId: form.propertyId && title !== form.title ? "" : form.propertyId })}
                onSelect={(match) => {
                  setForm((f) => ({
                    ...f,
                    title: match.title,
                    propertyId: match.id,
                    propertyAddress: match.address || f.propertyAddress,
                    propertyUrl: match.websiteUrl || f.propertyUrl,
                    price: match.totalPrice || f.price,
                    category: match.category || f.category,
                    store: match.store || f.store,
                  }));
                }}
                placeholder="輸入案名或地址搜尋…"
              />
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
                {form.propertyUrl && <a href={withAgid(form.propertyUrl, agid)} target="_blank" rel="noreferrer" className="btn ghost" style={{ textDecoration: "none" }}>開啟</a>}
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
                <label>廣告方式（線上平台或發傳單/OP等實體方式都可以自由新增）</label>
                {(form.adPlatforms || []).map((p, idx) => (
                  <div key={idx} style={{ background: "#FAFAF8", border: "1px solid var(--border)", borderRadius: 8, padding: 10, marginBottom: 8 }}>
                    <div style={{ display: "flex", gap: 8, marginBottom: 6 }}>
                      <input value={p.name} onChange={(e) => updatePlatform(idx, "name", e.target.value)} placeholder="方式，例如：591／發傳單／OP／FB" style={{ width: 140 }} />
                      <input value={p.url} onChange={(e) => updatePlatform(idx, "url", e.target.value)} placeholder="廣告網址（線上才需要）" style={{ flex: 1 }} />
                      {p.url && <a href={p.url} target="_blank" rel="noreferrer" className="btn ghost" style={{ textDecoration: "none" }}>開啟</a>}
                      <input type="date" value={p.expiryDate} onChange={(e) => updatePlatform(idx, "expiryDate", e.target.value)} style={{ width: 140 }} />
                      <button type="button" className="btn ghost" onClick={() => removePlatform(idx)}>刪除</button>
                    </div>
                    <input
                      value={p.note || ""}
                      onChange={(e) => updatePlatform(idx, "note", e.target.value)}
                      placeholder="數量／說明，例如：發傳單 1200份 文化七路附近"
                      style={{ width: "100%" }}
                    />
                  </div>
                ))}
                <button type="button" className="btn ghost" onClick={addPlatform}>＋ 新增廣告方式</button>
              </div>
            )}
          </div>

          <div className="panel">
            <SellerActivityLog
              contactId={contactId}
              listingId={listingId}
              listingTitle={form.title}
              onLogged={({ date, summary }) => saveContact({ lastContactDate: date, lastContactNote: summary })}
            />
          </div>
        </div>
      </div>
      )}
    </main>
  );
}
