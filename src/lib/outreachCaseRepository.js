import {collection,doc,getDocs,getDoc,runTransaction,setDoc} from 'firebase/firestore';
import {ref,uploadBytes,getBlob} from 'firebase/storage';
import {auth,db,storage} from '../firebase';
import {MAX_LIBRARY_BYTES,EMPTY_OUTREACH,outreachFields,validateOutreach} from './outreachModel';
import {MAX_SOURCE_BYTES,SOURCE_DETAILS,normalizeCaseAddress} from './outreachDeed';

const own=uid=>{if(!uid||auth.currentUser?.uid!==uid)throw new Error('帳號已變更，請重新登入。');return uid;};
const group=(uid,kind)=>collection(db,'outreachPrivate',own(uid),kind);
const item=(uid,kind,id)=>doc(group(uid,kind),id);
export async function sourceHash(value){const bytes=typeof value==='string'?new TextEncoder().encode(value):value;return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),b=>b.toString(16).padStart(2,'0')).join('');}
export async function listOutreachCases(uid){const [cases,sources]=await Promise.all(['cases','sourceFiles'].map(kind=>getDocs(group(uid,kind))));own(uid);return {cases:cases.docs.map(d=>({...d.data(),id:d.id})).sort((a,b)=>b.updatedAt-a.updatedAt),sources:sources.docs.map(d=>({...d.data(),id:d.id}))};}
export function validateCaseDraft(draft){
  if(!draft.key||draft.key.length>300||!draft.title?.trim()||draft.title.length>200)throw new Error('請確認建號與案件名稱。');
  const details={};for(const key of SOURCE_DETAILS){const value=draft.details?.[key];if(value===undefined)continue;if(value===null){details[key]=null;continue;}if(typeof value==='number'){if(!Number.isFinite(value)||value<0||value>1e8)throw new Error('面積、樓層或售價不正確。');details[key]=value;}else{if(typeof value!=='string'||value.length>(key==='url'?2000:500))throw new Error('案件欄位內容過長。');details[key]=value.trim();}}
  if(!details.propertyAddress||!details.buildingNo)throw new Error('請確認完整門牌與建號。');
  if(details.url){let url;try{url=new URL(details.url);}catch{throw new Error('案件網址格式不正確。');}if(!['http:','https:'].includes(url.protocol)||url.username||url.password)throw new Error('請使用一般售屋網址。');}
  if(!Array.isArray(draft.owners)||draft.owners.length>50||new Set(draft.owners.map(o=>o.key)).size!==draft.owners.length)throw new Error('共有人登記次序有重複或筆數過多。');
  const owners=draft.owners.map(o=>{if(!/^[a-zA-Z0-9_-]{1,40}$/.test(o.key))throw new Error('共有人登記次序格式不正確。');const value={};for(const key of ['key','maskedName','recipient','address','originalAddress','share','zip','zipVerifiedAddress','recordId']){value[key]=String(o[key]||'').trim();if(value[key].length>(['address','originalAddress','zipVerifiedAddress'].includes(key)?500:150))throw new Error('共有人資料過長。');}value.present=o.present!==false;value.confirmed=!!o.confirmed;value.selected=!!o.selected;value.recordRevision=Number.isInteger(o.recordRevision)?o.recordRevision:null;value.imageRefs=(o.imageRefs||[]).slice(0,10).map(x=>({id:String(x.id).slice(0,80),filename:String(x.filename).slice(-200)}));if(value.zip&&!/^\d{6}$/.test(value.zip))throw new Error('郵遞區號須為六碼或留白。');if(value.selected&&/[?？|]/.test(value.address))throw new Error('地址仍有辨識不確定字元，請對照原圖修正後再加入名單。');if(value.selected&&(!value.confirmed||!value.recipient||!value.address))throw new Error('請先核對勾選收件人的稱呼與完整地址。');return value;});
  const linked=owners.filter(o=>o.recordId).map(o=>o.recordId);if(new Set(linked).size!==linked.length)throw new Error('兩位共有人不能合併到同一筆收件紀錄。');
  return {key:draft.key,title:draft.title.trim(),details,owners};
}
export async function uploadDeedSource(uid,bundle,letters,sources){
  own(uid);
  const archive={format:'leshan-private-deed',version:1,key:bundle.key,text:String(bundle.deedText||'').slice(0,500000),listingText:String(bundle.listingText||'').slice(0,20000),calculations:bundle.calculations||{},images:(bundle.images||[]).map(i=>({id:i.id,type:i.type,data:i.data}))};
  if(archive.images.length>100||archive.images.some(i=>!/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/.test(i.data||'')))throw new Error('地址圖片格式不正確，請使用 PNG、JPG 或 WebP。');
  const bytes=new TextEncoder().encode(JSON.stringify(archive));if(bytes.length>MAX_SOURCE_BYTES)throw new Error('保存的電傳文字與圖片合計限 5MB。');
  const id=await sourceHash(bytes),previous=sources.find(s=>s.id===id);if(previous)return previous;
  if([...letters,...sources].reduce((sum,x)=>sum+(x.size||0),0)+bytes.length>MAX_LIBRARY_BYTES)throw new Error('私人檔案庫已達 50MB，請先整理不再使用的檔案。');
  const path=`outreachPrivate/${uid}/sources/${id}`;try{await uploadBytes(ref(storage,path),bytes,{contentType:'application/json',customMetadata:{ownerUid:uid,sha256:id},cacheControl:'private, no-store'});}catch(error){const existing=await getBlob(ref(storage,path),MAX_SOURCE_BYTES);if(await sourceHash(await existing.arrayBuffer())!==id)throw error;}own(uid);
  const meta={ownerUid:uid,name:String(bundle.sourceName||'電傳資料').slice(-200),type:'application/json',size:bytes.length,storagePath:path,usedInCase:false,createdAt:Date.now()};const target=item(uid,'sourceFiles',id);
  await runTransaction(db,async tx=>{const current=await tx.get(target);own(uid);if(!current.exists())tx.set(target,meta);});
  return {...meta,id};
}
export async function readDeedSource(uid,source){
  if(!/^[a-f0-9]{64}$/.test(source.id)||source.storagePath!==`outreachPrivate/${own(uid)}/sources/${source.id}`)throw new Error('無法讀取其他帳號的電傳檔。');
  const blob=await getBlob(ref(storage,source.storagePath),MAX_SOURCE_BYTES);own(uid);const bytes=await blob.arrayBuffer();if(await sourceHash(bytes)!==source.id)throw new Error('電傳備份檢查不符，請重新匯入。');const data=JSON.parse(new TextDecoder().decode(bytes));if(data.format!=='leshan-private-deed'||data.version!==1||typeof data.text!=='string'||data.text.length>500000||!Array.isArray(data.images)||data.images.length>100||data.images.some(i=>!/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/.test(i.data||'')))throw new Error('電傳備份格式不正確。');return data;
}
export async function saveIntegratedCase(uid,draft,sourceIds,defaultLetter=''){
  const data=validateCaseDraft(draft),id=await sourceHash(data.key),target=item(uid,'cases',id),chosen=data.owners.filter(o=>o.selected);
  const generated=await Promise.all(chosen.map(o=>sourceHash(`${data.key}|${o.key}`)));
  const recordTargets=chosen.map((o,i)=>item(uid,'records',o.recordId||`case-${generated[i]}`));
  const ids=[...new Set(sourceIds||[])];if(ids.length>50||ids.some(x=>!/^[a-f0-9]{64}$/.test(x)))throw new Error('來源檔案格式或數量不正確。');
  const sourceTargets=ids.map(x=>item(uid,'sourceFiles',x));
  await runTransaction(db,async tx=>{
    const [current,recordDocs,sourceDocs]=await Promise.all([tx.get(target),Promise.all(recordTargets.map(t=>tx.get(t))),Promise.all(sourceTargets.map(t=>tx.get(t)))]);own(uid);
    if(current.exists()&&draft.revision!==current.data().revision)throw new Error('這間案件已在其他裝置更新，請重新整理後再核對。');
    if(!current.exists()&&draft.revision)throw new Error('案件已不存在，請重新整理。');
    if(sourceDocs.some(s=>!s.exists()||s.data().ownerUid!==uid))throw new Error('來源檔案未保存完成，請重新匯入。');
    const now=Date.now(),previous=current.data()||{},savedOwners=data.owners.map(o=>({...o,selected:false}));
    recordDocs.forEach((snapshot,i)=>{
      const o=chosen[i],old=snapshot.data();
      if(o.recordId&&(!snapshot.exists()||o.recordRevision!==old.revision))throw new Error('收件紀錄已在其他裝置更新，請重新整理後再核對。');
      if(!o.recordId&&old&&(old.caseId!==id||old.sourceOwnerKey!==o.key))throw new Error('已有相同收件編號，請先重新整理。');
      if(old?.caseId===id&&old.sourceOwnerKey&&old.sourceOwnerKey!==o.key)throw new Error('原收件紀錄已屬於另一位共有人，請分開保存。');
      if(old?.caseId&&old.caseId!==id)throw new Error('所選收件紀錄已連結其他案件。');
      if(old&&!o.recordId)throw new Error('這位收件人已建立，請重新整理後使用原紀錄。');
      const fields=validateOutreach({...EMPTY_OUTREACH,...old,title:data.title,listingNo:data.details.listingNo||old?.listingNo||'',url:data.details.url||old?.url||'',propertyAddress:data.details.propertyAddress,recipient:o.recipient,address:o.address,zip:o.zip,zipVerifiedAddress:old&&normalizeCaseAddress(old.address)===normalizeCaseAddress(o.address)&&old.zip===o.zip&&old.zipVerifiedAddress?old.zipVerifiedAddress:(o.confirmed&&/^\d{6}$/.test(o.zip)&&normalizeCaseAddress(o.zipVerifiedAddress)===normalizeCaseAddress(o.address)?o.address:''),letterId:old?.letterId||defaultLetter,caseId:id,caseKey:data.key,sourceOwnerKey:o.key});
      tx.set(recordTargets[i],{...fields,ownerUid:uid,revision:(old?.revision||0)+1,createdAt:old?.createdAt||now,updatedAt:now,sentCount:old?.sentCount||0,lastSentOn:old?.lastSentOn||''});
      Object.assign(savedOwners.find(x=>x.key===o.key),{recordId:recordTargets[i].id,recordRevision:(old?.revision||0)+1});
    });
    const history=[...(previous.priceHistory||[])];if(data.details.price!=null&&data.details.price!==previous.details?.price)history.push({price:data.details.price,url:data.details.url||'',observedAt:now});
    tx.set(target,{ownerUid:uid,key:data.key,title:data.title,details:data.details,owners:savedOwners,sourceIds:ids,priceHistory:history.slice(-100),revision:(previous.revision||0)+1,createdAt:previous.createdAt||now,updatedAt:now});
    sourceDocs.forEach((snapshot,i)=>{if(!snapshot.data().usedInCase)tx.update(sourceTargets[i],{usedInCase:true});});
  });
  return {id,recordIds:recordTargets.map(t=>t.id)};
}
