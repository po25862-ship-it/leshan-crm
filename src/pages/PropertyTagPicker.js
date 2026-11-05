import React, { useId, useState } from "react";
import { choiceKey, choiceText, propertyTags, uniqueChoices, PROPERTY_TAG_LENGTH, PROPERTY_TAG_LIMIT } from "../lib/propertyChoices";
import "./PropertyChoices.css";

export default function PropertyTagPicker({ value, choices = [], onChange, label = "小標籤", help, creatable = true, limit = PROPERTY_TAG_LIMIT }) {
  const id = useId();
  const [draft, setDraft] = useState("");
  const [error, setError] = useState("");
  const selected = propertyTags(value);
  const options = uniqueChoices([...choices, ...selected]);
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
    <label htmlFor={creatable ? id : `${id}-select`}>{label}</label>
    <div className="property-choice-inputs">
      <select id={`${id}-select`} aria-label={`${label}選單`} value="" onChange={(event) => add(event.target.value)}>
        <option value="">{options.length ? "選擇已記住的標籤" : "尚無共用標籤"}</option>
        {options.filter((option) => !selected.some((tag) => choiceKey(tag) === choiceKey(option))).map((option) => <option key={choiceKey(option)} value={option}>{option}</option>)}
      </select>
      {creatable && <div className="property-choice-add"><input id={id} aria-label={label} value={draft} maxLength={PROPERTY_TAG_LENGTH} placeholder="例如：邊間、有裝潢（一次一個）" onChange={(event) => { setDraft(event.target.value); setError(""); }} onKeyDown={(event) => { if (event.key === "Enter" && !event.nativeEvent.isComposing) { event.preventDefault(); add(draft); } }} /><button type="button" className="btn ghost" onClick={() => add(draft)}>新增標籤</button></div>}
    </div>
    {selected.length > 0 && <div className="property-tag-chips">{selected.map((tag) => <button type="button" key={choiceKey(tag)} aria-label={`移除${label}：${tag}`} onClick={() => onChange(selected.filter((item) => choiceKey(item) !== choiceKey(tag)))}>{tag}<span aria-hidden="true">×</span></button>)}</div>}
    {help && <small>{help}</small>}
    {error && <small role="alert" className="property-choice-error">{error}</small>}
  </div>;
}

export function PropertyTagBadges({ value }) {
  const tags = propertyTags(value);
  return tags.length ? <div className="property-tag-badges" aria-label="物件小標籤">{tags.map((tag) => <span key={choiceKey(tag)}>{tag}</span>)}</div> : null;
}
