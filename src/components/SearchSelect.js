import React, { useEffect, useId, useMemo, useRef, useState } from "react";
import "./WorkflowControls.css";

const key = text => String(text ?? "").normalize("NFKC").replace(/\s+/g, "").toLocaleLowerCase();
export default function SearchSelect({ label, value = "", onChange, options = [], allowCustom = true, placeholder = "輸入文字搜尋或選擇", disabled = false, maxLength, fallbackLabel, inputProps = {}, maxVisible = 80, help }) {
  const generated = useId(), id = inputProps.id || `search-select-${generated}`, listId = `${id}-list`;
  const root = useRef(null), input = useRef(null), list = useRef(null), suppressFocus = useRef(false);
  const [above, setAbove] = useState(false);
  const [open, setOpen] = useState(false), [query, setQuery] = useState(""), [active, setActive] = useState(-1);
  const rows = useMemo(() => {
    const seen = new Set();
    return options.map(option => typeof option === "string" ? { value: option, label: option } : option).filter(option => {
      if (!option || seen.has(String(option.value))) return false;
      seen.add(String(option.value)); return true;
    });
  }, [options]);
  const selected = rows.find(row => String(row.value) === String(value));
  const currentLabel = selected?.label ?? fallbackLabel ?? value;
  const matches = rows.filter(row => !row.disabled && key(`${row.label} ${row.searchText || ""}`).includes(key(query)));
  const visible = matches.slice(0, maxVisible);
  const choose = option => { onChange(option.value); setQuery(""); setOpen(false); setActive(-1); if (document.activeElement !== input.current) { suppressFocus.current = true; input.current?.focus(); } };
  useEffect(() => {
    if (!open) return;
    const outside = event => { if (!root.current?.contains(event.target)) { setOpen(false); setActive(-1); } };
    document.addEventListener("pointerdown", outside);
    return () => document.removeEventListener("pointerdown", outside);
  }, [open]);
  useEffect(() => { if (open && active >= 0) list.current?.children[active]?.scrollIntoView?.({ block: "nearest" }); }, [open, active]);
  const start = (all = false) => {
    const rect = input.current?.getBoundingClientRect();
    let top = 0, bottom = window.innerHeight;
    for (let parent = root.current?.parentElement; parent; parent = parent.parentElement) {
      if (/(auto|scroll|hidden)/.test(window.getComputedStyle(parent).overflowY)) {
        const bounds = parent.getBoundingClientRect(); top = Math.max(top, bounds.top); bottom = Math.min(bottom, bounds.bottom); break;
      }
    }
    if (rect) setAbove(bottom - rect.bottom < 310 && rect.top - top > bottom - rect.bottom);
    setQuery(all || !allowCustom ? "" : String(currentLabel || "")); setActive(-1); setOpen(true);
  };
  function keyboard(event) {
    if (event.nativeEvent.isComposing) return;
    if (event.key === "Escape") { event.preventDefault(); setOpen(false); setActive(-1); return; }
    if (["ArrowDown", "ArrowUp"].includes(event.key)) {
      event.preventDefault(); if (!open) start(true);
      setActive(current => visible.length ? Math.max(0, Math.min(visible.length - 1, current + (event.key === "ArrowDown" ? 1 : -1))) : -1);
    } else if (open && ["Home", "End"].includes(event.key)) {
      event.preventDefault(); setActive(visible.length ? event.key === "Home" ? 0 : visible.length - 1 : -1);
    } else if (open && event.key === "Enter") {
      event.preventDefault();
      if (active >= 0 && visible[active]) choose(visible[active]);
      else if (visible.length === 1) choose(visible[0]);
      else if (allowCustom) setOpen(false);
    }
  }
  return <div className="search-select" ref={root} onBlur={event => { if (!event.currentTarget.contains(event.relatedTarget)) { setOpen(false); setActive(-1); } }}>
    <label className="search-select-label" htmlFor={id}>{label}</label>
    <div className="search-select-control">
      <input {...inputProps} ref={input} id={id} type="text" role="combobox" aria-autocomplete="list" aria-expanded={open && !disabled} aria-controls={open ? listId : undefined} aria-activedescendant={open && active >= 0 && visible[active] ? `${listId}-${active}` : undefined} autoComplete="off" disabled={disabled} value={open ? query : currentLabel} maxLength={maxLength} placeholder={placeholder} onFocus={() => { if (suppressFocus.current) { suppressFocus.current = false; return; } start(); }} onChange={event => { setQuery(event.target.value); setOpen(true); setActive(-1); if (allowCustom) onChange(event.target.value); }} onKeyDown={keyboard} />
      <button type="button" className="search-select-toggle" disabled={disabled} aria-label={`${open ? "收起" : "展開"}${label.replace(/＊/g, "")}選單`} aria-expanded={open} onMouseDown={event => event.preventDefault()} onClick={() => open ? setOpen(false) : start(true)}><span aria-hidden="true">⌄</span></button>
      {open && !disabled && <div className={`search-select-dropdown${above ? " is-above" : ""}`}>
        {!allowCustom && value && <p className="search-select-current">目前：{currentLabel}</p>}
        <div className="search-select-count" role="status">{query ? `找到 ${matches.length} 筆` : `可選 ${matches.length} 筆`}</div>
        <div ref={list} id={listId} role="listbox" aria-label={`${label.replace(/＊/g, "")}選項`} className="search-select-options">{visible.map((option, index) => <button type="button" role="option" aria-label={option.label} aria-selected={String(value) === String(option.value)} id={`${listId}-${index}`} key={option.value} tabIndex={-1} className={active === index ? "is-active" : ""} onMouseDown={event => event.preventDefault()} onClick={() => choose(option)}><span>{option.label}</span>{option.description && <small>{option.description}</small>}{String(value) === String(option.value) && <span aria-hidden="true" className="search-select-check">✓</span>}</button>)}</div>
        {!matches.length && <p className="search-select-empty">{allowCustom ? "沒有相符選項，可直接使用你輸入的內容。" : "沒有相符選項，請換個字搜尋。"}</p>}
        {matches.length > maxVisible && <p className="search-select-empty">還有 {matches.length - maxVisible} 筆，請輸入文字縮小範圍。</p>}
      </div>}
    </div>
    {help && <small className="search-select-help">{help}</small>}
  </div>;
}
