import React, { useState, useMemo, useEffect, useRef } from "react";
import { useSearchParams } from "react-router-dom";
import { useNeedsCollection } from "../hooks/useNeedsCollection";
import { useSharedCollection } from "../hooks/useSharedCollection";
import { useCollection } from "../hooks/useCollection";
import { useAuth } from "../AuthContext";
import RecommendedProperties from "./RecommendedProperties";
import { normalizeNeedRanges } from "../lib/needsFields";
import { canManageNeed, needShareTitle, NEED_OWNER_UID } from "../lib/needPrivacy";
import { useIsMobile } from "../hooks/useIsMobile";
import { NeedTierSummary } from "./NeedCriteriaTiers";
import NeedEditor, { newNeedForm, NeedStats } from "./NeedEditor";
import { recommendationCounts } from "../lib/recommendationStatus";
import "./Needs.css";

export default function Needs({ contactId = "", contactName = "", embedded = false }) {
  const { user } = useAuth();
  const { items, add, update, remove, introduce, refresh, loading, error: loadError, loadedAt } = useNeedsCollection(user.uid);
  const { items: contacts } = useSharedCollection("contacts", "name", user.uid);
  const { items: colleagues } = useCollection("colleagues", "name");
  const buyers = contacts.filter(c => (c.tags || []).includes("買方"));
  const isMobile = useIsMobile();
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [editMode, setEditMode] = useState(false);
  const [form, setForm] = useState(() => newNeedForm(contactId, contactName));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [scope, setScope] = useState("all");
  const [keyword, setKeyword] = useState("");
  const [status, setStatus] = useState("");
  const didAutoOpen = useRef(false);
  const initialDraft = useRef("");
  const detailRef = useRef(null);
  const [searchParams, setSearchParams] = useSearchParams();
  const ownerName = uid => colleagues.find(c => c.id === uid)?.name || (uid === NEED_OWNER_UID ? "劉昭佑" : "同事（名冊待更新）");
  const canEditFull = !editingId || canManageNeed(form, user.uid);
  const hasDraft = () => showForm && editMode && JSON.stringify(form) !== initialDraft.current;
  const mayLeave = () => !hasDraft() || window.confirm("這筆客需還沒儲存，確定要離開嗎？");
  const close = () => { if (saving || !mayLeave()) return; setShowForm(false); setEditMode(false); setError(""); };
  const openNew = () => {
    if (!mayLeave()) return;
    const next = newNeedForm(contactId, contactName);
    initialDraft.current = JSON.stringify(next); setForm(next); setEditingId(null); setEditMode(true); setShowForm(true); setError("");
  };
  const openEdit = (item, { startInEditMode = false } = {}) => {
    if (!mayLeave()) return;
    const next = { ...newNeedForm(), ...item, ...normalizeNeedRanges(item), areas: item.areas?.length ? item.areas : newNeedForm().areas };
    initialDraft.current = JSON.stringify(next); setForm(next); setEditingId(item.id); setEditMode(startInEditMode); setShowForm(true); setError("");
  };
  useEffect(() => {
    if (embedded) return;
    const openId = searchParams.get("open");
    if (openId) { const found = items.find(n => n.id === openId); if (found) { openEdit(found); setSearchParams({}, { replace: true }); } }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items, searchParams, embedded]);
  const listedItems = useMemo(() => items.filter(n => !embedded || n.contactId === contactId), [items, embedded, contactId]);
  const filtered = useMemo(() => listedItems.filter(n => {
    if (scope === "mine" && n.ownerUid !== user.uid) return false;
    if (scope === "shared" && (n.ownerUid === user.uid || !n.shared)) return false;
    if (status && (n.statusTag || "正在找") !== status) return false;
    const text = [n.title, n.contactName, ownerName(n.ownerUid), ...(n.areas || []).flatMap(a => [a.city, a.district, a.community])].filter(Boolean).join(" ").toLowerCase();
    return !keyword.trim() || text.includes(keyword.trim().toLowerCase());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }), [listedItems, scope, status, keyword, user.uid, colleagues]);
  useEffect(() => {
    if (!embedded && !isMobile && !didAutoOpen.current && !showForm && filtered.length && !searchParams.get("open")) { didAutoOpen.current = true; openEdit(filtered[0]); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isMobile, filtered, searchParams, showForm, embedded]);
  useEffect(() => { if (isMobile && showForm) detailRef.current?.scrollIntoView?.({ block: "start" }); }, [editingId, showForm, editMode, isMobile]);
  useEffect(() => {
    if (showForm && !editMode && editingId) {
      const current = items.find(n => n.id === editingId);
      if (current) setForm({ ...newNeedForm(), ...current, ...normalizeNeedRanges(current) });
    }
  }, [items, showForm, editMode, editingId]);
  useEffect(() => {
    const handler = event => { if (hasDraft()) { event.preventDefault(); event.returnValue = ""; } };
    window.addEventListener("beforeunload", handler); return () => window.removeEventListener("beforeunload", handler);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showForm, editMode, form]);
  const onSubmit = async event => {
    event.preventDefault(); if (saving) return;
    const ranges = normalizeNeedRanges(form);
    for (const prefix of ["budget", "mainArea", "rooms", "bath", "age", "floor"]) {
      const min = form[`${prefix}Min`], max = form[`${prefix}Max`];
      if (min !== "" && max !== "" && Number(min) > Number(max)) { setError("最低條件不能大於最高條件，請再確認。"); return; }
    }
    setSaving(true); setError("");
    try {
      const next = { ...form, ...ranges, title: form.title.trim() || needShareTitle(form), lastModifiedByUid: user.uid };
      if (editingId) { await update(editingId, next); setForm(next); initialDraft.current = JSON.stringify(next); setEditMode(false); }
      else { await add({ ...next, ownerUid: user.uid }); setShowForm(false); setEditMode(false); }
      setNotice("客需已儲存" + (form.shared ? "，已分享找房條件。" : "。"));
    } catch (err) { setError(err.message || "儲存失敗，輸入內容已保留，請重試。"); }
    finally { setSaving(false); }
  };
  const handleRecommendedChange = async recommendedProperties => {
    if (editingId) await update(editingId, { recommendedProperties, lastModifiedByUid: user.uid });
    setForm(f => ({ ...f, recommendedProperties }));
  };
  const refreshNeeds = async () => { setError(""); try { await refresh?.(); setNotice(editMode ? "已更新清單，編輯中的內容已保留。" : "已讀取最新客需。" ); } catch { setError("更新失敗，原資料仍保留，請稍後再試。"); } };
  const changeFilter = (setter, value) => { if (hasDraft() && !mayLeave()) return; setter(value); if (!editMode) setShowForm(false); };
  const columns = useMemo(() => filtered.reduce((map, item) => { const tag = item.statusTag || "正在找"; (map[tag] ||= []).push(item); return map; }, {}), [filtered]);
  const Root = embedded ? "section" : "main";
  return <Root className={`needs-page${embedded ? " needs-embedded" : ""}`}>
    <div className="top-actions"><div className="section-title">客需（{filtered.length}）</div><div className="needs-detail-actions"><button className="btn ghost" type="button" disabled={loading} onClick={refreshNeeds}>{loading ? "讀取中…" : "重新整理客需"}</button><button className="btn" onClick={openNew}>＋ 新增客需</button></div></div>
    {!embedded && <div className="need-list-tools"><div className="need-scope-tabs" aria-label="客需範圍">{[["all", "全部"], ["mine", "我的"], ["shared", "同事共享"]].map(([key, label]) => <button type="button" key={key} className={scope === key ? "active" : ""} aria-pressed={scope === key} onClick={() => changeFilter(setScope, key)}>{label}</button>)}</div><label>搜尋需求<input value={keyword} placeholder="搜尋代稱、區域、社區、負責業務" onChange={e => changeFilter(setKeyword, e.target.value)} /></label><label>需求狀態<select value={status} onChange={e => changeFilter(setStatus, e.target.value)}><option value="">全部狀態</option>{["正在找", "已成交", "暫緩"].map(s => <option key={s}>{s}</option>)}</select></label></div>}
    <div className="need-list-status"><span>{loadedAt ? `最後讀取：${new Date(loadedAt).toLocaleString("zh-TW", { hour12: false })}` : loading ? "正在讀取客需…" : "可按重新整理取得最新資料"}</span>{notice && <span role="status">{notice}</span>}{(error || loadError) && <span role="alert" className="need-error">{error || "客需讀取失敗，請重新整理。"}</span>}</div>
    {showForm && <div className="panel needs-detail" ref={detailRef}>
      {editMode && canEditFull ? <NeedEditor key={editingId || "new"} value={form} onChange={setForm} buyers={buyers} linkedBuyer={!!contactId} ownerName={ownerName(form.ownerUid || user.uid)} onSubmit={onSubmit} onCancel={close} saving={saving} error={error} /> : <>
        <div className="needs-detail-header"><div className="needs-detail-heading"><h3>{form.title || needShareTitle(form)}</h3><p>負責業務：{ownerName(form.ownerUid)}</p>{canEditFull && form.contactName && <p>連結買方：{form.contactName}（僅本人及主要負責人可見）</p>}<span className="tag">{form.statusTag}</span><span className="tag">{form.shared ? "條件已共享" : "未共享"}</span></div><div className="needs-detail-actions">{canEditFull && <button className="btn ghost" type="button" onClick={() => { initialDraft.current = JSON.stringify(form); setEditMode(true); }}>編輯</button>}<button className="btn ghost" type="button" onClick={close}>關閉</button></div></div>
        <NeedStats need={form} /><p>{(form.areas || []).map(a => [a.city, a.district, a.community].filter(Boolean).join("")).filter(Boolean).join("／")}</p><p>{(form.types || []).join("、")}</p><NeedTierSummary need={form} />
        {canEditFull && form.notes && <details><summary>私人備註</summary><p style={{ whiteSpace: "pre-wrap" }}>{form.notes}</p></details>}
        {canEditFull && <details className="need-delete"><summary>管理這筆客需</summary><button type="button" className="btn danger" onClick={async () => { if (window.confirm("確定要刪除這筆客需嗎？")) { try { await remove(editingId); setShowForm(false); } catch { setError("刪除失敗，請重試。"); } } }}>刪除客需</button></details>}
      </>}
      {!editMode && <RecommendedProperties key={`${user.uid}:${editingId || "new"}`} value={form.recommendedProperties} onChange={handleRecommendedChange} need={form} onIntroduced={canEditFull && form.contactId ? async data => { const recommendedProperties = await introduce(editingId, data); setForm(f => ({ ...f, recommendedProperties })); } : undefined} />}
    </div>}
    <div className="board">{Object.entries(columns).map(([tag, list]) => <div key={tag}><div className="col-head">{tag}<span>{list.length}</span></div>{list.map(item => { const counts = recommendationCounts(item.recommendedProperties); return <div className="card" key={item.id}><h3>{item.title || needShareTitle(item)}</h3><p className="need-owner-line">負責業務：{ownerName(item.ownerUid)} · {item.ownerUid === user.uid ? "我的需求" : "同事需求"}</p>{canManageNeed(item, user.uid) && item.contactName && <p className="need-help">買方：{item.contactName}（私人）</p>}<NeedStats need={item} /><p>{(item.areas || []).map(a => [a.city, a.district, a.community].filter(Boolean).join("")).filter(Boolean).join("／")}</p>{counts.total > 0 && <p className="need-help">待處理 {counts.pending + counts.interested} 筆・已介紹 {counts.introduced} 筆・沒興趣 {counts.notInterested} 筆</p>}<div className="needs-detail-actions"><button type="button" className="btn ghost" onClick={() => openEdit(item)}>查看詳情</button>{canManageNeed(item, user.uid) && <button type="button" className="btn ghost" onClick={() => openEdit(item, { startInEditMode: true })}>編輯</button>}</div></div>; })}</div>)}{!filtered.length && !loading && <p className="empty-state">{listedItems.length ? "沒有符合篩選條件的客需。" : "還沒有客需，可新增找房條件。"}</p>}</div>
  </Root>;
}
