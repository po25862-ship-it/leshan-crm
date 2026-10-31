import React, { useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams, Link } from "react-router-dom";
import { useAuth } from "../AuthContext";
import { useDoc } from "../hooks/useDoc";
import { useTenantNeeds } from "../hooks/useTenantNeeds";
import { useCompanyRentals } from "../hooks/useCompanyRentals";
import tenantFields from "../lib/tenantNeedFields.js";
const { TENANT_NEED_FIELDS, TENANT_NEED_STATUSES, tenantNeedForm, tenantNeedErrors, tenantNeedTemplate, tenantNeedBudgetLabel, matchTenantRental } = tenantFields;
import { canEditTenantNeed, saveTenantNeed } from "../lib/tenantNeedRepository";
import { tenantHelperRequest } from "../lib/tenantHelperClient";
import ShareWithPicker from "./ShareWithPicker";
import "./CompanyRentals.css";
import "./TenantNeeds.css";

const text = value => value || "未指定";
const hints = { budgetText:"例如：35000 元內、3.5 萬、25000～35000 或不限", includedFees:"例如：月租、管理費、汽車位、機車位；不確定可留白", areas:"例如：A7、A8、A9、桃園市龜山區", communityStreet:"可填社區名稱或路段，多個用頓號分開", roomText:"例如：2 房、2 房以上、套房", minPingText:"以室內使用坪數為參考，其他坪數口徑會提醒確認", carParking:"例如：平面 1 個、機械 1 個、不需要", motorbikeParking:"例如：1 個、不需要", pets:"例如：貓 1 隻、狗 1 隻、無寵物", subsidy:"例如：需要、不需要", cook:"例如：需要、不需要", moveIn:"例如：11/15 前、隨時、入住日期可談", leaseTerm:"例如：1 年、2 年" };
function TenantNeedEditor({ original,user,profile,onSaved,onClose }) {
  const [form,setForm] = useState(()=>tenantNeedForm(original)), [step,setStep] = useState(0), [busy,setBusy] = useState(false), [error,setError] = useState("");
  const dirty = useRef(false), keys = [ ["name","budgetText","includedFees","areas","communityStreet","roomText","minPingText"], ["carParking","motorbikeParking","pets","subsidy","cook","equipment"], ["moveIn","leaseTerm","requiredConditions","notes"] ];
  const labels = Object.fromEntries(TENANT_NEED_FIELDS);
  const change = (key,value) => {dirty.current=true;setForm(current=>({...current,[key]:value}));};
  const close = () => {if (!dirty.current || window.confirm("尚未儲存租客需求，要離開嗎？")) onClose();};
  async function save(event) {
    event.preventDefault(); const problems=tenantNeedErrors(form);
    if(problems.length){setError(problems.join("\n"));const key=Object.keys(labels).find(key=>problems[0].startsWith(labels[key]));const next=keys.findIndex(list=>list.includes(key));if(next>=0)setStep(next);return;}
    setBusy(true);setError("");try{const row=await saveTenantNeed({original,form,user,profile});dirty.current=false;onSaved(row);}catch(error){setError(error.message || "儲存失敗，請稍後再試。");}finally{setBusy(false);}
  }
  return <form className="cr-editor tn-editor" aria-label="租客需求編輯" onSubmit={save}>
    <div className="cr-editor-bar"><div><small>需求類型：租屋</small><h2>{original ? "編輯租客需求" : "新增租客需求"}</h2></div><div className="cr-actions"><button type="button" disabled={busy} onClick={close}>取消</button><button type="submit" className="cr-primary" disabled={busy}>{busy?"儲存中…":"儲存需求"}</button></div></div>
    {error&&<p className="cr-error tn-preserve" role="alert">{error}</p>}
    <div className="cr-steps" role="tablist" aria-label="租客條件分類">{["基本條件","車位與生活","其他／分享"].map((label,index)=><button type="button" key={label} role="tab" aria-selected={step===index} onClick={()=>setStep(index)}>{label}</button>)}</div>
    <p className="tn-note">姓名、租金預算、區域必填，其他可留空。未提供的條件會顯示「未指定」。</p>
    <div className="cr-form-grid">{keys[step].map(key=><label className={key==="requiredConditions"||key==="notes"?"cr-field cr-wide":"cr-field"} key={key}><span>{labels[key]}{["name","budgetText","areas"].includes(key)?"＊":""}</span>{["notes","requiredConditions","equipment"].includes(key)?<textarea value={form[key]} rows={3} maxLength={key==="equipment"?500:2000} onChange={e=>change(key,e.target.value)}/>:<input value={form[key]} maxLength={500} onChange={e=>change(key,e.target.value)}/>}{hints[key]&&<small>{hints[key]}</small>}</label>)}</div>
    {step===2&&<><label className="cr-field tn-status"><span>找房狀態</span><select value={form.status} onChange={e=>change("status",e.target.value)}>{Object.entries(TENANT_NEED_STATUSES).map(([key,label])=><option key={key} value={key}>{label}</option>)}</select></label><div className="cr-internal"><h3>分享給同事</h3><p>未分享時，其他一般同事看不到這筆需求。收到分享的同事可以查看及配對，修改需求仍由負責同事處理。</p><ShareWithPicker value={form.sharedWith} onChange={value=>change("sharedWith",value)} currentUserUid={user.uid}/></div></>}
    <div className="cr-step-footer"><button type="button" disabled={step===0||busy} onClick={()=>setStep(n=>n-1)}>上一步</button><small>{step+1}／3</small>{step<2?<button type="button" onClick={()=>setStep(n=>n+1)}>下一步</button>:<button type="submit" disabled={busy} className="cr-primary">儲存需求</button>}</div>
  </form>;
}
export default function TenantNeeds({ navigation }) {
  const {user}=useAuth(), {data:profile}=useDoc(`colleagues/${user.uid}`,{}), {items,loading,error,refresh}=useTenantNeeds(user.uid), {items:rentals,loading:rentalLoading,error:rentalError}=useCompanyRentals(user.uid);
  const [params,setParams]=useSearchParams(), bindCode=params.get("tenantBind")||"";
  const [status,setStatus]=useState("searching"), [keyword,setKeyword]=useState(""), [scope,setScope]=useState("mine"), [openId,setOpenId]=useState(""), [matchingId,setMatchingId]=useState(""), [editing,setEditing]=useState(null), [notice,setNotice]=useState(""), [helper,setHelper]=useState(!!bindCode), [template,setTemplate]=useState(false), [busy,setBusy]=useState(false), [helperMessage,setHelperMessage]=useState("");
  const [inspection,setInspection]=useState(null), [inspecting,setInspecting]=useState(false), [linked,setLinked]=useState(false), [unlinkConfirm,setUnlinkConfirm]=useState(false);
  useEffect(()=>{if(!bindCode){setInspection(null);return;}let active=true;setInspecting(true);setInspection(null);tenantHelperRequest(user,"inspect",bindCode).then(result=>{if(active){setInspection(result);setLinked(!!result.bound);}}).catch(error=>{if(active)setHelperMessage(error.message||"連接網址無法確認，請重新取得。");}).finally(()=>{if(active)setInspecting(false);});return()=>{active=false;};},[bindCode,user]);
  const searched=useMemo(()=>items.filter(row=>(scope==="all"||row.ownerUid===user.uid)&&[row.name,row.areas,row.communityStreet,row.roomText,row.notes].join(" ").toLowerCase().includes(keyword.trim().toLowerCase())),[items,scope,user.uid,keyword]);
  const filtered=searched.filter(row=>row.status===status).sort((a,b)=>(b.updatedAt?.toMillis?.()||+new Date(b.updatedAt)||0)-(a.updatedAt?.toMillis?.()||+new Date(a.updatedAt)||0));
  async function copy(value){try{await navigator.clipboard.writeText(value);setNotice("客需表格已複製，可以貼給小幫手。");}catch{setTemplate(true);setNotice("請選取表格後手動複製。");}}
  async function connect(){if(!inspection)return;setBusy(true);setHelperMessage("");try{const result=await tenantHelperRequest(user,"bind",bindCode);setLinked(true);setHelperMessage(result.message||"已連接小幫手。");const next=new URLSearchParams(params);next.delete("tenantBind");setParams(next,{replace:true});await refresh();}catch(error){setHelperMessage(error.message||"暫時無法連接，請稍後再試。");}finally{setBusy(false);}}
  async function helperStatus(){setHelper(value=>!value);if(!helper&&!bindCode){setBusy(true);try{const result=await tenantHelperRequest(user,"status");setLinked(!!result.bound);setHelperMessage(result.bound?`已連接小幫手：${result.staffName||"同事"}。` : "首次使用，請私訊小幫手「客需綁定」，再點回傳的連接網址。");}catch{setHelperMessage("請私訊小幫手「客需綁定」，取得連接網址。");}finally{setBusy(false);}}}
  async function unlink(){setBusy(true);try{const result=await tenantHelperRequest(user,"unlink");setLinked(false);setUnlinkConfirm(false);setHelperMessage(result.message);}catch(error){setHelperMessage(error.message);}finally{setBusy(false);}}
  return <main className="company-rentals tenant-needs"><div className="cr-page-heading"><div><small>租屋需求與招租物件配對</small><h1>租客需求 <span>{filtered.length}</span></h1></div><div className="cr-actions"><button disabled={loading||!!editing} onClick={()=>refresh().then(()=>setNotice("已讀取最新租客需求。")).catch(()=>{})}>重新整理</button><button className="cr-primary" disabled={!!editing} onClick={()=>{setEditing({original:null});setOpenId("");setNotice("");}}>＋ 新增需求</button></div></div>
    {!editing&&navigation}{notice&&<p className="cr-success" role="status">{notice}</p>}{error&&<p className="cr-error" role="alert">租客需求讀取失敗，請重新整理後再試。</p>}
    {editing?<TenantNeedEditor {...editing} user={user} profile={profile} onClose={()=>setEditing(null)} onSaved={row=>{setEditing(null);setStatus(row.status);setKeyword("");setScope("all");setOpenId(row.id);setNotice("租客需求已儲存。");}}/>:<>
      <div className="tn-helper-toolbar"><button onClick={()=>copy(tenantNeedTemplate())}>複製客需表格</button><button onClick={()=>setTemplate(v=>!v)} aria-expanded={template}>查看表格</button><button onClick={helperStatus} aria-expanded={helper}>小幫手連接／說明</button></div>
      {template&&<div className="cr-inset"><h3>貼給小幫手的客需表格</h3><textarea aria-label="客需表格" readOnly value={tenantNeedTemplate()} rows={20}/><p>每次傳一位租客。填完私訊小幫手，完整資料會自動新增；缺少必要資料先追問。</p></div>}
      {(helper||bindCode)&&<section className="cr-inset" aria-label="小幫手帳號連接"><h3>讓小幫手新增到你的帳號</h3>{bindCode?<><p>小幫手同事：{inspecting?"確認中…":inspection?.staffName||"尚未確認"}<br/>目前登入：{profile?.name||user.displayName||user.email||"你的 CRM 帳號"}。請確認兩邊都是你本人，再連接。</p><button className="cr-primary" disabled={busy||inspecting||!inspection} onClick={connect}>{busy?"連接中…":"連接我的小幫手"}</button></>:<p>首次私訊小幫手「客需綁定」，點回傳的網址完成連接。之後私訊「客需」加上表格內容，就會存到你的租客需求；也可輸入「客需表格」取得空白表格。</p>}{helperMessage&&<p className="tn-preserve" role="status">{helperMessage}</p>}{linked&&!bindCode&&<div className="cr-actions">{unlinkConfirm?<><span>解除後，小幫手會停止替這個帳號新增，現有需求保留。</span><button disabled={busy} onClick={unlink}>確認解除</button><button onClick={()=>setUnlinkConfirm(false)}>取消</button></>:<button disabled={busy} onClick={()=>setUnlinkConfirm(true)}>解除此帳號連接</button>}</div>}</section>}
      <div className="cr-tabs" role="tablist" aria-label="租客找房狀態">{Object.entries(TENANT_NEED_STATUSES).map(([key,label])=><button key={key} role="tab" aria-selected={status===key} onClick={()=>{setStatus(key);setOpenId("");setMatchingId("");}}>{label}<span>{searched.filter(row=>row.status===key).length}</span></button>)}</div>
      <div className="tn-filters"><label>找租客／條件<input value={keyword} placeholder="搜尋姓名、區域、社區或房型" onChange={e=>{setKeyword(e.target.value);setOpenId("");setMatchingId("");}}/></label><label>查看範圍<select value={scope} onChange={e=>setScope(e.target.value)}><option value="mine">我負責的</option><option value="all">全部可見（含分享）</option></select></label></div>
      <div className="cr-list" aria-live="polite">{loading&&!items.length?<div className="cr-empty">正在讀取租客需求…</div>:!filtered.length?<div className="cr-empty"><h2>目前沒有符合條件的租客需求</h2><p>可以新增需求，或用小幫手傳入客需表格。</p></div>:filtered.map(row=>{
        const matches=matchingId===row.id?rentals.map(rental=>matchTenantRental(row,rental)).filter(Boolean).sort((a,b)=>a.uncertain.length-b.uncertain.length||a.knownMonthly-b.knownMonthly):[];
        return <article className="cr-list-item" key={row.id}><div className="cr-row"><div className="cr-row-info"><div className="cr-row-title"><h2>{row.name}</h2><span className="cr-badge">{TENANT_NEED_STATUSES[row.status]}</span></div><p>{[row.areas,row.communityStreet,row.roomText].filter(Boolean).join("・")}</p><p>{text(row.includedFees)}{!row.includedFees?"（預算包含費用待確認）":""}</p><p className="cr-agent">負責同事 <strong>{row.ownerName||"同事"}</strong>・{row.source==="line"?"小幫手新增":"頁面新增"}{row.sharedWith?.length?"・已分享":"・未分享給其他同事"}</p></div><div className="cr-row-end"><div className="tn-price">{tenantNeedBudgetLabel(row)}</div><div className="cr-row-actions"><button aria-expanded={openId===row.id} onClick={()=>setOpenId(id=>id===row.id?"":row.id)}>{openId===row.id?"收起需求":"查看需求"}</button><button onClick={()=>setMatchingId(id=>id===row.id?"":row.id)} aria-expanded={matchingId===row.id}>配對招租物件</button></div></div></div>
          {openId===row.id&&<section className="cr-detail" aria-label={`${row.name}租客需求`}><div className="cr-toolbar"><h2>{row.name}・租屋條件</h2>{canEditTenantNeed(row,user.uid)&&<button className="cr-primary" onClick={()=>setEditing({original:row})}>編輯條件／分享</button>}</div><div className="cr-info-grid tn-detail-grid">{TENANT_NEED_FIELDS.filter(([key])=>key!=="name"&&key!=="type").map(([key,label])=><div className="cr-info-cell" key={key}><small>{label}</small><strong>{text(row[key])}</strong></div>)}</div><div className="cr-actions"><button onClick={()=>copy(tenantNeedTemplate(row))}>複製這筆條件</button></div></section>}
          {matchingId===row.id&&<section className="cr-detail" aria-label={`${row.name}招租配對`}><h3>招租中的候選物件</h3><p className="tn-note">只挑選招租中物件。已知費用超過預算就排除；車位費或其他條件不完整時，會標示待確認。</p>{rentalLoading?<p>讀取物件中…</p>:rentalError?<p className="cr-error">招租物件讀取失敗，請重新整理。</p>:!matches.length?<p>目前沒有符合已知條件的招租物件。</p>:matches.map(match=><div className="tn-match-row" key={match.rental.id}><div><strong>{match.rental.title}</strong><p>{match.rental.area}・{match.rental.rooms??"—"} 房・月租 {Number(match.rental.rent||0).toLocaleString("zh-TW")} 元</p><p>依已知費用至少 {match.knownMonthly.toLocaleString("zh-TW")} 元／月</p><p className={match.uncertain.length?"tn-pending":"tn-confirmed"}>{match.uncertain.length?`待確認：${match.uncertain.join("、")}`:"已符合有填寫的條件，帶看前仍請與負責同事確認。"}</p></div><Link className="cr-link-button" to={`?tab=listings&rentalOpen=${encodeURIComponent(match.rental.id)}`}>查看租賃資料</Link></div>)}</section>}
        </article>;
      })}</div>
      <p className="cr-footnote">主、副系統共用雲端需求；開啟或重新整理即可更新。姓名、租金預算、區域必填，其他空白視為未指定。</p>
    </>}
  </main>;
}
