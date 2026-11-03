import React,{useCallback,useEffect,useRef,useState} from 'react';
import {auth} from '../firebase';
import {readDeedFiles,prepareIntegratedOwners,normalizeCaseAddress,printableArea,extractListingText,hasMailingDoorNumber} from '../lib/outreachDeed';
import {parseDeedText,MAX_DEED_TEXT} from '../lib/outreachDeedText';
import {listOutreachCases,readDeedSource,uploadDeedSource,saveIntegratedCase} from '../lib/outreachCaseRepository';
import {lookupOutreachPostal} from '../lib/outreachPostal';
import {makeDeedOcr} from '../lib/outreachDeedOcr';
import './OutreachCases.css';

const AREA_FIELDS=[['mainArea','主建物'],['accessoryArea','附屬建物'],['commonArea','公設（已扣車位）'],['parkingArea','車位面積'],['totalArea','權狀總坪數'],['netArea','扣車面積']];
const LABELS={propertyAddress:'物件門牌',buildingNo:'建號',landNo:'地號',completedOn:'建築完成',floor:'樓層',totalFloors:'總樓層',parkingNo:'車位編號',parkingType:'車位型式',price:'售價（萬）',parkingPrice:'車位價格（萬）',layout:'格局',managementFee:'管理費',title:'案名',listingNo:'來源編號',url:'案件網址',...Object.fromEntries(AREA_FIELDS)};
const present=value=>value!==null&&value!==undefined&&value!=='';
const display=(key,value)=>!present(value)?'待確認':key.endsWith('Area')?printableArea(value):String(value);
const imageFor=(owner,images)=>{const matched=(owner.imageRefs||[]).map(r=>images.find(i=>i.id===r.id||i.filename===r.filename)).filter(Boolean);if(matched.length)return matched;const fallback=images.filter(i=>i.id.startsWith(owner.key+'-'));return fallback.length===1?fallback:[];};

export default function OutreachCases({uid,active,records,letters,settings,onSaved}){
  const [library,setLibrary]=useState({cases:[],sources:[]}),[loaded,setLoaded]=useState(false),[loading,setLoading]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState('');
  const [draft,setDraft]=useState(null),[bundle,setBundle]=useState(null),[archive,setArchive]=useState(null),[original,setOriginal]=useState(null),[keepOld,setKeepOld]=useState({}),[sameUnit,setSameUnit]=useState(false),[query,setQuery]=useState(''),[listingText,setListingText]=useState('');
  const [textOpen,setTextOpen]=useState(false),[deedText,setDeedText]=useState('');
  const alive=useRef(true),ocr=useRef(null),editor=useRef(null),request=useRef(0),attempted=useRef(false),draftRef=useRef(draft);draftRef.current=draft;
  useEffect(()=>{alive.current=true;return()=>{alive.current=false;request.current++;ocr.current?.stop().catch(()=>{});};},[]);
  const refresh=useCallback(async()=>{const data=await listOutreachCases(uid);if(alive.current&&auth.currentUser?.uid===uid){setLibrary(data);setLoaded(true);}return data;},[uid]);
  useEffect(()=>{if(!active||attempted.current)return;attempted.current=true;setLoading(true);refresh().catch(e=>{if(alive.current)setError(e.message||'案件資料讀取失敗，請重新整理。');}).finally(()=>{if(alive.current)setLoading(false);});},[active,refresh]);
  const act=async action=>{if(busy)return;setBusy(true);setError('');setNotice('');try{await action();}catch(e){if(alive.current)setError(e.message||'處理失敗，請稍後重試。');}finally{if(alive.current)setBusy(false);}};
  const open=value=>{setDraft(value);setKeepOld({});setSameUnit(false);setArchive(null);setListingText('');setNotice('');requestAnimationFrame(()=>editor.current?.scrollIntoView?.({block:'start',behavior:'smooth'}));};
  const openExisting=record=>{if(draft&&!window.confirm('目前有尚未儲存的核對內容，確定改開另一間案件？'))return;setBundle(null);setOriginal(record);open({...record,owners:prepareIntegratedOwners(record.owners,records,record.key,record.details.propertyAddress)});};
  const adoptParsed=async parsed=>{
    if(!alive.current||auth.currentUser?.uid!==uid)return;
    const latest=await refresh(),previous=latest.cases.find(c=>c.key===parsed.key),oldOwners=previous?.owners||[];
    const owners=parsed.owners.map(o=>{const old=oldOwners.find(x=>x.key===o.key);return {...old,...o,recipient:old?.recipient||o.recipient,address:old?.address||o.address,originalAddress:o.originalAddress||old?.originalAddress||'',zip:old?.zip||'',recordId:old?.recordId||'',recordRevision:old?.recordRevision??null,present:true};});
    oldOwners.filter(o=>!owners.some(n=>n.key===o.key)).forEach(o=>owners.push({...o,selected:false,present:false,confirmed:false}));
    const details={...previous?.details,...Object.fromEntries(Object.entries(parsed.details).filter(([,v])=>present(v)))};
    const value={key:parsed.key,title:previous?.title||`${parsed.details.buildingNo} 物件開發`,details,owners:prepareIntegratedOwners(owners,records,parsed.key,details.propertyAddress).map(o=>({...o,selected:o.present===false?false:o.selected})),revision:previous?.revision,sourceIds:previous?.sourceIds||[]};
    setOriginal(previous||null);open(value);setBundle(parsed);setNotice(previous?'已找到同一建號，將合併來源；原有寄信與價格歷程會保留。':'已整理電傳資料，尚未上傳；請核對同一戶、地址與收件人。');
  };
  const importFiles=files=>act(async()=>{
    if(draft&&!window.confirm('目前有尚未儲存的核對內容，確定重新匯入？'))return;
    await adoptParsed(await readDeedFiles(files));
  });
  const importText=()=>act(async()=>{
    if(draft&&!window.confirm('目前有尚未儲存的核對內容，確定重新匯入？'))return;
    await adoptParsed(parseDeedText(deedText));setTextOpen(false);
  });
  const updateOwner=(key,patch)=>setDraft(d=>({...d,owners:d.owners.map(o=>o.key===key?{...o,...patch}:o)}));
  const ownerChangedAddress=(key,address)=>updateOwner(key,{address,confirmed:false,zip:'',zipVerifiedAddress:''});
  const images=[...(bundle?.images||[]),...(archive?.images||[])].filter((image,index,all)=>all.findIndex(x=>x.id===image.id)===index);
  const attachImage=(key,file)=>act(async()=>{
    if(!file||file.size>1024*1024)throw new Error('地址圖片每張限 1MB。');const {imageMime}=await import('../lib/outreachDeed');const bytes=new Uint8Array(await file.arrayBuffer()),type=imageMime(bytes);if(!type)throw new Error('地址圖請使用 PNG、JPG 或 WebP。');
    const data=await new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result);reader.onerror=()=>reject(new Error('圖片讀取失敗。'));reader.readAsDataURL(new Blob([bytes],{type}));});
    if(!alive.current)return;const id=`${key}-manual`;
    const next={...(bundle||{key:draft.key,sourceName:'補充地址圖片',deedText:archive?.text||'',calculations:archive?.calculations||{}}),images:[...images.filter(i=>i.id!==id),{id,filename:file.name,type,data}]};setBundle(next);updateOwner(key,{imageRefs:[{id,filename:file.name}],confirmed:false});
  });
  const loadArchive=()=>act(async()=>{const id=draft.sourceIds?.at(-1),source=library.sources.find(s=>s.id===id);if(!source)throw new Error('這間案件尚未保存電傳來源。');const data=await readDeedSource(uid,source);if(alive.current)setArchive(data);});
  const recognize=owner=>act(async()=>{
    const image=imageFor(owner,images)[0];if(!image)throw new Error('缺少地址圖片，請補上圖片、載入已存來源，或直接輸入完整收件地址。');
    if(!ocr.current)ocr.current=makeDeedOcr();const text=await ocr.current.recognize(image.data,message=>{if(alive.current)setNotice(`登記 ${owner.key}：${message}`);});
    if(alive.current&&draftRef.current?.owners.find(o=>o.key===owner.key)?.address===owner.address){ownerChangedAddress(owner.key,text);updateOwner(owner.key,{originalAddress:text});setNotice('辨識完成，請對照原圖核對門牌、樓層及錯字，再勾選「已核對」。');}
  });
  const matchLegacy=owner=>{
    const candidates=prepareIntegratedOwners([owner],records,draft.key,draft.details.propertyAddress)[0];updateOwner(owner.key,candidates);
    setNotice(candidates.recordId?'已找到同一物件及收件地址，將沿用原收件紀錄與歷程。':'沒有唯一對應的原紀錄。可手動挑選；不會只靠遮蔽姓名合併。');
  };
  const lookup=()=>act(async()=>{
    const user=auth.currentUser,token=await user.getIdToken(),version=++request.current;
    const response=await fetch('/api/outreach-listing',{method:'POST',headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json'},body:JSON.stringify({url:draft.details.url}),cache:'no-store'});const result=await response.json();
    if(!response.ok)throw new Error(result.error||'讀取失敗，仍可手動填寫。');if(!alive.current||auth.currentUser?.uid!==uid||request.current!==version)return;
    setDraft(d=>({...d,title:result.details.title||d.title,details:{...d.details,...Object.fromEntries(Object.entries(result.details).filter(([,v])=>present(v))),floor:d.details.floor||result.details.floor,totalFloors:d.details.totalFloors||result.details.totalFloors,listingFloor:result.details.floor}}));setSameUnit(false);setNotice('已讀取信義公開頁面。完整門牌及面積仍以電傳資料為主，請核對樓層與權狀總坪數是否吻合。');
  });
  const listingScreenshot=file=>act(async()=>{
    if(!file||file.size>2*1024*1024)throw new Error('售屋截圖每張限 2MB。');const {imageMime}=await import('../lib/outreachDeed');const bytes=new Uint8Array(await file.arrayBuffer()),type=imageMime(bytes);if(!type)throw new Error('截圖請使用 PNG、JPG 或 WebP。');const data=await new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result);reader.onerror=()=>reject(new Error('截圖讀取失敗。'));reader.readAsDataURL(new Blob([bytes],{type}));});
    if(!ocr.current)ocr.current=makeDeedOcr();const text=await ocr.current.recognize(data,msg=>{if(alive.current)setNotice(msg);},{singleLine:false});if(!alive.current)return;setListingText(text);setBundle(b=>({...b,key:draft.key,sourceName:b?.sourceName||'補充售屋截圖',deedText:b?.deedText||archive?.text||'',calculations:b?.calculations||archive?.calculations||{},listingText:text,images:[...(b?.images||archive?.images||[]).filter(i=>i.id!=='listing-shot'),{id:'listing-shot',filename:file.name,type,data}]}));setNotice('已在裝置內辨識截圖，請修正下方文字再整理欄位；截圖尚未上傳。');
  });
  const applyListingText=()=>{const result=extractListingText(listingText);setDraft(d=>({...d,title:result.details.title||d.title,details:{...d.details,...result.details}}));setBundle(b=>b?{...b,listingText}:b);setSameUnit(false);setNotice(result.warnings.join('；')||'已整理可唯一判讀的售價、格局與面積。沒有明確辨認的欄位維持原值，請再核對。');};
  const save=()=>act(async()=>{
    if(!sameUnit)throw new Error('請先確認來源是同一間物件。');
    const details={...draft.details};for(const [key,keep]of Object.entries(keepOld))if(keep)details[key]=original?.details?.[key];
    const finalDraft={...draft,details};const {validateCaseDraft}=await import('../lib/outreachCaseRepository');validateCaseDraft(finalDraft);
    let sourceIds=[...(draft.sourceIds||[])];if(bundle){const latest=await refresh(),source=await uploadDeedSource(uid,{...bundle,images},letters,latest.sources);sourceIds=[...new Set([...sourceIds,source.id])];}
    const result=await saveIntegratedCase(uid,finalDraft,sourceIds,settings.defaultLetter||'');await refresh();if(!alive.current)return;setDraft(null);setBundle(null);setArchive(null);setOriginal(null);setNotice(`已儲存案件；${result.recordIds.length} 位收件人已加入寄送名單，尚未登記寄出。`);await onSaved(result.recordIds);
  });
  const changeDetail=(key,value)=>{if(key==='url'){request.current++;setSameUnit(false);}setDraft(d=>({...d,details:{...d.details,[key]:value}}));setKeepOld(k=>({...k,[key]:false}));};
  const detailDiff=original?Object.keys(draft?.details||{}).filter(k=>present(original.details?.[k])&&present(draft.details[k])&&String(original.details[k])!==String(draft.details[k])):[];
  const chosen=draft?.owners.filter(o=>o.selected)||[];
  const listingArea=draft?.details?.listingArea,totalArea=draft?.details?.totalArea;
  const listingConflict=(present(listingArea)&&present(totalArea)&&Math.abs(listingArea-totalArea)>0.15)||(draft?.details?.listingAddress&&!normalizeCaseAddress(draft.details.propertyAddress).startsWith(normalizeCaseAddress(draft.details.listingAddress)));
  const legacyCandidates=draft?records.filter(r=>!r.caseId||r.caseKey===draft.key):[];
  const filtered=library.cases.filter(c=>`${c.title} ${c.key} ${c.details.propertyAddress}`.toLowerCase().includes(query.toLowerCase().trim()));
  if(!active)return null;
  return <section className="oc-workspace" aria-label="私人案件來源整合">
    <section className="panel"><h2>一間案件，整理好所有來源</h2><p>匯入電傳、核對售屋網址與共有人，再接到原本的寄信名單。所有資料只在你的私人工作區。</p><div className="ol-actions"><label className="btn">匯入電傳 HTML／ZIP<input className="ol-file-input" aria-label="匯入電傳檔與地址圖片" type="file" multiple accept=".html,.htm,.zip,.png,.jpg,.jpeg,.webp" disabled={busy||loading} onChange={e=>{importFiles([...e.target.files]);e.target.value='';}}/></label><label className="btn ghost">選取完整網頁資料夾<input className="ol-file-input" aria-label="匯入完整電傳資料夾" type="file" multiple webkitdirectory="" directory="" disabled={busy||loading} onChange={e=>{importFiles([...e.target.files]);e.target.value='';}}/></label><button className="btn ghost oc-paste-toggle" aria-expanded={textOpen} aria-controls="deed-text-import" disabled={busy||loading} onClick={()=>setTextOpen(value=>!value)}>貼上電傳文字</button><button className="btn ghost" disabled={busy||loading} onClick={()=>act(refresh)}>重新整理案件</button></div><p className="ol-muted">每次一份 HTML，可多選地址圖片或 ZIP；合計限 5MB。只讀你提供的檔案，不會再付費查詢電傳。圖片辨識在目前裝置進行，第一次需下載辨識資料。</p></section>
    {textOpen&&<section className="panel oc-text-import" id="deed-text-import"><h2>直接貼上文字，不用上傳 HTML</h2><label>電傳文字<textarea aria-label="電傳文字" rows={10} maxLength={MAX_DEED_TEXT} value={deedText} disabled={busy} onChange={e=>setDeedText(e.target.value)} placeholder={'建物標示部:\n  建號: 桃園市龜山區○○段00001-000建號\n  建物門牌: ○○路1號六樓\n  總面積: 79.65平方公尺\n建物所有權部:\n- 登記次序: \'0001\'\n  所有權人: 王＊＊\n  地址: 桃園市龜山區○○路1號'}/></label><p className="ol-muted">支援 YAML／JSON 格式，請保留建物標示部、所有權部的層次與縮排。只在目前裝置整理；按儲存後才保存到你的私人工作區。</p><div className="ol-actions"><button className="btn" disabled={busy||!deedText.trim()} onClick={importText}>讀取電傳文字</button><button className="btn ghost" disabled={busy} onClick={()=>setTextOpen(false)}>收起</button></div></section>}
    {loading&&<p role="status">載入你的私人案件…</p>}{busy&&<p role="status" className="ol-notice">處理中，請稍候…</p>}{error&&<p role="alert" className="ol-error">{error}</p>}{notice&&<p role="status" className="ol-notice">{notice}</p>}
    {draft&&<section className="panel oc-editor" ref={editor} aria-label="核對案件整合資料"><div className="ol-heading"><div><h2>{original?'更新同一案件':'核對後建立私人案件'}</h2><p className="ol-muted">{draft.key} · {draft.owners.length} 位共有人</p></div><button className="btn ghost" disabled={busy} onClick={()=>{if(window.confirm('確定離開？尚未儲存的核對內容不會保留。')){setDraft(null);setBundle(null);setArchive(null);}}}>取消核對</button></div>
      <div className="ol-form-grid"><Field label="案件名稱" value={draft.title} onChange={title=>setDraft(d=>({...d,title}))}/><Field label="完整物件門牌" value={draft.details.propertyAddress} onChange={v=>changeDetail('propertyAddress',v)}/><div className="ol-wide oc-url"><Field label="售屋網址" value={draft.details.url||''} onChange={v=>changeDetail('url',v)}/><button className="btn ghost" disabled={busy||!draft.details.url} onClick={lookup}>讀取售屋網址</button></div><Field label="售價（萬，含車位時填總價）" type="number" value={draft.details.price??''} onChange={v=>changeDetail('price',v===''?null:Number(v))}/><Field label="格局" value={draft.details.layout||''} onChange={v=>changeDetail('layout',v)}/></div>
      <details className="oc-more"><summary>網站讀不到？用售屋截圖或貼上文字</summary><div className="ol-actions"><label className="btn ghost">辨識售屋截圖<input className="ol-file-input" aria-label="辨識售屋截圖" type="file" accept=".png,.jpg,.jpeg,.webp" disabled={busy} onChange={e=>{listingScreenshot(e.target.files[0]);e.target.value='';}}/></label></div><label>售屋頁面文字（可修正辨識結果）<textarea rows={6} maxLength={20000} value={listingText} onChange={e=>setListingText(e.target.value)} placeholder="貼上案名、售價、格局或建坪；多個不同價格會留給你確認。"/></label><button className="btn ghost" disabled={busy||!listingText.trim()} onClick={applyListingText}>整理可辨識欄位</button><p className="ol-muted">圖片與文字不傳送到辨識服務；數字或路名不清楚時，請對照原圖自行修正。</p></details>
      {present(listingArea)&&<p className={listingConflict?'ol-warning':'oc-match'}>{listingConflict?'路段或面積有差異，請先核對是否同一戶。':'面積接近，仍需核對門牌與樓層。'} 售屋頁 {Number(listingArea).toFixed(2)} 坪；電傳 {printableArea(totalArea)}。售屋頁樓層：{draft.details.listingFloor||'待確認'}；電傳：{draft.details.floor||'待確認'}／{draft.details.totalFloors||'—'}。公開路段：{draft.details.listingAddress||'未提供'}。</p>}
      {!!bundle?.warnings?.length&&<ul className="ol-warning">{bundle.warnings.map((warning,index)=><li key={index}>{warning}</li>)}</ul>}
      <div className="oc-areas">{AREA_FIELDS.map(([key,label])=><div key={key}><span>{label}</span><strong>{printableArea(draft.details[key])}</strong></div>)}</div>
      <div className="ol-form-grid"><Field label="車位編號" value={draft.details.parkingNo||''} onChange={v=>changeDetail('parkingNo',v)}/><label>車位型式<select value={draft.details.parkingType||''} onChange={e=>changeDetail('parkingType',e.target.value)}><option value="">待確認</option>{['坡道平面','升降平面','坡道機械','升降機械','平面','機械'].map(v=><option key={v}>{v}</option>)}</select></label><Field label="車位價格（萬，來源明確再填）" type="number" value={draft.details.parkingPrice??''} onChange={v=>changeDetail('parkingPrice',v===''?null:Number(v))}/><Field label="管理費" value={draft.details.managementFee||''} onChange={v=>changeDetail('managementFee',v)}/></div>
      <details className="oc-more"><summary>原始資料、面積換算與價格歷程</summary><p>主建物 {printableArea(draft.details.mainArea)}；陽台 {printableArea(draft.details.balconyArea)}；雨遮 {printableArea(draft.details.canopyArea)}。附屬及總坪數皆先用未四捨五入的數值計算。</p><p>建號：{draft.details.buildingNo} · 地號：{draft.details.landNo} · 建築完成：{draft.details.completedOn||'待確認'}</p>{!!draft.sourceIds?.length&&!archive&&<button className="btn ghost" disabled={busy} onClick={loadArchive}>載入已保存電傳與地址圖</button>}{(bundle||archive)&&<details><summary>查看保存的電傳文字與計算依據</summary><pre>{bundle?.deedText||archive?.text}</pre>{images.filter(i=>i.id==='listing-shot').map(image=><img className="oc-listing-shot" key={image.id} src={image.data} alt="已保存的售屋截圖來源"/>)}<pre>{JSON.stringify(bundle?.calculations||archive?.calculations||{},null,2)}</pre></details>}{(original?.priceHistory||[]).length>0&&<ul>{original.priceHistory.map((p,i)=><li key={i}>{new Date(p.observedAt).toLocaleString('zh-TW')} · {p.price} 萬{p.url&&<> · <a href={p.url} target="_blank" rel="noreferrer">價格來源</a></>}</li>)}</ul>}<p className="ol-muted">抵押權等內容保留原文，不把設定金額當成尚欠貸款。</p></details>
      {!!detailDiff.length&&<section className="oc-diffs"><h3>與已存資料不同的欄位</h3>{detailDiff.map(key=><label key={key}><span><strong>{LABELS[key]||key}</strong>：原 {display(key,original.details[key])} → 本次 {display(key,draft.details[key])}</span><span><input type="checkbox" checked={!!keepOld[key]} onChange={e=>setKeepOld(v=>({...v,[key]:e.target.checked}))}/> 保留原值</span></label>)}</section>}
      <h3>這次要寄給誰？</h3><p className="ol-muted">勾選才加入寄送名單。未填六碼可先保存，列印標籤前會提醒補齊；遮蔽姓名不會自動合併成同一人。</p>
      <div className="oc-owners">{draft.owners.map(owner=><article className="oc-owner" key={owner.key}><div className="oc-owner-heading"><label className="ol-check"><input type="checkbox" aria-label={`加入寄送名單 ${owner.key}`} checked={owner.selected} disabled={owner.present===false} onChange={e=>updateOwner(owner.key,{selected:e.target.checked})}/><strong>登記 {owner.key} · {owner.maskedName||'姓名未提供'}</strong></label><span>持有 {owner.share||'待確認'}{owner.present===false?' · 本次電傳未出現，舊紀錄保留':''}</span></div><p className="ol-muted">{owner.address||'地址待核對'}{owner.recordId?' · 已連結原收件紀錄':''}</p><details className="oc-owner-details" open={owner.selected}><summary>查看／核對收件資料</summary>
        {/[?？|]/.test(owner.address)&&<p className="ol-warning">地址還有不確定字元，請對照原圖修正路名與門牌數字，才能加入寄送名單。</p>}
        {!hasMailingDoorNumber(owner.address)&&<p className="ol-warning">收件地址缺少門牌號碼，請補齊完整地址後再加入寄送名單。</p>}
        {imageFor(owner,images).map(image=><img className="oc-address-image" src={image.data} alt={`登記 ${owner.key} 的電傳地址原圖`} key={image.id}/>)}
        {!!owner.imageRefs?.length&&!imageFor(owner,images).length&&<p className="ol-warning">地址為圖片，目前尚未帶入；請一起選取圖片／ZIP、載入已存來源或自行輸入。</p>}
        <div className="ol-actions"><button className="btn ghost" disabled={busy||!imageFor(owner,images).length} onClick={()=>recognize(owner)}>辨識這張地址</button><label className="btn ghost">補上地址圖片<input className="ol-file-input" aria-label={`補上地址圖片 ${owner.key}`} type="file" accept=".jpg,.jpeg,.png,.webp" disabled={busy} onChange={e=>{attachImage(owner.key,e.target.files[0]);e.target.value='';}}/></label></div>
        <div className="ol-form-grid"><Field label={`收件稱呼 ${owner.key}`} value={owner.recipient} onChange={v=>updateOwner(owner.key,{recipient:v,confirmed:false})}/><Field label={`實際收件地址 ${owner.key}`} value={owner.address} onChange={v=>ownerChangedAddress(owner.key,v)}/><Field label={`六碼郵遞區號 ${owner.key}`} value={owner.zip||''} onChange={v=>updateOwner(owner.key,{zip:v.replace(/\D/g,'').slice(0,6),confirmed:false,zipVerifiedAddress:''})}/><div className="oc-postal-actions"><button className="btn ghost" disabled={busy||!owner.address} onClick={()=>act(async()=>{const result=await lookupOutreachPostal(owner.address);if(alive.current&&draftRef.current?.owners.find(o=>o.key===owner.key)?.address===owner.address){if(!result.zip)throw new Error('郵局無法唯一判定，請確認完整地址後重試或手動核對。');updateOwner(owner.key,{zip:result.zip,confirmed:false});setNotice('已取得六碼，請核對稱呼與完整收件地址。');}})}>查詢六碼</button><button className="btn ghost" disabled={busy||!owner.address} onClick={()=>matchLegacy(owner)}>比對原收件紀錄</button></div>
        <label className="ol-wide">合併到原紀錄（保留寄出次數與歷程）<select value={owner.recordId||''} onChange={e=>{const r=records.find(x=>x.id===e.target.value);updateOwner(owner.key,r?{recordId:r.id,recordRevision:r.revision,recipient:r.recipient,address:r.address,zip:r.zip,confirmed:false}:{recordId:'',recordRevision:null,confirmed:false});}}><option value="">建立這位共有人自己的收件紀錄</option>{legacyCandidates.filter(r=>!r.caseId||r.sourceOwnerKey===owner.key).map(r=><option key={r.id} value={r.id}>{r.title} · {r.recipient} · {r.address} · 已寄 {r.sentCount||0} 次</option>)}</select></label></div>
        <label className="ol-check oc-owner-confirm"><input type="checkbox" aria-label={`已核對收件資料 ${owner.key}`} checked={owner.confirmed} onChange={e=>updateOwner(owner.key,{confirmed:e.target.checked,zipVerifiedAddress:e.target.checked&&/^\d{6}$/.test(owner.zip)?owner.address:''})}/>我已對照原圖或原紀錄，確認這位收件人的稱呼、完整地址與六碼（如有填寫）</label>
        {owner.recordId&&<p className="oc-match">將沿用原收件紀錄，不重新計算已寄出次數。</p>}</details>
      </article>)}</div>
      <label className="ol-check oc-same"><input type="checkbox" checked={sameUnit} onChange={e=>setSameUnit(e.target.checked)}/>我確認電傳、網址及原收件紀錄對應同一間物件；物件地址與收件地址分開保存</label>
      <div className="oc-save-bar"><span>選擇 {chosen.length} 位收件人 · 儲存後才上傳私人檔案，尚未登記寄出</span><button className="btn" disabled={busy||!sameUnit||chosen.some(o=>!o.confirmed||!hasMailingDoorNumber(o.address)||!o.recipient||/[?？|]/.test(o.address))} onClick={save}>{busy?'處理中…':chosen.length?`儲存並加入 ${chosen.length} 位寄送名單`:'只儲存案件資料'}</button></div>
    </section>}
    <div className="oc-library-heading"><h2>我的案件資料（{filtered.length}）</h2><label>搜尋案件<input value={query} onChange={e=>setQuery(e.target.value)} placeholder="案名、地址或建號"/></label></div>
    <div className="oc-case-list">{filtered.map(c=><article className="panel" key={c.id}><h3>{c.title}</h3><p>{c.details.propertyAddress}</p><p className="ol-muted">{c.details.buildingNo} · {c.owners.length} 位共有人 · 更新 {new Date(c.updatedAt).toLocaleString('zh-TW')}</p><p>{c.details.price?`${Number(c.details.price).toLocaleString()} 萬 · `:''}權狀 {printableArea(c.details.totalArea)} · 車位 {c.details.parkingNo||'編號待確認'}</p><div className="ol-actions"><button className="btn ghost" disabled={busy} onClick={()=>openExisting(c)}>查看／整合資料</button><button className="btn ghost" disabled={busy} onClick={()=>{const ids=c.owners.filter(o=>o.present!==false).map(o=>o.recordId).filter(id=>records.some(r=>r.id===id&&!['不再寄送','暫停追蹤','退件待處理'].includes(r.status)));if(!ids.length){openExisting(c);setNotice('尚無可直接加入的收件紀錄，請核對收件人與寄送狀態。');}else onSaved(ids);}}>選取這間的收件名單</button></div></article>)}</div>
    {loaded&&!library.cases.length&&!draft&&<p className="panel">匯入檔案或貼上電傳文字，就能將同一物件的來源與多位收件人整理在一起。</p>}
  </section>;
}
function Field({label,value,onChange,type='text'}){return <label>{label}<input aria-label={label} type={type} step={type==='number'?'any':undefined} min={type==='number'?0:undefined} value={value??''} maxLength={type==='number'?undefined:label==='售屋網址'?2000:500} onChange={e=>onChange(e.target.value)}/></label>;}
