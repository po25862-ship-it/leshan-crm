import React, { useState, useEffect } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { doc, updateDoc, deleteDoc } from "firebase/firestore";
import { ref, uploadBytes, getDownloadURL, deleteObject } from "firebase/storage";
import { db, storage } from "../firebase";
import { useDoc } from "../hooks/useDoc";
import { useCollection } from "../hooks/useCollection";
import { formatDate, nextMonthlyDueDate } from "../lib/dates";
import { withAgid } from "../lib/url";
import { useGoogleAuth } from "../GoogleAuthContext";
import RocDateHint from "./RocDateHint";

const STATUS_LABELS = { seeking: "招租中", leased: "租賃中", idle: "閒置中" };
const STATUS_ORDER = ["seeking", "leased", "idle"];

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

function ProgressLog({ rentalId }) {
  const { items, add, remove } = useCollection(`rentals/${rentalId}/progressLogs`, "date");
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
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
      <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 12 }}>租賃狀況回報</div>
      <form onSubmit={onAdd} style={{ display: "flex", gap: 8, marginBottom: 14 }}>
        <input type="date" value={date} onChange={(e) => setDate(e.target.value)} style={{ width: 150, padding: "9px 10px", border: "1px solid var(--border)", borderRadius: 7, fontSize: 13 }} />
        <input
          value={content}
          onChange={(e) => setContent(e.target.value)}
          placeholder="例如：房客反映水龍頭漏水、已通知修繕…"
          style={{ flex: 1, padding: "9px 10px", border: "1px solid var(--border)", borderRadius: 7, fontSize: 13 }}
        />
        <button className="btn" type="submit">新增</button>
      </form>
      {sorted.length === 0 && <div style={{ fontSize: 13, color: "var(--muted)" }}>還沒有紀錄</div>}
      {sorted.map((log) => (
        <div key={log.id} style={{ display: "flex", justifyContent: "space-between", padding: "10px 0", borderBottom: "1px solid var(--border)", fontSize: 13 }}>
          <div><span className="mono" style={{ color: "var(--muted)", marginRight: 10 }}>{formatDate(log.date)}</span>{linkify(log.content)}</div>
          <button onClick={() => remove(log.id)} style={{ border: "none", background: "none", color: "var(--muted)", cursor: "pointer", fontSize: 12 }}>刪除</button>
        </div>
      ))}
    </div>
  );
}

export default function RentalDetail() {
  const { rentalId } = useParams();
  const navigate = useNavigate();
  const rentalPath = `rentals/${rentalId}`;
  const { data: rental, save: saveRental } = useDoc(rentalPath);
  const { items: contacts } = useCollection("contacts", "name");
  const { items: properties } = useCollection("properties", "title");
  const { isConnected, createEvent, updateEvent, deleteEvent } = useGoogleAuth();

  const [form, setForm] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [syncing, setSyncing] = useState(false);

  useEffect(() => {
    if (rental && Object.keys(rental).length > 0) {
      setForm({ ...rental });
    }
  }, [rental]);

  if (!form) {
    return <main><div className="panel">載入中…</div></main>;
  }

  const matchContactByName = (name) => contacts.find((c) => c.name === (name || "").trim());
  const matchPropertyByTitle = (title) => properties.find((p) => p.title === (title || "").trim());

  const onLandlordBlur = () => {
    if (form.landlordContactId) return;
    const match = matchContactByName(form.landlordName);
    if (match) setForm((f) => ({ ...f, landlordContactId: match.id, landlordPhone: match.phone || f.landlordPhone }));
  };
  const onTenantBlur = () => {
    if (form.tenantContactId) return;
    const match = matchContactByName(form.tenantName);
    if (match) setForm((f) => ({ ...f, tenantContactId: match.id, tenantPhone: match.phone || f.tenantPhone }));
  };
  const onPropertyBlur = () => {
    if (form.propertyId) return;
    const match = matchPropertyByTitle(form.title);
    if (match) {
      setForm((f) => ({
        ...f,
        propertyId: match.id,
        propertyAddress: match.address || f.propertyAddress,
        propertyUrl: match.websiteUrl || f.propertyUrl,
      }));
    }
  };

  const updatePlatform = (idx, key, val) => {
    const next = [...(form.adPlatforms || [])];
    next[idx] = { ...next[idx], [key]: val };
    setForm({ ...form, adPlatforms: next });
  };
  const addPlatform = () =>
    setForm({ ...form, adPlatforms: [...(form.adPlatforms || []), { name: "", url: "", expiryDate: "" }] });
  const removePlatform = (idx) =>
    setForm({ ...form, adPlatforms: (form.adPlatforms || []).filter((_, i) => i !== idx) });

  const onSave = async () => {
    let resolved = { ...form, propertyUrl: withAgid(form.propertyUrl) };

    // 有連結物件的話，同步地址／網址（不動物件本身的在售狀態）
    if (resolved.propertyId) {
      try {
        await updateDoc(doc(db, "properties", resolved.propertyId), {
          address: resolved.propertyAddress,
          websiteUrl: resolved.propertyUrl,
        });
      } catch (err) {
        console.error("同步物件資料失敗", err);
      }
    }

    if (isConnected && resolved.rentDueDay) {
      setSyncing(true);
      const anchorDate = nextMonthlyDueDate(resolved.rentDueDay);
      const payload = {
        title: `房租收款・${resolved.title || "出租物件"}`,
        date: anchorDate,
        notes: resolved.notes,
        recurrence: ["RRULE:FREQ=MONTHLY"],
      };
      try {
        if (resolved.rentSyncToCalendar) {
          if (resolved.rentGoogleEventId) {
            await updateEvent(resolved.rentGoogleEventId, payload);
          } else {
            const created = await createEvent(payload);
            resolved.rentGoogleEventId = created.id;
            resolved.rentGoogleEventLink = created.htmlLink;
          }
        } else if (resolved.rentGoogleEventId) {
          await deleteEvent(resolved.rentGoogleEventId);
          resolved.rentGoogleEventId = null;
          resolved.rentGoogleEventLink = null;
        }
      } catch (err) {
        console.error("Google 行事曆同步失敗", err);
      }
      setSyncing(false);
    }

    await saveRental(resolved);
    setForm(resolved);
    navigate(-1);
  };

  const onDelete = async () => {
    if (!window.confirm("確定要刪除這筆出租資料嗎？")) return;
    if (form.rentGoogleEventId) {
      try {
        await deleteEvent(form.rentGoogleEventId);
      } catch {
        // 行事曆刪不掉也不擋
      }
    }
    await deleteDoc(doc(db, rentalPath));
    navigate("/rentals");
  };

  const handleUpload = async (e) => {
    const file = e.target.files[0];
    e.target.value = "";
    if (!file) return;
    setUploading(true);
    try {
      const ext = file.name.split(".").pop();
      const storageRef = ref(storage, `rentals/${rentalId}/document.${ext}`);
      await uploadBytes(storageRef, file);
      const url = await getDownloadURL(storageRef);
      const next = { ...form, documentUrl: url, documentName: file.name, documentType: file.type };
      setForm(next);
      await saveRental(next);
    } catch (err) {
      console.error(err);
      alert("上傳失敗，請確認 Firebase Storage 是否已啟用。");
    }
    setUploading(false);
  };

  const removeDocument = async () => {
    try {
      const ext = form.documentName ? form.documentName.split(".").pop() : "";
      await deleteObject(ref(storage, `rentals/${rentalId}/document.${ext}`));
    } catch {
      // 檔案本體刪不掉也不擋
    }
    const next = { ...form, documentUrl: null, documentName: null, documentType: null };
    setForm(next);
    await saveRental(next);
  };

  return (
    <main>
      <div className="top-actions">
        <Link to="/rentals" className="btn ghost" style={{ textDecoration: "none" }}>← 回出租列表</Link>
        <div style={{ display: "flex", gap: 10 }}>
          <button className="btn" onClick={onSave} disabled={syncing}>{syncing ? "同步中…" : "儲存變更"}</button>
          <button className="btn danger" onClick={onDelete}>刪除</button>
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "340px 1fr", gap: 24, alignItems: "start" }}>
        <div className="panel">
          <div className="section-title" style={{ fontSize: 14 }}>基本資料</div>
          <div className="form-field">
            <label>案名／物件名稱（打字若跟現有物件案名一致，離開欄位會自動帶入地址/網址）</label>
            <input list="rental-property-options" value={form.title || ""} onChange={(e) => setForm({ ...form, title: e.target.value })} onBlur={onPropertyBlur} />
            <datalist id="rental-property-options">
              {properties.map((p) => <option key={p.id} value={p.title} />)}
            </datalist>
            {form.propertyId && <div style={{ fontSize: 11, color: "var(--accent)", marginTop: 4 }}>✓ 已連結物件資料庫</div>}
          </div>
          <div className="form-field">
            <label>物件地址</label>
            <input value={form.propertyAddress || ""} onChange={(e) => setForm({ ...form, propertyAddress: e.target.value })} />
          </div>
          <div className="form-field">
            <label>物件網址</label>
            <div style={{ display: "flex", gap: 8 }}>
              <input style={{ flex: 1 }} value={form.propertyUrl || ""} onChange={(e) => setForm({ ...form, propertyUrl: e.target.value })} />
              {form.propertyUrl && <a href={withAgid(form.propertyUrl)} target="_blank" rel="noreferrer" className="btn ghost" style={{ textDecoration: "none" }}>開啟</a>}
            </div>
          </div>
          <div className="form-field">
            <label>狀態</label>
            <select value={form.status || "seeking"} onChange={(e) => setForm({ ...form, status: e.target.value })}>
              {STATUS_ORDER.map((s) => <option key={s} value={s}>{STATUS_LABELS[s]}</option>)}
            </select>
          </div>

          <div style={{ marginTop: 20, borderTop: "1px solid var(--border)", paddingTop: 16 }}>
            <div className="form-field">
              <label>出租人（屋主）姓名（打字若跟現有客戶同名，離開欄位會自動帶入電話）</label>
              <input list="rental-contact-options" value={form.landlordName || ""} onChange={(e) => setForm({ ...form, landlordName: e.target.value, landlordContactId: null })} onBlur={onLandlordBlur} />
              {form.landlordContactId && <div style={{ fontSize: 11, color: "var(--accent)", marginTop: 4 }}>✓ 已連結客戶資料</div>}
            </div>
            <div className="form-field">
              <label>出租人電話</label>
              <input value={form.landlordPhone || ""} onChange={(e) => setForm({ ...form, landlordPhone: e.target.value })} />
            </div>
            <div className="form-field">
              <label>承租人（房客）姓名</label>
              <input list="rental-contact-options" value={form.tenantName || ""} onChange={(e) => setForm({ ...form, tenantName: e.target.value, tenantContactId: null })} onBlur={onTenantBlur} />
              {form.tenantContactId && <div style={{ fontSize: 11, color: "var(--accent)", marginTop: 4 }}>✓ 已連結客戶資料</div>}
            </div>
            <div className="form-field">
              <label>承租人電話</label>
              <input value={form.tenantPhone || ""} onChange={(e) => setForm({ ...form, tenantPhone: e.target.value })} />
            </div>
            <datalist id="rental-contact-options">
              {contacts.map((c) => <option key={c.id} value={c.name} />)}
            </datalist>
          </div>

          <div style={{ marginTop: 20, borderTop: "1px solid var(--border)", paddingTop: 16 }}>
            <div className="form-field">
              <label>租賃合約／照片</label>
              {form.documentUrl && (
                <div style={{ marginBottom: 10 }}>
                  {form.documentType && form.documentType.startsWith("image/") ? (
                    <img src={form.documentUrl} alt="租賃資料" style={{ maxWidth: 200, borderRadius: 8, border: "1px solid var(--border)", display: "block", marginBottom: 8 }} />
                  ) : (
                    <div style={{ fontSize: 13 }}>📄 {form.documentName}</div>
                  )}
                  <div style={{ display: "flex", gap: 8, marginTop: 6 }}>
                    <a href={form.documentUrl} target="_blank" rel="noreferrer" className="btn ghost" style={{ textDecoration: "none" }}>開啟／下載</a>
                    <button className="btn ghost" onClick={removeDocument}>移除</button>
                  </div>
                </div>
              )}
              <label className="btn ghost" style={{ cursor: "pointer", display: "inline-block" }}>
                {uploading ? "上傳中…" : form.documentUrl ? "重新上傳" : "上傳資料"}
                <input type="file" accept=".pdf,image/*" onChange={handleUpload} style={{ display: "none" }} disabled={uploading} />
              </label>
            </div>
          </div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
          <div className="panel">
            <div className="section-title" style={{ fontSize: 14 }}>租賃條件</div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
              <div className="form-field">
                <label>租金（元／月）</label>
                <input value={form.rent || ""} onChange={(e) => setForm({ ...form, rent: e.target.value })} />
              </div>
              <div className="form-field">
                <label>押金</label>
                <input value={form.deposit || ""} onChange={(e) => setForm({ ...form, deposit: e.target.value })} />
              </div>
              <div className="form-field">
                <label>租期開始</label>
                <input type="date" value={form.leaseStartDate || ""} onChange={(e) => setForm({ ...form, leaseStartDate: e.target.value })} />
                <RocDateHint date={form.leaseStartDate} />
              </div>
              <div className="form-field">
                <label>租期結束</label>
                <input type="date" value={form.leaseEndDate || ""} onChange={(e) => setForm({ ...form, leaseEndDate: e.target.value })} />
                <RocDateHint date={form.leaseEndDate} />
              </div>
            </div>
            <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, cursor: "pointer", marginBottom: 14 }}>
              <input type="checkbox" checked={!!form.depositReturned} onChange={(e) => setForm({ ...form, depositReturned: e.target.checked })} />
              押金已退還
            </label>

            <div className="form-field">
              <label>每月繳租日（幾號）</label>
              <input
                type="number"
                min="1"
                max="31"
                value={form.rentDueDay || ""}
                onChange={(e) => setForm({ ...form, rentDueDay: e.target.value })}
                style={{ width: 100 }}
              />
              {form.rentDueDay && (
                <div style={{ fontSize: 11, color: "var(--muted)", marginTop: 4 }}>
                  下次到期：{formatDate(nextMonthlyDueDate(form.rentDueDay))}
                </div>
              )}
            </div>

            {form.rentDueDay && (
              <div style={{ background: "#FAFAF8", border: "1px solid var(--border)", borderRadius: 8, padding: "12px 14px" }}>
                {isConnected ? (
                  <label style={{ display: "flex", alignItems: "center", gap: 10, cursor: "pointer", fontSize: 13 }}>
                    <input
                      type="checkbox"
                      checked={!!form.rentSyncToCalendar}
                      onChange={(e) => setForm({ ...form, rentSyncToCalendar: e.target.checked })}
                    />
                    <span>
                      <strong>每月自動同步到 Google 行事曆</strong>
                      <br />
                      <span style={{ color: "var(--muted)", fontSize: 11 }}>設定一次，之後每個月都會自動提醒，不用重新輸入</span>
                    </span>
                  </label>
                ) : (
                  <div style={{ fontSize: 12, color: "var(--muted)" }}>尚未連結 Google 帳號，前往「設定」頁面連結後可同步</div>
                )}
                {form.rentGoogleEventLink && (
                  <div style={{ marginTop: 8, fontSize: 12 }}>
                    ✓ 已同步・<a href={form.rentGoogleEventLink} target="_blank" rel="noreferrer">在 Google 行事曆開啟</a>
                  </div>
                )}
              </div>
            )}
          </div>

          {form.status === "seeking" && (
            <div className="panel">
              <div className="section-title" style={{ fontSize: 14 }}>招租廣告</div>
              <div className="form-field">
                <label>廣告網站（可自由新增，各自可設到期日期）</label>
                {(form.adPlatforms || []).map((p, idx) => (
                  <div key={idx} style={{ display: "flex", gap: 8, marginBottom: 8 }}>
                    <input value={p.name} onChange={(e) => updatePlatform(idx, "name", e.target.value)} placeholder="平台名稱，例如：591" style={{ width: 100 }} />
                    <input value={p.url} onChange={(e) => updatePlatform(idx, "url", e.target.value)} placeholder="廣告網址" style={{ flex: 1 }} />
                    {p.url && <a href={p.url} target="_blank" rel="noreferrer" className="btn ghost" style={{ textDecoration: "none" }}>開啟</a>}
                    <input type="date" value={p.expiryDate} onChange={(e) => updatePlatform(idx, "expiryDate", e.target.value)} style={{ width: 140 }} />
                    <button type="button" className="btn ghost" onClick={() => removePlatform(idx)}>刪除</button>
                  </div>
                ))}
                <button type="button" className="btn ghost" onClick={addPlatform}>＋ 新增廣告平台</button>
              </div>
            </div>
          )}

          <div className="panel">
            <div className="form-field">
              <label>備註</label>
              <textarea rows="2" value={form.notes || ""} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
            </div>
          </div>

          <div className="panel">
            <ProgressLog rentalId={rentalId} />
          </div>
        </div>
      </div>
    </main>
  );
}
