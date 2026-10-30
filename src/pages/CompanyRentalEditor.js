import React, { useEffect, useRef, useState } from "react";
import { COMPANY_RENTAL_STATUSES, COMPANY_RENTAL_TYPES, RENTAL_FURNITURE, rentalMonthlyCost, rentalMoney, validateCompanyRental, companyRentalForm, companyRentalColleagues, normalizeRentalFurniture, addRentalFurniture, MAX_RENTAL_FURNITURE_NAME } from "../lib/companyRental";
import { compressRentalPhoto, mergeRentalPhotos } from "../lib/companyRentalPhotos";
import { useCollection } from "../hooks/useCollection";
import { saveCompanyRental } from "../lib/companyRentalRepository";

export default function CompanyRentalEditor({ original, internal, user, profile, onSaved, onClose }) {
  const [form, setForm] = useState(() => companyRentalForm(original, internal, user, profile));
  const { items: staff, loading: staffLoading } = useCollection("colleagues", "name");
  const staffChoices = companyRentalColleagues(staff, user, profile, original);
  const [equipmentOptions, setEquipmentOptions] = useState(() => normalizeRentalFurniture([...RENTAL_FURNITURE, ...normalizeRentalFurniture(original?.furniture)]));
  const [newEquipment, setNewEquipment] = useState("");
  const [equipmentError, setEquipmentError] = useState(""), [equipmentNotice, setEquipmentNotice] = useState("");
  const equipmentInput = useRef(null);
  const [photos, setPhotos] = useState(() => original?.photos || []);
  const [status, setStatus] = useState(original?.status || "available");
  const [step, setStep] = useState(0), [busy, setBusy] = useState(false), [processing, setProcessing] = useState(false);
  const [message, setMessage] = useState(""), [error, setError] = useState("");
  const responsibleTouched = useRef(false), dirty = useRef(false), localUrls = useRef(new Set()), fileInput = useRef(null), errorRef = useRef(null);
  const cost = rentalMonthlyCost(form);
  useEffect(() => () => localUrls.current.forEach(url => URL.revokeObjectURL(url)), []);
  useEffect(() => { const warn = event => { if (dirty.current) { event.preventDefault(); event.returnValue = ""; } }; window.addEventListener("beforeunload", warn); return () => window.removeEventListener("beforeunload", warn); }, []);
  const currentStaff = staffChoices.find(item => item.id === user.uid);
  useEffect(() => {
    if (original || responsibleTouched.current || !currentStaff) return;
    setForm(current => current.agentUid === user.uid && (current.agentName !== currentStaff.name || current.agentPhone !== (currentStaff.phone || "") || current.branch !== (currentStaff.branch || ""))
      ? { ...current, agentName: currentStaff.name, agentPhone: currentStaff.phone || "", branch: currentStaff.branch || "" } : current);
  }, [original, user.uid, currentStaff?.name, currentStaff?.phone, currentStaff?.branch]);
  function chooseAgent(uid) {
    responsibleTouched.current = true; dirty.current = true;
    const selected = staffChoices.find(item => item.id === uid);
    setForm(current => selected ? { ...current, agentUid: selected.id, agentName: selected.name, agentPhone: selected.phone || "", branch: selected.branch || "" } : { ...current, agentUid: null });
  }
  const change = (key, value) => { if (["agentName", "agentPhone", "branch"].includes(key)) responsibleTouched.current = true; dirty.current = true; setForm(current => ({ ...current, [key]: value })); };
  const close = () => { if (!busy && !processing && (!dirty.current || window.confirm("尚未儲存，確定離開編輯？"))) onClose(); };
  const field = (key, label, { options, type = "text", hint, wide, ...props } = {}) => <label className={wide ? "cr-field cr-wide" : "cr-field"} key={key}><span>{label}</span>{options ? <select value={form[key] ?? ""} onChange={event => change(key, event.target.value)}>{options.map(value => <option key={value}>{value}</option>)}</select> : <input type={type} value={form[key] ?? ""} onChange={event => change(key, event.target.value)} {...props} />}{hint && <small>{hint}</small>}</label>;
  const textarea = (key, label, hint) => <label className="cr-field cr-wide"><span>{label}</span><textarea rows={3} value={form[key] || ""} onChange={event => change(key, event.target.value)} />{hint && <small>{hint}</small>}</label>;
  function prepareEquipment() {
    const result = addRentalFurniture(equipmentOptions, form.furniture, newEquipment);
    setEquipmentOptions(result.options); change("furniture", result.furniture); setNewEquipment("");
    setEquipmentError(""); setEquipmentNotice(result.added ? `已新增並勾選「${result.name}」。` : `「${result.name}」已在清單，已為你勾選。`);
    return { ...form, furniture: result.furniture };
  }
  function addEquipment() {
    try { prepareEquipment(); } catch (err) { setEquipmentError(err.message); setEquipmentNotice(""); }
    equipmentInput.current?.focus();
  }
  async function addPhotos(event) {
    const files = Array.from(event.target.files || []); event.target.value = "";
    if (!files.length) return;
    if (files.length > 10) { setError("一次最多選擇 10 張照片。"); return; }
    setProcessing(true); setError(""); setMessage("照片壓縮中…");
    const incoming = [];
    try {
      for (const file of files) { const photo = await compressRentalPhoto(file); incoming.push(photo); localUrls.current.add(photo.url); }
      const result = mergeRentalPhotos(photos, incoming);
      incoming.filter(photo => !result.photos.includes(photo)).forEach(photo => { URL.revokeObjectURL(photo.url); localUrls.current.delete(photo.url); });
      setPhotos(result.photos); dirty.current = true;
      setMessage(`已準備 ${incoming.length - result.duplicates} 張照片${result.duplicates ? `，跳過 ${result.duplicates} 張重複照片` : ""}；儲存案件時才會上傳。`);
    } catch (err) {
      incoming.forEach(photo => { URL.revokeObjectURL(photo.url); localUrls.current.delete(photo.url); }); setError(err.message); setMessage("");
    } finally { setProcessing(false); }
  }
  async function save(nextStatus) {
    setError("");
    let saveForm = form;
    if (newEquipment.trim()) {
      try { saveForm = prepareEquipment(); }
      catch (err) { setEquipmentError(err.message); setStep(1); return; }
    }
    const validation = validateCompanyRental(saveForm, nextStatus, photos);
    if (validation) { setError(validation); setTimeout(() => errorRef.current?.focus(), 0); return; }
    setBusy(true); setMessage("正在儲存…");
    try {
      const result = await saveCompanyRental({ original, form: saveForm, status: nextStatus, photos, user, profile, onProgress: setMessage });
      dirty.current = false;
      onSaved(result.rental, result.cleanupFailures.length ? "案件已儲存；部分舊照片尚未清理，請稍後重新編輯移除。" : "租賃案件已儲存。");
    } catch (err) { setError(err.message || "儲存失敗，請稍後重試。"); setMessage(""); }
    finally { setBusy(false); }
  }
  return <section className="cr-editor" aria-label="租賃案件編輯">
    <div className="cr-editor-bar"><div><small>公司租賃</small><h2>{original ? "編輯租賃物件" : "新增租賃物件"}</h2></div><div className="cr-actions"><button type="button" disabled={busy || processing} onClick={close}>取消</button><button type="button" disabled={busy || processing} onClick={() => save("draft")}>存成草稿</button><button className="cr-primary" type="button" disabled={busy || processing} onClick={() => save(status)}>{busy ? "儲存中…" : status === "available" ? "儲存並招租" : "儲存案件"}</button></div></div>
    <div className="cr-steps" role="tablist" aria-label="編輯步驟">{["基本資料", "租金與條件", "網址、照片與內部資料"].map((label, index) => <button key={label} type="button" role="tab" aria-selected={step === index} onClick={() => setStep(index)}>{index + 1}. {label}</button>)}</div>
    {error && <p className="cr-error" role="alert" tabIndex={-1} ref={errorRef}>{error}</p>}{message && <p className="cr-note" role="status">{message}</p>}
    <fieldset disabled={busy || processing} className="cr-form-body">
      {step === 0 && <><h3>先讓同事快速找到這間房</h3><div className="cr-form-grid">
        <label className="cr-field cr-wide"><span>案件負責人＊</span><select value={form.agentUid || "__manual__"} onChange={event => chooseAgent(event.target.value)}><optgroup label="店內同事">{staffChoices.map(item => <option key={item.id} value={item.id}>{item.name}{item.id === user.uid ? "（我）" : ""}</option>)}</optgroup><option value="__manual__">自行輸入業務</option></select><small>{staffLoading ? "正在讀取店內同事名冊…" : "可選擇店內同事；名單以外的業務請選「自行輸入業務」。"}</small></label>
        {!form.agentUid && field("agentName", "業務姓名＊", { maxLength: 80 })}
        {field("agentPhone", "業務聯絡電話", { type: "tel", maxLength: 40 })}{field("branch", "所屬分店", { maxLength: 80 })}
        {field("title", "案名＊", { wide: true, placeholder: "例如：金捷市採光兩房平車", maxLength: 120 })}
        {field("community", "社區名稱")}{field("type", "租賃類型", { options: COMPANY_RENTAL_TYPES })}
        {field("area", "生活圈", { options: ["A7", "A8", "A9", "其他"] })}{field("city", "縣市＊")}{field("district", "行政區＊")}{field("street", "公開路段＊", { placeholder: "例如：樂善二路", hint: "分享給客人只帶出這個路段，請勿填完整門牌。" })}
        {field("doorAddress", "完整門牌／樓層＊（內部）", { wide: true, placeholder: "供同事帶看核對，不帶入分享文字" })}
        {field("floor", "樓層", { placeholder: "例如：8／28" })}{field("rooms", "房", { type: "number", min: 0, step: 1 })}{field("living", "廳", { type: "number", min: 0, step: 1 })}{field("baths", "衛", { type: "number", min: 0, step: 1 })}
        {field("size", "坪數", { type: "number", min: 0, step: ".01" })}{field("sizeBasis", "坪數說明", { options: ["室內使用，不含車位", "權狀坪數，含車位", "權狀坪數，不含車位", "其他，請見介紹"] })}
      </div></>}
      {step === 1 && <><h3>費用先說清楚，介紹更省時間</h3><div className="cr-cost"><span>{cost.complete ? "每月固定費用" : "目前已知每月費用"}</span><strong>{rentalMoney(cost.total)} <small>元</small></strong>{!cost.complete && <small>尚待確認：{cost.missing.join("、")}</small>}<small>不含水電等依用量計收費用</small></div><div className="cr-form-grid">
        {field("rent", "月租金（元）＊", { type: "number", min: 1, step: 1 })}{field("deposit", "押金（月）", { type: "number", min: 0, step: ".5" })}
        {field("mgmtMode", "管理費", { options: ["待確認", "已含租金", "另計", "無管理費"] })}{form.mgmtMode === "另計" && field("mgmt", "管理費（元／月）", { type: "number", min: 0 })}
        {field("parking", "車位", { options: ["待確認", "無車位", "坡道平面", "坡道機械", "升降機械", "其他"] })}{form.parking !== "無車位" && field("parkMode", "車位費用", { options: ["待確認", "已含租金", "另計"] })}{form.parking !== "無車位" && form.parkMode === "另計" && field("parkFee", "車位租金（元／月）", { type: "number", min: 0 })}
        {field("minLease", "最短租期", { options: ["一年", "兩年", "半年", "可談", "待確認"] })}{field("moveIn", "可入住時間", { options: ["待確認", "隨時入住", "另約日期"] })}{form.moveIn === "另約日期" && field("availableDate", "可入住日期", { type: "date" })}
        {field("pets", "寵物", { options: ["待確認", "可養寵物", "不可養寵物", "寵物可談"] })}{field("cook", "開伙", { options: ["待確認", "可開伙", "不可開伙"] })}{field("subsidy", "租屋補助", { options: ["待確認", "可申請租補", "請洽負責同事"] })}
        {field("buyerServiceFee", "買方服務費（對客人顯示）", { wide: true, hint: "例如：半個月租金、月租金 50% 或 15,000 元；分享文字只帶出這一欄。" })}
        {field("sellerServiceFee", "賣方服務費（僅同仁可見）", { wide: true, hint: "僅保存在同事內部資料，不帶入客人分享文字。" })}
        {form.legacyServiceFee && <div className="cr-note cr-wide"><strong>原服務費說明（尚未拆分）</strong><p>{form.legacyServiceFee}</p><small>請確認買方、賣方各自的費用後分開填寫，這段原說明只保留給同仁查看。</small></div>}
      </div><h3>家具設備</h3><div className="cr-checks">{equipmentOptions.map(value => <label key={value}><input type="checkbox" checked={form.furniture.includes(value)} onChange={event => change("furniture", event.target.checked ? normalizeRentalFurniture([...form.furniture, value]) : form.furniture.filter(item => item !== value))} />{value}</label>)}</div>
        <div className="cr-equipment-add"><label className="cr-field"><span>新增設備名稱</span><input ref={equipmentInput} value={newEquipment} maxLength={MAX_RENTAL_FURNITURE_NAME} placeholder="例如：電視、烘衣機（每次一項）" onChange={event => { dirty.current = true; setNewEquipment(event.target.value); setEquipmentError(""); setEquipmentNotice(""); }} onKeyDown={event => { if (event.key === "Enter" && !event.nativeEvent.isComposing) { event.preventDefault(); addEquipment(); } }} /></label><button type="button" onClick={addEquipment}>＋ 新增設備</button></div>
        {equipmentError && <p className="cr-error" role="alert">{equipmentError}</p>}{equipmentNotice && <p className="cr-note" role="status">{equipmentNotice}</p>}
        <p className="cr-equipment-help">新增後會自動勾選；勾選的設備會顯示在本案資料與客人介紹中，不需要時可取消勾選。</p>
        {textarea("description", "給客人的房屋介紹", "請勿填入屋主電話、鑰匙位置或其他不適合公開的內容。")}</>}
      {step === 2 && <><h3>有網址就貼網址，有照片也能直接上傳</h3><div className="cr-form-grid">{field("websiteUrl", "物件網址", { wide: true, type: "url", placeholder: "https://rent.591.com.tw/…", hint: "支援 591 或公司物件頁；不會自動匯入網站內容。" })}<label className="cr-check cr-wide"><input type="checkbox" checked={form.shareWebsite} onChange={event => change("shareWebsite", event.target.checked)} />分享文字附上物件網址</label>{field("albumUrl", "雲端相簿連結", { wide: true, type: "url", placeholder: "貼上 Google Drive 或其他相簿網址", hint: "相簿需先設定客人可開啟的權限。" })}<label className="cr-check cr-wide"><input type="checkbox" checked={form.shareAlbum} onChange={event => change("shareAlbum", event.target.checked)} />分享文字附上相簿連結</label></div>
        <div className="cr-photo-head"><div><h3>物件照片（{photos.length}／10）</h3><small>自動縮小至每張 300KB 內，重複照片會跳過。</small></div><button type="button" onClick={() => fileInput.current?.click()}>＋ 選擇照片</button><input ref={fileInput} type="file" accept="image/jpeg,image/png,image/webp,image/heic,image/heif" multiple hidden onChange={addPhotos} /></div>
        <div className="cr-photo-grid">{photos.map(photo => <figure key={photo.id}><img src={photo.url} alt={photo.name} loading="lazy" /><figcaption>{Math.ceil(photo.size / 1000)} KB <button type="button" aria-label={`移除${photo.name}`} onClick={() => { dirty.current = true; setPhotos(current => current.filter(item => item.id !== photo.id)); if (photo.blob) { URL.revokeObjectURL(photo.url); localUrls.current.delete(photo.url); } }}>移除</button></figcaption></figure>)}</div>
        <div className="cr-internal"><h3>🔒 同事內部資料</h3><p>以下欄位只在平台內顯示，不會放進「分享給客人」文字。</p><div className="cr-form-grid">{field("landlordName", "屋主稱呼")}{field("landlordPhone", "屋主電話", { type: "tel" })}{field("parkingNumber", "車位編號")}{field("viewingStatus", "帶看狀態", { options: ["待確認", "可預約帶看", "需先聯繫"] })}{textarea("viewingInstructions", "帶看方式＊", "例如：請提前一天聯繫負責同事。")}{textarea("keyInfo", "鑰匙／門禁資訊")}{textarea("internalNotes", "內部備註")}</div></div>
        <label className="cr-field"><span>儲存後狀態</span><select value={status} onChange={event => { dirty.current = true; setStatus(event.target.value); }}>{Object.entries(COMPANY_RENTAL_STATUSES).map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select></label>
      </>}
    </fieldset>
    <div className="cr-step-footer"><button type="button" disabled={step === 0 || busy || processing} onClick={() => setStep(value => value - 1)}>上一步</button><span>{step + 1}／3</span>{step < 2 ? <button className="cr-primary" type="button" onClick={() => setStep(value => value + 1)}>下一步</button> : <button className="cr-primary" type="button" disabled={busy || processing} onClick={() => save(status)}>儲存案件</button>}</div>
  </section>;
}
