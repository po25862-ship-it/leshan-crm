import React, { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../AuthContext";
import { useDoc } from "../hooks/useDoc";
import { useCollection } from "../hooks/useCollection";
import { AUDIT_FIELDS, auditCheckState, auditDate, auditFingerprint, auditMoney, auditProgress, auditStatusLabel, auditWebsiteLabel, auditWebsiteUrl, duplicateAuditCodes, filterAuditRows, isAuditStore } from "../lib/propertyAudit";
import { propertyWebsiteStatus } from "../lib/propertyWebsite";
import { savePropertyAuditCheck, savePropertyAuditNote } from "../lib/propertyAuditRepository";
import "./PropertyAudit.css";

function AuditNote({ row, actor, onPending }) {
  const saved = row.auditChecklist?.note?.text || "";
  const [draft, setDraft] = useState(saved), [baseText, setBaseText] = useState(saved), [editing, setEditing] = useState(false), [busy, setBusy] = useState(false), [error, setError] = useState("");
  useEffect(() => { if (!editing) { setDraft(saved); setBaseText(saved); } }, [saved, editing]);
  const dirty = draft !== (editing ? baseText : saved);
  useEffect(() => { onPending(row.id, dirty || busy); return () => onPending(row.id, false); }, [row.id, dirty, busy, onPending]);
  async function save() {
    if (busy || !dirty) return; setBusy(true); setError("");
    try { await savePropertyAuditNote({ id: row.id, text: draft, expectedText: baseText, actor }); setEditing(false); }
    catch (failure) { setError(failure.message || "儲存失敗，草稿仍保留，請稍後重試。"); }
    finally { setBusy(false); }
  }
  return <div className="pa-note">
    <div className="pa-no-print"><textarea aria-label={`${row.listingNo}核對備註`} placeholder="需補件、待回簽等" maxLength={300} rows={2} value={draft} disabled={busy} onFocus={() => { if (!editing) { setBaseText(saved); setEditing(true); } }} onBlur={() => { if (!dirty && !busy) setEditing(false); }} onChange={event => setDraft(event.target.value)} />
      {dirty && <button type="button" onClick={save} disabled={busy}>{busy ? "儲存中…" : "儲存備註"}</button>}
      {dirty && <button type="button" disabled={busy} onClick={() => { setDraft(saved); setEditing(false); setError(""); }}>取消</button>}
      {dirty && !busy && <span className="pa-draft">備註尚未儲存</span>}
      {error && <span className="pa-row-error" role="alert">{error}</span>}
    </div>
    <span className="pa-print-note">{saved}</span>
    {!!saved && <small className="pa-note-by">{row.auditChecklist.note.byName || "同事"}・{auditDate(row.auditChecklist.note.at, true)}</small>}
  </div>;
}

export default function PropertyAudit() {
  const { user } = useAuth(), { data: profile } = useDoc(`colleagues/${user.uid}`, {});
  const { items, loading, error, loadedAt, refresh } = useCollection("properties", "createdAt");
  const [status, setStatus] = useState("active"), [query, setQuery] = useState(""), [review, setReview] = useState("all");
  const [busy, setBusy] = useState({}), [failures, setFailures] = useState({}), [notice, setNotice] = useState(""), [refreshing, setRefreshing] = useState(false);
  const [printBlank, setPrintBlank] = useState(false), [pendingNotes, setPendingNotes] = useState({});
  const actor = { uid: user.uid, name: profile.name || user.displayName || "同事" };
  const all = useMemo(() => items.filter(isAuditStore), [items]);
  const duplicates = useMemo(() => duplicateAuditCodes(all), [all]);
  const rows = useMemo(() => filterAuditRows(all, { status, query, review }), [all, status, query, review]);
  const counts = useMemo(() => ({ active: all.filter(row => (row.status || "active") === "active").length, onHold: all.filter(row => row.status === "onHold").length, sold: all.filter(row => row.status === "sold").length, all: all.length }), [all]);
  const complete = rows.filter(row => auditProgress(row).complete).length;
  const inFlight = Object.values(busy).some(Boolean), noteDirty = Object.values(pendingNotes).some(Boolean);
  const onNotePending = React.useCallback((id, pending) => setPendingNotes(current => current[id] === pending ? current : { ...current, [id]: pending }), []);
  useEffect(() => { document.body.classList.add("property-audit-print-mode"); return () => document.body.classList.remove("property-audit-print-mode"); }, []);
  useEffect(() => {
    if (!noteDirty) return;
    const guard = event => { event.preventDefault(); event.returnValue = ""; };
    window.addEventListener("beforeunload", guard); return () => window.removeEventListener("beforeunload", guard);
  }, [noteDirty]);
  function mayChangeView() { return !noteDirty || window.confirm("有核對備註尚未儲存，確定要離開目前清單嗎？"); }
  async function changeCheck(row, key, checked) {
    const cell = `${row.id}:${key}`; if (busy[cell]) return;
    setBusy(current => ({ ...current, [cell]: true })); setFailures(current => ({ ...current, [cell]: "" })); setNotice("");
    try { await savePropertyAuditCheck({ id: row.id, key, checked, fingerprint: auditFingerprint(row, key), actor }); setNotice(`${row.listingNo} ${AUDIT_FIELDS.find(field => field.key === key).label}已${checked ? "完成核對" : "取消勾選"}，已儲存到共用雲端。`); }
    catch (failure) { setFailures(current => ({ ...current, [cell]: failure.message || "儲存失敗，未更動核對結果，請重試。" })); }
    finally { setBusy(current => ({ ...current, [cell]: false })); }
  }
  async function reload() {
    if (refreshing || inFlight || !mayChangeView()) return; setRefreshing(true); setNotice("");
    try { await refresh(); setNotice("已讀取最新物件與同事的核對紀錄。"); } catch { setNotice("更新失敗，目前保留上次資料，請稍後重試。"); } finally { setRefreshing(false); }
  }
  return <main className={`property-audit-page${printBlank ? " pa-print-blank" : ""}`}>
    <header className="pa-header pa-no-print"><div><span className="pa-eyebrow">店內共用 · 文件核對</span><h1>捷運樂善店<span>物件核對表</span></h1><p>名稱、地址與售價直接沿用物件資料。四項核對結果由同事逐筆確認。</p></div><div className="pa-header-actions"><Link to="/properties" className="btn ghost">回物件管理</Link><button className="btn ghost" type="button" onClick={reload} disabled={refreshing || inFlight || noteDirty}>{refreshing ? "更新中…" : "更新清單"}</button><button className="btn" type="button" disabled={!rows.length || inFlight || noteDirty} onClick={() => window.print()}>列印目前清單</button></div></header>
    <section className="pa-summary pa-no-print" aria-label="核對進度"><div><span>目前清單</span><strong>{rows.length}<small>筆</small></strong></div><div><span>四項完成</span><strong>{complete}<small>筆</small></strong></div><div><span>尚待核對</span><strong>{rows.length - complete}<small>筆</small></strong></div><div className="pa-summary-tip"><b>同一份雲端紀錄</b><span>勾選後自動儲存；按「更新清單」查看同事的新紀錄，不需另外登入新網站。</span></div></section>
    <section className="pa-controls pa-no-print" aria-label="核對表篩選"><div className="pa-status-tabs">{["active", "onHold", "sold", "all"].map(value => <button type="button" key={value} aria-pressed={status === value} disabled={noteDirty || inFlight} onClick={() => { if (mayChangeView()) setStatus(value); }}>{value === "all" ? "全部物件" : auditStatusLabel(value)}<span>{counts[value]}</span></button>)}</div><div className="pa-search"><label>找物件<input type="search" aria-label="搜尋核對物件" placeholder="案名、委託編號、地址或業務姓名" disabled={noteDirty || inFlight} value={query} onChange={event => { if (!noteDirty || mayChangeView()) setQuery(event.target.value); }} /></label><label>核對狀況<select aria-label="核對狀況" disabled={noteDirty || inFlight} value={review} onChange={event => { if (mayChangeView()) setReview(event.target.value); }}><option value="all">全部</option><option value="pending">尚未完成</option><option value="done">四項完成</option><option value="stale">資料更新，待重核</option><option value="notes">有核對備註</option><option value="duplicates">重複委託編號</option></select></label><label className="pa-print-setting"><input type="checkbox" checked={printBlank} onChange={event => setPrintBlank(event.target.checked)} />列印空白核對欄</label></div><p className="pa-explanation">「官網已核對」代表人工確認過上架狀況，與系統顯示的「已上架／未上架」分開記錄。價格、地址等資料更新時，相關舊勾選會提示重新核對。</p><div className="pa-read-time">資料讀取：{auditDate(loadedAt) || "讀取中"} · 現在顯示 {rows.length}／{all.length} 筆</div></section>
    {noteDirty && <p className="pa-load-error pa-no-print">有尚未儲存的備註，請先按該筆的「儲存備註」或「取消」，再篩選、更新或列印。</p>}
    {!!duplicates.size && <p className="pa-duplicate-notice pa-no-print">資料內有 {duplicates.size} 組重複委託編號，本表保留各筆原始狀態。可選「全部物件」及「重複委託編號」核對，沒有刪除或合併原資料。</p>}
    {notice && <div className="pa-notice pa-no-print" role="status">{notice}</div>}
    {error && <div className="pa-load-error pa-no-print" role="alert">資料讀取失敗，請按「更新清單」重試。{all.length ? "目前仍顯示上次讀取的資料。" : ""}</div>}
    <div className="pa-table-wrap"><table className="pa-table"><colgroup><col className="pa-col-index"/><col className="pa-col-name"/><col className="pa-col-address"/><col className="pa-col-price"/>{AUDIT_FIELDS.map(field => <col key={field.key} className={`pa-col-check pa-col-${field.key}`}/>)}<col className="pa-col-note"/></colgroup><thead><tr className="pa-print-title"><th colSpan={9}>捷運樂善店・物件核對表<span>{status === "all" ? "全部物件" : auditStatusLabel(status)} · {rows.length} 筆 · 列印 {auditDate(new Date())} · 核對人：_______________</span>{(noteDirty || inFlight) && <span>注意：有內容尚未儲存，本表只印已儲存紀錄。</span>}</th></tr><tr><th scope="col">序</th><th scope="col">物件名稱／委託編號</th><th scope="col">地址</th><th scope="col">售價</th>{AUDIT_FIELDS.map(field => <th scope="col" key={field.key}>{field.label}</th>)}<th scope="col">核對備註</th></tr></thead><tbody>{rows.map((row, index) => <tr key={row.id}>
      <td className="pa-index">{index + 1}<small>{auditProgress(row).done}/4</small></td>
      <td className="pa-name"><strong>{row.title || "待補案名"}</strong><span className="pa-code">{row.listingNo || "編號待補"}</span><small>{auditStatusLabel(row.status)}</small>{duplicates.has(String(row.listingNo || "").normalize("NFKC").trim().toUpperCase()) && <small className="pa-duplicate-tag">同編號有重複資料</small>}<Link className="pa-no-print pa-detail-link" to={`/properties?open=${encodeURIComponent(row.id)}`}>查看物件</Link></td>
      <td className="pa-address">{row.address || "待補地址"}</td><td className="pa-price">{auditMoney(row)}</td>
      {AUDIT_FIELDS.map(field => { const state = auditCheckState(row, field.key), cell = `${row.id}:${field.key}`, url = field.key === "website" && auditWebsiteUrl(row); return <td key={field.key} className="pa-check-cell">{field.key === "website" && <div className={`pa-website pa-website-${propertyWebsiteStatus(row)}`}><b>{auditWebsiteLabel(row)}</b><small>系統查核 {auditDate(row.officialStatusCheckedAt, true) || "尚無紀錄"}</small>{url && <a className="pa-no-print" href={url} target="_blank" rel="noopener noreferrer">開啟官網 ↗</a>}</div>}<label className={`pa-check pa-no-print${state.checked ? " is-checked" : ""}`}><input type="checkbox" aria-label={`${row.listingNo} ${field.label}`} checked={state.checked} disabled={!!busy[cell] || refreshing} onChange={event => changeCheck(row, field.key, event.target.checked)}/><span>{busy[cell] ? "儲存中" : field.label}</span></label><span className="pa-print-box">{state.checked ? "✓" : ""}</span>{state.stale && <small className="pa-stale">資料已更新<br/>請重新核對</small>}{state.by && <small className="pa-check-by">{state.checked ? state.by : state.stale ? `上次：${state.by}` : ""}{(state.checked || state.stale) && <time>{auditDate(state.at, true)}</time>}</small>}{failures[cell] && <span className="pa-row-error pa-no-print" role="alert">{failures[cell]}</span>}</td>; })}
      <td className="pa-notes-cell"><AuditNote row={row} actor={actor} onPending={onNotePending}/></td>
    </tr>)}</tbody></table>{loading && !all.length && <div className="pa-empty" role="status">正在讀取捷運樂善店物件…</div>}{!loading && !rows.length && !error && <div className="pa-empty">目前沒有符合條件的物件，可切換狀態或清除搜尋。</div>}</div>
    <p className="pa-bottom pa-no-print">勾選只更新共用核對紀錄，不會修改售價、地址或官網上架旗標。尚未確認的文件請保留未勾選。</p>
  </main>;
}
