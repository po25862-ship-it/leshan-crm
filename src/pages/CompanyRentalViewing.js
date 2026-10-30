import React, { useState } from "react";
import { Link } from "react-router-dom";
import { useSharedCollection } from "../hooks/useSharedCollection";
import { saveRentalViewing } from "../lib/companyRentalRepository";
import { todayTaipeiStr } from "../lib/dates";
import ManualTimeInput from "./ManualTimeInput";

export default function CompanyRentalViewing({ rental, user, onClose }) {
  const { items, loading } = useSharedCollection("contacts", "name", user.uid);
  const [customerId, setCustomerId] = useState(""), [keyword, setKeyword] = useState("");
  const [newName, setNewName] = useState(""), [newPhone, setNewPhone] = useState("");
  const [date, setDate] = useState(todayTaipeiStr()), [time, setTime] = useState(""), [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false), [error, setError] = useState(""), [saved, setSaved] = useState(null);
  async function save(event) {
    event.preventDefault(); setError("");
    const contact = items.find(item => item.id === customerId);
    if (customerId !== "new" && !contact) { setError("請先選擇一位客人。"); return; }
    setBusy(true);
    try { setSaved(await saveRentalViewing({ rental, user, contact, newName, newPhone, date, time, notes })); }
    catch (err) { setError(err.message || "帶看儲存失敗。"); } finally { setBusy(false); }
  }
  if (saved) return <div className="cr-inset" role="status"><h3>帶看已加入客戶紀錄</h3><p>{date} {time}｜{rental.title}</p><p>已記錄在平台，請自行向負責同事確認帶看安排。</p><div className="cr-actions"><Link className="cr-link-button" to={`/buyers?open=${saved.contactId}`}>查看客戶紀錄</Link><button onClick={onClose}>關閉</button></div></div>;
  return <form className="cr-inset" onSubmit={save}><div className="cr-toolbar"><h3>安排帶看｜{rental.title}</h3><button type="button" disabled={busy} onClick={onClose}>取消</button></div>{error && <p role="alert" className="cr-error">{error}</p>}<fieldset disabled={busy}><div className="cr-form-grid"><label className="cr-field"><span>搜尋客人</span><input value={keyword} placeholder="姓名或電話" onChange={event => setKeyword(event.target.value)} /></label><label className="cr-field"><span>介紹給哪位客人＊</span><select value={customerId} onChange={event => setCustomerId(event.target.value)}><option value="">{loading ? "讀取客人中…" : "請選擇客人"}</option><option value="new">＋ 新增客人</option>{items.filter(item => item.id === customerId || [item.name, item.phone].join(" ").includes(keyword.trim())).map(item => <option value={item.id} key={item.id}>{item.name}{item.phone ? `・${item.phone}` : ""}</option>)}</select></label>{customerId === "new" && <><label className="cr-field"><span>新客人姓名＊</span><input value={newName} maxLength={80} onChange={event => setNewName(event.target.value)} /></label><label className="cr-field"><span>電話</span><input type="tel" value={newPhone} maxLength={40} onChange={event => setNewPhone(event.target.value)} /></label></>}<label className="cr-field"><span>帶看日期＊</span><input type="date" value={date} onChange={event => setDate(event.target.value)} /></label><div className="cr-field"><span>帶看時間＊</span><ManualTimeInput value={time} onChange={setTime} /></div><label className="cr-field cr-wide"><span>帶看備註（內部）</span><textarea value={notes} onChange={event => setNotes(event.target.value)} rows={2} /></label></div><button className="cr-primary" type="submit">{busy ? "儲存中…" : "儲存帶看"}</button></fieldset></form>;
}
