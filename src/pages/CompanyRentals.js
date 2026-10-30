import React, { useEffect, useMemo, useState } from "react";
import { useAuth } from "../AuthContext";
import { useDoc } from "../hooks/useDoc";
import { usePersonalAgid } from "../hooks/usePersonalAgid";
import { useCompanyRentals } from "../hooks/useCompanyRentals";
import { COMPANY_RENTAL_STATUSES, rentalSearchRows, rentalMoney, rentalPublicAddress, rentalAgentKey, rentalEquipmentChoices } from "../lib/companyRental";
import { isHiddenColleague } from "../lib/colleagueVisibility";
import { rentalExpiryReminders, rentalWebsitePatch, rentalWebsiteState } from "../lib/companyRentalWebsite";
import { useRentalWebsiteChecks } from "../hooks/useRentalWebsiteChecks";
import CompanyRentalEditor from "./CompanyRentalEditor";
import CompanyRentalDetail from "./CompanyRentalDetail";
import "./CompanyRentals.css";

export default function CompanyRentals() {
  const { user } = useAuth();
  const { data: profile } = useDoc(`colleagues/${user.uid}`, {});
  const { agid } = usePersonalAgid();
  const { items: storedItems, loading, error, refresh } = useCompanyRentals(user.uid);
  const [status, setStatus] = useState("available"), [keyword, setKeyword] = useState(""), [area, setArea] = useState(""), [colleague, setColleague] = useState("");
  const [openId, setOpenId] = useState(""), [editing, setEditing] = useState(null), [notice, setNotice] = useState("");
  const [now, setNow] = useState(Date.now), [expiryOnly, setExpiryOnly] = useState(false);
  useEffect(() => { const timer = setInterval(() => setNow(Date.now()), 60000); return () => clearInterval(timer); }, []);
  const checks = useRentalWebsiteChecks(storedItems, user, !editing && !loading);
  const items = useMemo(() => storedItems.map(row => { const patch = rentalWebsitePatch(row, checks[row.id]); return patch ? { ...row, ...patch } : row; }), [storedItems, checks]);
  const baseSearch = useMemo(() => rentalSearchRows(items, { keyword, area, colleague, uid: user.uid }), [items, keyword, area, colleague, user.uid]);
  const searched = useMemo(() => expiryOnly ? baseSearch.filter(row => rentalExpiryReminders(row, now).length) : baseSearch, [baseSearch, expiryOnly, now]);
  const reminderCount = baseSearch.filter(row => rentalExpiryReminders(row, now).length).length;
  const sharedEquipment = useMemo(() => rentalEquipmentChoices(items), [items]);
  const filtered = searched.filter(row => row.status === status).sort((a, b) => (b.updatedAt?.toMillis?.() || +new Date(b.updatedAt) || 0) - (a.updatedAt?.toMillis?.() || +new Date(a.updatedAt) || 0));
  const colleagues = [...new Map(items.filter(row => !isHiddenColleague(rentalAgentKey(row))).map(row => [rentalAgentKey(row), row.agentName || "同事"])).entries()];
  const resetDetail = () => { setOpenId(""); setNotice(""); };
  return <main className="company-rentals"><div className="cr-page-heading"><div><small>同事一起找房、介紹、安排帶看</small><h1>公司租賃 <span>{filtered.length}</span></h1></div><div className="cr-actions"><button disabled={loading} onClick={() => { refresh().then(() => setNotice("已讀取最新租賃清單。")).catch(() => {}); }}>{loading ? "讀取中…" : "重新整理"}</button><button className="cr-primary" disabled={!!editing} onClick={() => { setEditing({ original: null, internal: {} }); setOpenId(""); setNotice(""); }}>＋ 新增租賃</button></div></div>
    {notice && <p className="cr-success" role="status">{notice}</p>}{error && <p className="cr-error" role="alert">租賃清單讀取失敗，請按重新整理再試一次。{error.code === "permission-denied" ? "目前帳號尚無公司租賃權限。" : ""}</p>}
    {!editing && (reminderCount > 0 || expiryOnly) && <div className="cr-expiry-banner"><div><strong>{reminderCount} 筆案件有到期提醒</strong><p>委託與刊登期限提前 7 天提醒，已到期的案件也會保留在清單內。</p></div><button type="button" onClick={() => { setExpiryOnly(value => !value); setStatus("available"); setOpenId(""); }}>{expiryOnly ? "顯示全部案件" : "只看到期提醒"}</button></div>}
    {editing ? <CompanyRentalEditor key={editing.original?.id || "new"} {...editing} sharedEquipment={sharedEquipment} user={user} profile={profile} onClose={() => setEditing(null)} onSaved={(rental, message) => { setEditing(null); setStatus(rental.status); setExpiryOnly(false); setKeyword(""); setArea(""); setColleague(""); setOpenId(rental.id); setNotice(message); }} /> : <>
      <div className="cr-tabs" role="tablist" aria-label="租賃狀態">{Object.entries(COMPANY_RENTAL_STATUSES).map(([key, label]) => <button role="tab" aria-selected={status === key} key={key} onClick={() => { setStatus(key); resetDetail(); }}>{label}<span>{searched.filter(row => row.status === key).length}</span></button>)}</div>
      <div className="cr-filters"><label className="cr-search"><span>找物件</span><input value={keyword} placeholder="搜尋案名、社區、路段或同事" onChange={event => { setKeyword(event.target.value); resetDetail(); }} /></label><label><span>生活圈</span><select value={area} onChange={event => { setArea(event.target.value); resetDetail(); }}><option value="">全部生活圈</option>{["A7", "A8", "A9", "其他"].map(value => <option key={value}>{value}</option>)}</select></label><label><span>負責同事</span><select value={colleague} onChange={event => { setColleague(event.target.value); resetDetail(); }}><option value="">全部同事</option><option value="mine">我新增的</option>{colleagues.map(([uid, name]) => <option key={uid} value={uid}>{name}</option>)}</select></label><button onClick={() => { setKeyword(""); setArea(""); setColleague(""); setExpiryOnly(false); resetDetail(); }}>清除條件</button></div>
      <div className="cr-list" aria-live="polite">{loading && !items.length ? <div className="cr-empty">正在讀取公司租賃…</div> : !filtered.length ? <div className="cr-empty"><span aria-hidden="true">⌂</span><h2>{items.length ? "目前沒有符合條件的物件" : "把第一間好房放進來"}</h2><p>{items.length ? "可以調整搜尋條件，或查看其他招租狀態。" : "點「新增租賃」，讓同事一起介紹與安排帶看。"}</p></div> : filtered.map(rental => <article className="cr-list-item" key={rental.id}><div className="cr-row"><div className="cr-row-info"><div className="cr-row-title"><h2>{rental.title}</h2><span className="cr-badge">{rental.type}</span><span className={rentalWebsiteState(rental, now).available ? "cr-badge cr-website-live" : "cr-badge cr-website-missing"}>{rentalWebsiteState(rental, now).label}</span></div><p>{[rental.community, rental.area, rentalPublicAddress(rental)].filter(Boolean).join("・")}</p><p>{rental.rooms ?? "—"}房 {rental.living ?? "—"}廳 {rental.baths ?? "—"}衛 ・{rental.size ? `${rentalMoney(rental.size)} 坪` : "面積待確認"}{rental.floor ? ` ・${rental.floor} 樓` : ""}</p><p className="cr-agent">負責同事 <strong>{rental.agentName}</strong>{rental.viewingStatus ? `・${rental.viewingStatus}` : ""}</p><p className="cr-expiry-dates">委託到期：{rental.mandateExpiresOn || "尚未填寫"}・刊登到期：{rental.websiteExpiresOn || "待確認"}</p><div className="cr-expiry-tags">{rentalExpiryReminders(rental, now).map(reminder => <span key={reminder.kind} className={`cr-expiry-tag ${reminder.tone}`}>{reminder.label}</span>)}</div></div><div className="cr-row-end"><div className="cr-row-price">{rental.rent ? rentalMoney(rental.rent) : "待確認"}<small>{rental.rent ? "元／月" : ""}</small></div><button aria-expanded={openId === rental.id} onClick={() => setOpenId(openId === rental.id ? "" : rental.id)}>{openId === rental.id ? "收起資料" : "查看資料"}</button></div></div>{openId === rental.id && <CompanyRentalDetail key={rental.id} rental={rental} user={user} agid={agid} now={now} onEdit={(original, internal) => { setEditing({ original, internal }); }} onClose={() => setOpenId("")} onNotice={setNotice} />}</article>)}</div>
      <p className="cr-footnote">開啟或重新整理時更新清單；591 公開網址每天最多自動檢查一次。期限提醒依台灣日期更新，不需開啟本機程式。照片點開才載入，每案最多 10 張。</p>
    </>}
  </main>;
}
