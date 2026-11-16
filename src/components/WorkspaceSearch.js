import React, { useEffect, useId, useMemo, useRef, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { Search, X } from "lucide-react";
import { useAuth } from "../AuthContext";
import { useCollection } from "../hooks/useCollection";
import { useSharedCollection } from "../hooks/useSharedCollection";
import { useNeedsCollection } from "../hooks/useNeedsCollection";
import { useCompanyRentals } from "../hooks/useCompanyRentals";
import { searchWorkspace } from "../lib/workspaceSearch";
import "./WorkspaceSearch.css";

function SearchResults({ query, inputRef, onSelect, panelId }) {
  const { user } = useAuth();
  const properties = useCollection("properties", "createdAt");
  const buyers = useSharedCollection("contacts", "name", user.uid);
  const needs = useNeedsCollection(user.uid);
  const rentals = useCompanyRentals(user.uid);
  const groups = useMemo(() => searchWorkspace({ query, uid: user.uid, properties: properties.items, buyers: buyers.items, needs: needs.items, rentals: rentals.items }), [query, user.uid, properties.items, buyers.items, needs.items, rentals.items]);
  const sources = [["物件", properties], ["買方", buyers], ["客需", needs], ["公司租賃", rentals]];
  const loading = sources.some(([, source]) => source.loading);
  const errors = sources.filter(([, source]) => source.error).map(([label]) => label);
  const count = groups.reduce((total, group) => total + group.count, 0);
  const moveFocus = event => {
    if (!["ArrowDown", "ArrowUp"].includes(event.key)) return;
    const links = [...event.currentTarget.querySelectorAll("a")], index = links.indexOf(document.activeElement);
    event.preventDefault();
    if (event.key === "ArrowUp" && index <= 0) inputRef.current?.focus();
    else links[(index + (event.key === "ArrowDown" ? 1 : -1) + links.length) % links.length]?.focus();
  };
  return <section id={panelId} className="workspace-search-results" aria-label="工作台搜尋結果" onKeyDown={moveFocus}>
    <div className="workspace-search-summary" role="status">{loading ? "正在搜尋可查看的資料…" : `找到 ${count} 筆`}</div>
    {!!errors.length && <p className="workspace-search-warning" role="status">{errors.join("、")}暫時無法讀取；其他結果仍可開啟。</p>}
    {groups.filter(group => group.count).map(group => <section className="workspace-search-group" key={group.key} aria-label={group.label}>
      <h3>{group.label}<span>{group.count} 筆</span></h3>
      <ul>{group.rows.map(row => <li key={row.id}><Link to={row.to} onClick={onSelect}>
        <span className="workspace-search-row-title"><strong>{row.title}</strong><small>{row.status}</small></span>
        {row.subtitle && <span className="workspace-search-row-detail">{row.subtitle}</span>}
      </Link></li>)}</ul>
      {group.count > group.rows.length && <p className="workspace-search-more">先列出 {group.rows.length} 筆，輸入更完整的案名、編號或姓名可縮小範圍。</p>}
    </section>)}
    {!loading && !errors.length && !count && <p className="workspace-search-empty">找不到「{query}」。可試試案名、委託書編號、姓名、電話、社區或路段。</p>}
    <p className="workspace-search-help">只搜尋你可查看的資料。↑↓ 選擇，Enter 開啟，Esc 收起。</p>
  </section>;
}

export default function WorkspaceSearch() {
  const [query, setQuery] = useState(""), [open, setOpen] = useState(false);
  const rootRef = useRef(null), inputRef = useRef(null);
  const location = useLocation(), panelId = `workspace-search-${useId()}`;
  const visible = open && !!query.trim();
  useEffect(() => { setOpen(false); setQuery(""); }, [location.pathname, location.search]);
  useEffect(() => {
    if (!open) return;
    const closeOutside = event => { if (!rootRef.current?.contains(event.target)) setOpen(false); };
    document.addEventListener("pointerdown", closeOutside);
    return () => document.removeEventListener("pointerdown", closeOutside);
  }, [open]);
  const focusFirst = () => rootRef.current?.querySelector(".workspace-search-results a")?.focus();
  return <div className="workspace-search" ref={rootRef} onKeyDown={event => {
    if (event.key === "Escape") { event.preventDefault(); inputRef.current?.focus(); setOpen(false); }
  }}>
    <form role="search" aria-label="搜尋工作台" className="workspace-search-field" onSubmit={event => { event.preventDefault(); setOpen(true); focusFirst(); }}>
      <Search size={16} aria-hidden="true" />
      <input ref={inputRef} type="search" aria-label="搜尋工作台" placeholder="搜尋工作台" maxLength={80} value={query} autoComplete="off" aria-expanded={visible} aria-controls={visible ? panelId : undefined} onFocus={() => setOpen(true)} onClick={() => setOpen(true)} onChange={event => { setQuery(event.target.value); setOpen(true); }} onKeyDown={event => { if (event.key === "ArrowDown" && visible) { event.preventDefault(); focusFirst(); } }} />
      {!!query && <button type="button" className="workspace-search-clear" aria-label="清除工作台搜尋" onClick={() => { setQuery(""); inputRef.current?.focus(); }}><X size={15} aria-hidden="true" /></button>}
    </form>
    {visible && <SearchResults query={query.trim()} inputRef={inputRef} panelId={panelId} onSelect={() => { setOpen(false); setQuery(""); }} />}
  </div>;
}
