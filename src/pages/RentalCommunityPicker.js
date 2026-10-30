import React, { useId, useState } from "react";
import { A7_RENTAL_COMMUNITIES, searchRentalCommunities } from "../lib/rentalCommunities";

export default function RentalCommunityPicker({ value, onChange }) {
  const id = useId(), listId = `${id}-options`;
  const [open, setOpen] = useState(false), [showAll, setShowAll] = useState(false), [active, setActive] = useState(-1);
  const matches = searchRentalCommunities(showAll ? "" : value);
  const pick = name => { onChange(name); setOpen(false); setActive(-1); setShowAll(false); };
  function keyboard(event) {
    if (event.nativeEvent.isComposing) return;
    if (event.key === "Escape") { setOpen(false); setActive(-1); return; }
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault(); setOpen(true);
      if (!matches.length) { setActive(-1); return; }
      const next = event.key === "ArrowDown" ? Math.min(active + 1, matches.length - 1) : Math.max(active - 1, 0);
      setActive(next);
      document.getElementById(`${listId}-${next}`)?.scrollIntoView?.({ block: "nearest" });
    } else if (event.key === "Enter" && open && active >= 0 && matches[active]) {
      event.preventDefault(); pick(matches[active].name);
    }
  }
  return <div className="cr-field cr-community-picker" onBlur={event => { if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false); }}>
    <label htmlFor={id}>社區名稱</label>
    <div className="cr-community-control">
      <input id={id} role="combobox" aria-autocomplete="list" aria-expanded={open} aria-controls={open ? listId : undefined} aria-activedescendant={open && active >= 0 ? `${listId}-${active}` : undefined} autoComplete="off" value={value || ""} placeholder="搜尋或選擇 A7 社區，也可自行輸入" onFocus={() => { setOpen(true); setShowAll(false); }} onChange={event => { onChange(event.target.value); setOpen(true); setShowAll(false); setActive(-1); }} onKeyDown={keyboard} />
      <button type="button" className="cr-community-toggle" aria-label={open ? "收起社區選單" : "展開全部 A7 社區"} aria-expanded={open} onClick={() => { setOpen(current => !current); setShowAll(true); setActive(-1); }}>⌄</button>
      {open && <div className="cr-community-dropdown"><div className="cr-community-count">{showAll || !value ? `全部 A7 社區（${matches.length}）` : `符合的社區（${matches.length}）`}</div><div id={listId} role="listbox" aria-label="A7 社區清單" className="cr-community-options">
        {matches.map((row, index) => <button type="button" role="option" tabIndex={-1} id={`${listId}-${index}`} key={row.name} aria-selected={value === row.name} className={index === active ? "is-active" : ""} onMouseDown={event => event.preventDefault()} onClick={() => pick(row.name)}>{row.name}</button>)}
      </div>{!matches.length && <p className="cr-community-empty">找不到符合的社區，可直接使用目前輸入的名稱。</p>}</div>}
    </div>
    <small>已收錄 {A7_RENTAL_COMMUNITIES.length} 個 A7 社區，可挑選或直接輸入其他社區。</small>
  </div>;
}
