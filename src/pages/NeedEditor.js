import React, { useState } from "react";
import { TAIWAN_CITIES, TAIWAN_REGIONS } from "../lib/taiwanRegions";
import { normalizeNeedRanges, rangeStatText } from "../lib/needsFields";
import { needShareTitle } from "../lib/needPrivacy";
import NeedCriteriaTiers, { NeedTierSummary } from "./NeedCriteriaTiers";

export const newNeedForm = (contactId = "", contactName = "") => ({
  title: "", shareAlias: "", contactId, contactName, statusTag: "正在找", areas: [{ city: "", district: "", community: "" }],
  types: [], purposes: [], motivation: "", ...normalizeNeedRanges({}), floorMin: "", floorMax: "", topFloorOnly: false,
  criteriaLevels: {}, parkingRequired: false, preferredFeatures: "", excludeGroundFloor: false, excludeTopFloor: false,
  excludeMechanicalParking: false, excludedFeatures: "", notes: "", shared: false, recommendedProperties: [],
});

export function NeedStats({ need }) {
  const n = { ...need, ...normalizeNeedRanges(need) };
  const stats = [["budget", "萬", "總價"], ["mainArea", "坪", "主建物坪數"], ["rooms", "房", "房數"], ["bath", "衛", "衛浴"], ["age", "年", "屋齡"], ["floor", "樓", "樓層"]]
    .map(([key, unit, label]) => ({ label, text: rangeStatText(n[`${key}Min`], n[`${key}Max`], unit) })).filter(s => s.text);
  return stats.length ? <div className="needs-stats">{stats.map(s => <div key={s.label}><strong>{s.text}</strong><small>{s.label}</small></div>)}</div> : null;
}

export default function NeedEditor({ value, onChange, buyers, linkedBuyer, ownerName, onSubmit, onCancel, saving, error }) {
  const f = value;
  const [advanced, setAdvanced] = useState(false);
  const set = (key, val) => onChange({ ...f, [key]: val });
  const range = (key, label) => <label className="need-field" key={key}><span>{label}</span><div className="need-range"><input aria-label={`${label}最低`} inputMode="decimal" type="number" min="0" placeholder="不限" value={f[`${key}Min`]} onChange={e => set(`${key}Min`, e.target.value)} /><span>～</span><input aria-label={`${label}最高`} inputMode="decimal" type="number" min="0" placeholder="不限" value={f[`${key}Max`]} onChange={e => set(`${key}Max`, e.target.value)} /></div></label>;
  return <form className="need-editor" onSubmit={onSubmit}>
    <div className="need-editor-heading"><h3>{f.id ? "編輯找房條件" : "新增找房條件"}</h3><button className="btn ghost" type="button" onClick={onCancel}>取消</button></div>
    {!linkedBuyer && <label className="need-field"><span>連結買方（僅本人及主要負責人可見）</span><select value={f.contactId} onChange={e => { const b = buyers.find(x => x.id === e.target.value); onChange({ ...f, contactId: e.target.value, contactName: b?.name || "" }); }}><option value="">先只建立需求，之後再連結</option>{buyers.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}</select></label>}
    {linkedBuyer && <p className="need-help">已連結買方：{f.contactName} · 姓名不會出現在共享客需。</p>}
    <div className="need-basic-grid">{range("budget", "總價（萬）")}{range("rooms", "房數")}{range("mainArea", "主建物坪數")}
      <label className="need-field"><span>需求狀態</span><select value={f.statusTag} onChange={e => set("statusTag", e.target.value)}>{["正在找", "已成交", "暫緩"].map(s => <option key={s}>{s}</option>)}</select></label>
    </div>
    <fieldset className="need-areas"><legend>想找的區域／社區／路段</legend>{f.areas.map((a, index) => <div className="need-area-row" key={index}>
      <select aria-label={`第${index + 1}區域縣市`} value={a.city} onChange={e => set("areas", f.areas.map((x, i) => i === index ? { ...x, city: e.target.value, district: "" } : x))}><option value="">不限縣市</option>{a.city && !TAIWAN_CITIES.includes(a.city) && <option value={a.city}>{a.city}（舊資料，請確認）</option>}{TAIWAN_CITIES.map(c => <option key={c}>{c}</option>)}</select>
      <select aria-label={`第${index + 1}區域行政區`} value={a.district} disabled={!TAIWAN_REGIONS[a.city]} onChange={e => set("areas", f.areas.map((x, i) => i === index ? { ...x, district: e.target.value } : x))}><option value="">不限行政區</option>{a.district && !(TAIWAN_REGIONS[a.city] || []).includes(a.district) && <option>{a.district}</option>}{(TAIWAN_REGIONS[a.city] || []).map(d => <option key={d}>{d}</option>)}</select>
      <input aria-label={`第${index + 1}區域社區或路段`} placeholder="指定社區／路段（選填）" value={a.community} onChange={e => set("areas", f.areas.map((x, i) => i === index ? { ...x, community: e.target.value } : x))} />
      {f.areas.length > 1 && <button type="button" className="btn ghost" onClick={() => set("areas", f.areas.filter((_, i) => i !== index))}>移除區域</button>}
    </div>)}<button type="button" className="btn ghost" onClick={() => set("areas", [...f.areas, { city: "", district: "", community: "" }])}>＋ 新增區域</button></fieldset>
    <fieldset className="need-type-options"><legend>物件類型（可複選）</legend>{["公寓", "大樓", "廠房", "透天", "土地", "車位"].map(t => <label key={t}><input type="checkbox" checked={f.types.includes(t)} onChange={e => set("types", e.target.checked ? [...f.types, t] : f.types.filter(x => x !== t))} />{t}</label>)}</fieldset>
    <label className="need-check"><input type="checkbox" checked={f.parkingRequired} onChange={e => set("parkingRequired", e.target.checked)} />一定要有車位</label>
    <button className="btn ghost need-advanced-toggle" type="button" aria-expanded={advanced} onClick={() => setAdvanced(!advanced)}>{advanced ? "收起更多條件" : "更多條件／私人備註"}</button>
    {advanced && <section className="need-advanced">
      <div className="need-basic-grid">{range("bath", "衛浴數")}{range("age", "屋齡（年）")}{range("floor", "樓層")}</div>
      <label className="need-check"><input type="checkbox" checked={f.topFloorOnly} onChange={e => set("topFloorOnly", e.target.checked)} />偏好頂樓</label>
      <fieldset className="need-type-options"><legend>用途</legend>{["辦公", "住宅", "店面"].map(t => <label key={t}><input type="checkbox" checked={f.purposes.includes(t)} onChange={e => set("purposes", e.target.checked ? [...f.purposes, t] : f.purposes.filter(x => x !== t))} />{t}</label>)}</fieldset>
      <label className="need-field"><span>購屋目的</span><select value={f.motivation} onChange={e => set("motivation", e.target.value)}><option value="">未指定</option><option>自用</option><option>投資</option></select></label>
      <NeedCriteriaTiers form={f} setForm={onChange} />
      <label className="need-field"><span>私人名稱（僅本人及主要負責人可見）</span><input value={f.title} onChange={e => set("title", e.target.value)} placeholder="例如：陳先生換屋需求" /></label>
      <label className="need-field"><span>私人備註（僅本人及主要負責人可見）</span><textarea value={f.notes} rows="3" onChange={e => set("notes", e.target.value)} placeholder="聯繫細節等私人紀錄" /></label>
    </section>}
    <section className="need-share-settings">
      <label className="need-check"><input type="checkbox" checked={f.shared} onChange={e => set("shared", e.target.checked)} />分享找房條件給所有已登入同事</label>
      <label className="need-field"><span>共享需求代稱（選填，不填由系統產生）</span><input value={f.shareAlias || ""} onChange={e => set("shareAlias", e.target.value)} placeholder="例如：A7兩房平車需求，請勿填客戶姓名" /></label>
      <details className="need-share-preview"><summary>查看同事會看到的內容</summary><strong>{needShareTitle(f)}</strong><NeedStats need={f} /><p>{f.areas.map(a => [a.city, a.district, a.community].filter(Boolean).join("")).filter(Boolean).join("／") || "區域不限"}</p><p>{f.types.join("、") || "類型不限"} · 負責業務：{ownerName}</p><NeedTierSummary need={f} /><p className="need-help">買方姓名、電話、買方連結及私人備註不會共享。代稱與條件欄位請只填找房資訊。</p></details>
    </section>
    {error && <p role="alert" className="need-error">{error}</p>}
    <div className="needs-form-actions"><span>{f.shared ? "將分享找房條件" : "目前僅本人及主要負責人可見"}</span><button className="btn" type="submit" disabled={saving}>{saving ? "儲存中…" : f.id ? "儲存變更" : "新增客需"}</button><button className="btn ghost" type="button" disabled={saving} onClick={onCancel}>取消</button></div>
  </form>;
}
