import React, { useId, useState } from "react";
import { choiceKey, choiceText, propertyTags, uniqueChoices, filterPropertyChoices, PROPERTY_TAG_LENGTH, PROPERTY_TAG_LIMIT, VIEWING_METHOD_LENGTH } from "../lib/propertyChoices";
import "./PropertyChoices.css";
import SearchSelect from "../components/SearchSelect";

export default function PropertyTagPicker({ value, choices = [], onChange, label = "小標籤", help, creatable = true, limit = PROPERTY_TAG_LIMIT }) {
  const id = useId();
  const [draft, setDraft] = useState("");
  const [error, setError] = useState("");
  const selected = propertyTags(value);
  const options = uniqueChoices([...choices, ...selected]);
  const matches = filterPropertyChoices(options, draft).filter(option => !selected.some(tag => choiceKey(tag) === choiceKey(option)));
  const visibleChoices = matches.slice(0, 12);
  const add = (raw) => {
    const text = choiceText(raw);
    if (!text) return;
    if (text.length > PROPERTY_TAG_LENGTH || /[、,，\n]/.test(text)) { setError(`每次新增一個標籤，最多 ${PROPERTY_TAG_LENGTH} 字。`); return; }
    const existing = options.find((option) => choiceKey(option) === choiceKey(text));
    if (!creatable && !existing) { setError("請選擇已建立的小標籤。"); return; }
    if (selected.some((tag) => choiceKey(tag) === choiceKey(text))) { setDraft(""); setError(""); return; }
    if (selected.length >= limit) { setError(`最多選擇 ${limit} 個標籤。`); return; }
    onChange([...selected, existing || text]); setDraft(""); setError("");
  };
  return <div className="property-tag-picker">
    <div className="property-tag-heading"><label htmlFor={id}>{label}</label>{selected.length > 0 && <small>已選 {selected.length} 個</small>}</div>
    <div className="property-tag-search-row">
      <input id={id} aria-label={label} value={draft} maxLength={PROPERTY_TAG_LENGTH} placeholder={creatable ? "輸入一個字找標籤，或新增特色" : "輸入一個字找標籤"} onChange={(event) => { setDraft(event.target.value); setError(""); }} onKeyDown={(event) => {
        if (event.key !== "Enter" || event.nativeEvent.isComposing) return;
        event.preventDefault();
        if (!choiceText(draft)) return;
        const exact = options.find(option => choiceKey(option) === choiceKey(draft));
        if (exact) add(exact);
        else if (matches.length === 1) add(matches[0]);
        else if (!matches.length && creatable) add(draft);
        else if (draft.trim()) setError("請點選下方合適的標籤。");
      }} />
      {creatable && <button type="button" className="property-tag-add" disabled={!choiceText(draft)} onClick={() => add(draft)}>{choiceText(draft) ? `＋ 新增「${choiceText(draft)}」` : "＋ 新增"}</button>}
    </div>
    {selected.length > 0 && <div className="property-tag-chips">{selected.map((tag) => <button type="button" key={choiceKey(tag)} aria-label={`移除${label}：${tag}`} onClick={() => onChange(selected.filter((item) => choiceKey(item) !== choiceKey(tag)))}>{tag}<span aria-hidden="true">×</span></button>)}</div>}
    {visibleChoices.length > 0 && <div className="property-tag-options" role="group" aria-label={`${label}可選標籤`}>{visibleChoices.map(tag => <button type="button" key={choiceKey(tag)} onClick={() => add(tag)}>{tag}<span aria-hidden="true">＋</span></button>)}</div>}
    {matches.length > 12 && <small>還有 {matches.length - 12} 個標籤，輸入文字縮小範圍。</small>}
    {draft && !visibleChoices.length && <small role="status">{options.some(tag => choiceKey(tag) === choiceKey(draft)) ? "這個標籤已選取。" : creatable ? "還沒有這個標籤，可按新增。" : "沒有符合的標籤，請換一個字。"}</small>}
    {help && <small>{help}</small>}
    {error && <small role="alert" className="property-choice-error">{error}</small>}
  </div>;
}

export function PropertyViewingMethodField({ value, choices = [], onChange }) {
  return <div className="form-field property-viewing-method"><SearchSelect label="帶看方式" value={value} options={choices} onChange={onChange} maxLength={VIEWING_METHOD_LENGTH} placeholder="輸入文字找常用方式，或自行填寫" help="儲存後記住，大家下次都能選用。" /></div>;
}

export function PropertyTagBadges({ value }) {
  const tags = propertyTags(value);
  return tags.length ? <div className="property-tag-badges" aria-label="物件小標籤">{tags.map((tag) => <span key={choiceKey(tag)}>{tag}</span>)}</div> : null;
}
