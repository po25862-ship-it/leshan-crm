import React, { useEffect, useRef, useState } from "react";
import { isRental591Url } from "../lib/companyRentalWebsite";
import { rentalMoney } from "../lib/companyRental";
import { defaultRentalImportKeys, rentalImportFields } from "../lib/rentalListingImport";
import { loadRentalListingInfo } from "../lib/rentalWebsiteClient";

const display = value => Array.isArray(value) ? value.join("、") : String(value ?? "");
export default function Rental591Import({ form, user, disabled, onApply, onBusyChange, initiallyOpen = true }) {
  const [expanded, setExpanded] = useState(initiallyOpen);
  const [url, setUrl] = useState(isRental591Url(form.websiteUrl) ? form.websiteUrl : "");
  const [busy, setBusy] = useState(false), [error, setError] = useState("");
  const [preview, setPreview] = useState(null), [selected, setSelected] = useState([]);
  const request = useRef(0), latestForm = useRef(form);
  useEffect(() => { latestForm.current = form; }, [form]);
  useEffect(() => () => { request.current++; }, []);
  async function read() {
    if (busy || disabled) return;
    if (!isRental591Url(url)) { setError("請貼上完整的 591 租屋或店面出租網址。"); return; }
    const id = ++request.current; setBusy(true); onBusyChange(true); setError(""); setPreview(null);
    try {
      const info = await loadRentalListingInfo(user, url);
      if (request.current !== id) return;
      if (info.status === "unlisted") throw new Error("這筆 591 已下架，請確認網址；表單內容未更動。");
      if (!rentalImportFields(info).length) throw new Error("目前讀不到這筆 591 的物件資料，請稍後再試；表單內容未更動。");
      setPreview(info); setSelected(defaultRentalImportKeys(latestForm.current, info));
    } catch (error) { if (request.current === id) setError(error.message || "591 暫時無法讀取，請稍後再試。"); }
    finally { if (request.current === id) { setBusy(false); onBusyChange(false); } }
  }
  const fields = rentalImportFields(preview);
  return <section className="cr-import" aria-label="從 591 帶入資料">
    <h3><button className="cr-import-toggle" type="button" aria-expanded={expanded} onClick={() => setExpanded(value => !value)}><span>貼上 591 網址，快速帶入資料</span><small>{expanded ? "收起" : "展開"}</small></button></h3>
    {expanded && <>
    <p>支援住宅與店面出租，可讀取案名、租金、社區、格局、坪數與刊登條件。帶入後仍可修改，按儲存才會建立案件。</p>
    <div className="cr-import-input"><label className="cr-field"><span>591 租屋網址</span><input type="url" value={url} disabled={disabled} placeholder="住宅或店面出租的 591 網址" onChange={event => { request.current++; setUrl(event.target.value); setPreview(null); setError(""); setBusy(false); onBusyChange(false); }} onKeyDown={event => { if (event.key === "Enter" && !event.nativeEvent.isComposing) { event.preventDefault(); read(); } }} /></label><button type="button" disabled={busy || disabled} onClick={read}>{busy ? "讀取 591 中…" : "讀取 591 資料"}</button></div>
    {error && <p className="cr-error" role="alert">{error}</p>}
    {preview && <div className="cr-import-preview">
      <strong>{preview.listing.title || "591 物件資料"}</strong>
      <p>{[typeof preview.listing.rent === "number" && `月租 ${rentalMoney(preview.listing.rent)} 元`, preview.listing.community, preview.listing.street, preview.listing.size && `${preview.listing.size} 坪`].filter(Boolean).join("・")}</p>
      <p>可帶入 {fields.length} 項。已填過的內容預設保留，可展開選擇要覆蓋的欄位。</p>
      <details><summary>查看與選擇帶入欄位（已選 {selected.length} 項）</summary><div className="cr-import-fields">{fields.map(field => <label key={field.key}><input type="checkbox" checked={selected.includes(field.key)} disabled={disabled} onChange={event => setSelected(current => event.target.checked ? [...current, field.key] : current.filter(key => key !== field.key))} /><span><b>{field.label}</b><span>{display(field.value)}</span>{display(form[field.key]) && display(form[field.key]) !== display(field.value) && <small>目前：{display(form[field.key])}</small>}</span></label>)}</div></details>
      <div className="cr-actions"><button type="button" className="cr-primary" disabled={disabled || !selected.length} onClick={() => { onApply(preview, selected); setPreview(null); setExpanded(false); }}>帶入表單（{selected.length} 項）</button><button type="button" disabled={disabled} onClick={() => setPreview(null)}>取消帶入</button></div>
      <p className="cr-import-help">完整門牌、帶看方式及未公開的費用請自行確認。照片可另行上傳。</p>
    </div>}
    </>}
  </section>;
}
