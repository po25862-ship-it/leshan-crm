import React, { useEffect, useState } from "react";
import { buildCompanyRentalShare, canEditCompanyRental, companyRentalUrl, COMPANY_RENTAL_STATUSES, rentalMoney, rentalMonthlyCost, rentalParkingText, rentalPublicAddress, safeRentalUrl } from "../lib/companyRental";
import { readRentalInternal, setCompanyRentalStatus, saveRentalWebsiteCheck } from "../lib/companyRentalRepository";
import { isRental591Url, rentalExpiryReminders, rentalWebsitePatch, rentalWebsiteState, rentalCheckTime } from "../lib/companyRentalWebsite";
import { loadRentalWebsiteInfo } from "../lib/rentalWebsiteClient";
import CompanyRentalViewing from "./CompanyRentalViewing";

const value = item => item === "" || item == null ? "待確認" : item;
const Cell = ({ label, children }) => <div className="cr-info-cell"><small>{label}</small><strong>{value(children)}</strong></div>;
export default function CompanyRentalDetail({ rental, user, agid, now = Date.now(), onEdit, onClose, onNotice }) {
  const [internal, setInternal] = useState(null), [internalError, setInternalError] = useState(""), [loading, setLoading] = useState(true);
  const [showPhotos, setShowPhotos] = useState(false), [sharing, setSharing] = useState(false), [viewing, setViewing] = useState(false);
  const [websiteInfo, setWebsiteInfo] = useState(null), [checkingWebsite, setCheckingWebsite] = useState(false), [websiteMessage, setWebsiteMessage] = useState("");
  const localPatch = (rentalCheckTime(websiteInfo?.checkedAt) || 0) >= (rentalCheckTime(rental.websiteCheckedAt) || 0) ? rentalWebsitePatch(rental, websiteInfo) : null;
  const shown = localPatch ? { ...rental, ...localPatch } : rental;
  const baseShare = buildCompanyRentalShare(shown, agid, now), webState = rentalWebsiteState(shown, now), reminders = rentalExpiryReminders(shown, now);
  const [share, setShare] = useState(baseShare), [copied, setCopied] = useState(""), [busy, setBusy] = useState(false), [error, setError] = useState("");
  useEffect(() => { let active = true; setLoading(true); setInternalError(""); setInternal(null); readRentalInternal(rental.id).then(data => { if (active) setInternal(data); }).catch(() => { if (active) setInternalError("內部資料讀取失敗，請關閉後重新開啟；為避免覆蓋資料，暫時無法編輯。"); }).finally(() => { if (active) setLoading(false); }); return () => { active = false; }; }, [rental.id, rental.revision]);
  useEffect(() => { setShare(baseShare); setCopied(""); }, [baseShare]);
  const cost = rentalMonthlyCost(rental), editable = canEditCompanyRental(rental, user.uid), website = webState.available ? companyRentalUrl(shown.websiteUrl, agid) : "", album = safeRentalUrl(rental.albumUrl);
  async function checkWebsite() {
    setCheckingWebsite(true); setWebsiteMessage("");
    try {
      const info = await loadRentalWebsiteInfo(user, rental.websiteUrl, true);
      if (!rentalWebsitePatch(rental, info)) { setWebsiteMessage("591 暫時無法確認，已保留原網址與日期，沒有改成下架。"); return; }
      setWebsiteInfo(info);
      if (editable) await saveRentalWebsiteCheck(rental, info, user);
      setWebsiteMessage(info.status === "unlisted" ? "已確認下架，顯示目前無網站；原網址仍保留。" : "已讀取最新 591 刊登資料；手動設定的到期日仍會保留。");
    } catch { setWebsiteMessage("暫時無法更新 591 資料，請稍後再試。"); }
    finally { setCheckingWebsite(false); }
  }
  async function changeStatus(status) { setBusy(true); setError(""); try { await setCompanyRentalStatus(rental, status, user); onNotice("招租狀態已更新。"); } catch (err) { setError(err.message); } finally { setBusy(false); } }
  async function copyShare() { try { await navigator.clipboard.writeText(share); setCopied("文字已複製，可以貼給客人。"); } catch { setCopied("請選取下方文字後手動複製。"); } }
  return <section className="cr-detail" aria-label={`${rental.title}資料`}><div className="cr-toolbar"><div><small>{rental.agentName}・{rental.branch || "公司租賃"}</small><h2>{rental.title}</h2></div><div className="cr-actions">{editable && <button disabled={loading || !internal || busy} onClick={() => onEdit(rental, internal)}>編輯資料</button>}<button onClick={onClose}>收起資料</button></div></div>
    {error && <p className="cr-error" role="alert">{error}</p>}{internalError && <p className="cr-error" role="alert">{internalError}</p>}
    <div className="cr-expiry-tags">{reminders.map(reminder => <span key={reminder.kind} className={`cr-expiry-tag ${reminder.tone}`}>{reminder.label}</span>)}</div>
    <div className="cr-info-grid cr-website-summary"><Cell label="物件網站">{webState.label}{webState.reason ? `・${webState.reason}` : ""}</Cell><Cell label="網站刊登到期日">{shown.websiteExpiresOn || "待確認"}</Cell><Cell label="委託到期日（同事查看）">{rental.mandateExpiresOn || "尚未填寫"}</Cell></div>
    {isRental591Url(rental.websiteUrl) && <div className="cr-website-check"><button type="button" disabled={checkingWebsite} onClick={checkWebsite}>{checkingWebsite ? "檢查 591 中…" : "更新 591 期限／狀態"}</button><small>檢查失敗不會當成下架；委託到期日請依實際委託填寫。</small></div>}{websiteMessage && <p className="cr-note" role="status">{websiteMessage}</p>}
    <div className="cr-detail-summary"><div className="cr-rent"><small>月租金</small><strong>{rentalMoney(rental.rent)} <span>元／月</span></strong></div><div className="cr-cost"><span>{cost.complete ? "每月固定費用" : "目前已知每月費用"}</span><strong>{rentalMoney(cost.total)} <small>元</small></strong>{!cost.complete && <small>尚待確認：{cost.missing.join("、")}</small>}<small>不含水電等依用量計收費用</small></div></div>
    <div className="cr-info-grid"><Cell label="公開位置">{rentalPublicAddress(rental)}</Cell><Cell label="社區／生活圈">{[rental.community, rental.area].filter(Boolean).join("・")}</Cell><Cell label="格局／樓層">{`${value(rental.rooms)}房 ${value(rental.living)}廳 ${value(rental.baths)}衛${rental.floor ? `・${rental.floor} 樓` : ""}`}</Cell><Cell label="坪數">{rental.size ? `${rentalMoney(rental.size)} 坪・${rental.sizeBasis}` : "待確認"}</Cell><Cell label="管理費">{rental.mgmtMode === "另計" ? `${value(rental.mgmt)} 元／月（另計）` : rental.mgmtMode}</Cell><Cell label="汽車位">{rentalParkingText(rental)}</Cell><Cell label="機車位">{rentalParkingText(rental, "motorbike")}</Cell><Cell label="押金／最短租期">{`${value(rental.deposit)} 個月・${rental.minLease || "待確認"}`}</Cell><Cell label="入住／租補">{`${rental.moveIn === "另約日期" ? rental.availableDate || "另約日期" : rental.moveIn || "待確認"}・${rental.subsidy || "待確認"}`}</Cell><Cell label="寵物／開伙">{[rental.pets, rental.cook].filter(Boolean).join("・")}</Cell><Cell label="家具設備">{rental.furniture?.join("、") || "待確認"}</Cell><Cell label="買方服務費">{rental.buyerServiceFee || "請洽負責同事確認"}</Cell><Cell label="負責同事">{[rental.agentName, rental.agentPhone].filter(Boolean).join("・")}</Cell></div>
    {rental.description && <div className="cr-description"><h3>房屋介紹</h3><p>{rental.description}</p></div>}
    <div className="cr-actions cr-detail-actions">{website && <a className="cr-link-button" href={website} target="_blank" rel="noreferrer">開啟物件網址 ↗</a>}{album && <a className="cr-link-button" href={album} target="_blank" rel="noreferrer">開啟照片相簿 ↗</a>}<button onClick={() => setShowPhotos(show => !show)} aria-expanded={showPhotos}>物件照片（{rental.photos?.length || 0}）{showPhotos ? " 收起" : " 查看"}</button>{rental.status === "available" && <><button onClick={() => setSharing(show => !show)} aria-expanded={sharing}>分享給客人</button><button className="cr-primary" onClick={() => setViewing(show => !show)} aria-expanded={viewing}>安排帶看</button></>}</div>
    {showPhotos && <div className="cr-photo-grid">{rental.photos?.length ? rental.photos.map(photo => <figure key={photo.id}><a href={safeRentalUrl(photo.url)} target="_blank" rel="noreferrer"><img src={safeRentalUrl(photo.url)} alt={photo.name} loading="lazy" /></a></figure>) : <p>尚未上傳照片，也可以使用上方相簿連結。</p>}</div>}
    {sharing && <div className="cr-inset"><h3>分享給客人的文字</h3><p>僅帶出公開欄位；傳送前可以自行修改。</p><textarea aria-label="分享文字" className="cr-share-text" rows={13} value={share} onChange={event => setShare(event.target.value)} /><div className="cr-actions"><button className="cr-primary" onClick={copyShare}>複製介紹文字</button><button onClick={() => setSharing(false)}>收起</button></div>{copied && <p role="status">{copied}</p>}</div>}
    {viewing && <CompanyRentalViewing rental={rental} user={user} onClose={() => setViewing(false)} />}
    <details className="cr-internal"><summary>🔒 同事內部資料（不帶入分享文字）</summary>{loading ? <p>讀取中…</p> : internal && <div className="cr-info-grid"><Cell label="完整門牌／樓層">{internal.doorAddress}</Cell><Cell label="屋主稱呼／電話">{[internal.landlordName, internal.landlordPhone].filter(Boolean).join("・")}</Cell><Cell label="帶看方式">{internal.viewingInstructions}</Cell><Cell label="鑰匙／門禁">{internal.keyInfo}</Cell><Cell label="汽車位編號">{internal.parkingNumber}</Cell><Cell label="機車位編號">{internal.motorbikeParkingNumber}</Cell><Cell label="原物件網址（保留）">{rental.websiteUrl}</Cell><Cell label="內部備註">{internal.internalNotes}</Cell><Cell label="賣方服務費（僅同仁可見）">{internal.sellerServiceFee}</Cell>{(internal.legacyServiceFee || rental.serviceFee) && <Cell label="原服務費說明（尚未拆分）">{internal.legacyServiceFee || rental.serviceFee}</Cell>}</div>}</details>
    {editable && <label className="cr-status-control">招租狀態 <select value={rental.status} disabled={busy} onChange={event => changeStatus(event.target.value)}>{Object.entries(COMPANY_RENTAL_STATUSES).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label>}
  </section>;
}
