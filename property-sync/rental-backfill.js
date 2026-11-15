#!/usr/bin/env node
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const { execFileSync } = require('node:child_process');
const { extractRentalFields, identityMatches, latestSheet, rentalPatch, fields, dateValue } = require('./sheet-rental');

const arg = (name, fallback='') => { const i=process.argv.indexOf(name); return i<0?fallback:process.argv[i+1]; };
const configDir = path.join(os.homedir(), '.leshan-property-sync');
const outputDir = path.resolve(arg('--output-dir', path.join(configDir, 'rental-backfill')));
const sourceDir = path.resolve(arg('--source-dir', process.env.LESHAN_SHEET_SOURCE || path.join(os.homedir(), 'Desktop/liu ai/客戶管理/物件資料')));
const apply = process.argv.includes('--apply');
const hash = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const rented = p => p.status !== 'sold' && /出租|承租|租賃中/.test(p.occupancy || '');
function jsonFile(file, value) { fs.mkdirSync(path.dirname(file),{recursive:true});fs.writeFileSync(file,JSON.stringify(value,null,2)+'\n',{mode:0o600}); }
function cacheLines(sourceHash) {
  if(!/^[a-f0-9]{64}$/.test(sourceHash||''))return null;
  for(const dir of [path.join(outputDir,'ocr'),path.join(configDir,'sheet-ocr-cache')]) {
    try { const lines=JSON.parse(fs.readFileSync(path.join(dir,sourceHash+'.json'),'utf8'));if(Array.isArray(lines))return lines; }catch { /* cache miss */ }
  }
  return null;
}
function safeSheetUrl(url,propertyId) {
  try {
    const u=new URL(url),prefix='/v0/b/leshan-crm.firebasestorage.app/o/';
    return u.protocol==='https:'&&u.hostname==='firebasestorage.googleapis.com'&&u.pathname.startsWith(prefix)
      &&decodeURIComponent(u.pathname.slice(prefix.length)).startsWith(`properties/${propertyId}/sheets/`);
  } catch {return false;}
}
async function sourceBytes(file,p) {
  // Reuse a local image only when its SHA-256 matches this exact attachment.
  if(file.sha256&&file.name&&path.basename(file.name)===file.name) {
    try { const bytes=fs.readFileSync(path.join(sourceDir,file.name));if(hash(bytes)===file.sha256)return bytes; }catch { /* cloud placeholder: read the attached cloud object */ }
  }
  if(!safeSheetUrl(file.url,p.id))throw new Error('附件不是這個案件的 CRM 雲端物調，請核對');
  let error;
  for(let attempt=0;attempt<2;attempt++) {
    try {
      const response=await fetch(file.url,{signal:AbortSignal.timeout(25000)});
      if(!response.ok)throw new Error(`物調下載失敗（${response.status}）`);
      if(Number(response.headers.get('content-length'))>30*1024*1024)throw new Error('物調超過 30MB');
      const bytes=Buffer.from(await response.arrayBuffer());if(bytes.length>30*1024*1024)throw new Error('物調超過 30MB');
      if(file.sha256&&hash(bytes)!==file.sha256)throw new Error('物調內容與記錄不符，請核對');return bytes;
    }catch(e){error=e;}
  }
  throw error;
}
async function recognize(file,p) {
  let lines=cacheLines(file.sha256);if(lines)return {lines,sourceHash:file.sha256};
  const bytes=await sourceBytes(file,p),sourceHash=hash(bytes);lines=cacheLines(sourceHash);if(lines)return {lines,sourceHash};
  const extension=/\.png$/i.test(file.name||'')?'.png':'.jpg',filename=path.join(outputDir,'images',sourceHash+extension);
  fs.mkdirSync(path.dirname(filename),{recursive:true});fs.writeFileSync(filename,bytes,{mode:0o600});
  const binary=process.env.LESHAN_OCR_BINARY||path.join(configDir,'leshan-sheet-ocr');
  lines=JSON.parse(execFileSync(binary,[filename],{encoding:'utf8',timeout:45000,maxBuffer:8*1024*1024,stdio:['ignore','pipe','ignore']}));
  jsonFile(path.join(outputDir,'ocr',sourceHash+'.json'),lines);return {lines,sourceHash};
}
async function connect() {
  const {initializeApp,deleteApp}=require('firebase/app'),{getAuth,signInWithEmailAndPassword}=require('firebase/auth'),firestore=require('firebase/firestore');
  const secret=(service,account)=>execFileSync('security',['find-generic-password','-s',service,'-a',account,'-w'],{encoding:'utf8',stdio:['ignore','pipe','ignore']}).trim();
  const app=initializeApp({apiKey:'AIzaSyDiGtIemWS0C4Pb-fNFBjDnoa2Z6ETwics',projectId:'leshan-crm',storageBucket:'leshan-crm.firebasestorage.app'},'rental-backfill-'+Date.now());
  try {const email=process.env.LESHAN_CRM_EMAIL||secret('leshan-property-sync-email','crm'),password=process.env.LESHAN_CRM_PASSWORD||secret('leshan-property-sync-password',email);await signInWithEmailAndPassword(getAuth(app),email,password);return {db:firestore.getFirestore(app),firestore,close:()=>deleteApp(app)};}
  catch(e){await deleteApp(app);throw e;}
}
async function main() {
  fs.mkdirSync(outputDir,{recursive:true});
  let context;
  try {
    let properties;
    if(!apply&&arg('--inventory'))properties=JSON.parse(fs.readFileSync(arg('--inventory'),'utf8')).records;
    else {context=await connect();const s=await context.firestore.getDocs(context.firestore.collection(context.db,'properties'));properties=s.docs.map(d=>({id:d.id,...d.data()}));}
    const reviewed=arg('--reviewed')?JSON.parse(fs.readFileSync(arg('--reviewed'),'utf8')):[];
    const generatedAt=new Date().toISOString(),candidates=properties.filter(rented),results=[];
    jsonFile(path.join(outputDir,apply?'before-apply.json':'inventory.json'),{generatedAt,records:properties});
    for(const p of candidates) {
      const file=latestSheet(p),entry={id:p.id,listingNo:p.listingNo,title:p.title,status:p.status||'active',before:Object.fromEntries(fields.map(f=>[f,p[f]??''])),fileName:file?.name||''};
      try {
        if(!file){entry.outcome='missing-sheet';entry.reason='尚未有物調，無法讀取';}
        else if(p.monthlyRent>0&&p.leaseStartDate&&p.leaseEndDate&&p.rentFeeNote&&!p.rentalSheetExtraction){entry.outcome='already-complete';}
        else {
          const {lines,sourceHash}=await recognize(file,p);entry.sourceHash=sourceHash;
          if(!identityMatches(lines,p,properties)){entry.outcome='review';entry.reason='物調編號、案名與門牌未能核對';}
          else {
            const extracted=extractRentalFields(lines);
            const verified=reviewed.find(v=>v.listingNo===p.listingNo&&v.sourceHash===sourceHash&&v.method==='visual-review');
            if(verified&&extracted.issues.every(issue=>/辨識信心不足/.test(issue))){
              for(const [key,value] of Object.entries(verified.proposed||{})){
                if(!fields.includes(key))throw new Error('核對資料含不支援欄位');
                if(key==='monthlyRent'&&!(Number.isFinite(value)&&value>0&&value<=100000000))throw new Error('核對租金不正確');
                if(/Date$/.test(key)&&dateValue(value)!==value)throw new Error('核對日期不正確');
                if(typeof value==='string'&&value.length>100)throw new Error('核對文字過長');
                extracted.proposed[key]=value;
              }
              extracted.evidence={...extracted.evidence,...verified.evidence};extracted.issues=[];entry.reviewMethod='visual-review';
            }
            const planned=rentalPatch(p,extracted);Object.assign(entry,extracted,planned);
            entry.outcome=p.rentalSheetExtraction?.sourceHash===sourceHash?'unchanged':Object.keys(planned.patch).length?'ready':extracted.issues.length||planned.conflicts.length?'review':Object.keys(extracted.proposed).length?'unchanged':'empty-sheet-fields';
            if(apply&&entry.outcome==='ready') {
              const ref=context.firestore.doc(context.db,'properties',p.id);
              const result=await context.firestore.runTransaction(context.db,async transaction=>{
                const current=await transaction.get(ref);if(!current.exists())return {outcome:'changed',reason:'案件已不存在'};
                const fresh=current.data(),latest=latestSheet(fresh);
                if(!rented(fresh)||fresh.listingNo!==p.listingNo||latest?.url!==file.url||latest?.name!==file.name||latest?.sha256!==file.sha256)return {outcome:'changed',reason:'案件或最新物調已更新，保留下次再讀'};
                const next=rentalPatch(fresh,extracted);if(!Object.keys(next.patch).length)return {...next,outcome:next.conflicts.length?'review':'unchanged'};
                transaction.update(ref,{...next.patch,rentalSheetExtraction:{version:1,sourceHash,fileName:file.name||'',readAt:generatedAt,method:entry.reviewMethod||'ocr',evidence:extracted.evidence,fields:Object.keys(next.patch)}});
                return {...next,outcome:'updated'};
              });Object.assign(entry,result);
              if(entry.outcome==='updated'){
                const verify=await context.firestore.getDocFromServer(ref),data=verify.data();entry.verified=Object.entries(entry.patch).every(([k,v])=>data?.[k]===v);if(!entry.verified)throw new Error('寫入後核對未通過');
              }
            }
          }
        }
      }catch(e){entry.outcome='error';entry.reason=e.name==='TimeoutError'?'物調讀取逾時，稍後可重試':(e.code||e.message);}
      results.push(entry);if(file)console.log(`${p.listingNo} ${entry.outcome}${entry.patch?.monthlyRent?` 月租 ${entry.patch.monthlyRent}`:''}`);
      jsonFile(path.join(outputDir,apply?'applied.json':'preview.json'),{generatedAt,apply,totalProperties:properties.length,totalRented:candidates.length,results});
    }
    const counts={};for(const e of results)counts[e.outcome]=(counts[e.outcome]||0)+1;
    console.log(JSON.stringify({report:path.join(outputDir,apply?'applied.json':'preview.json'),totalRented:candidates.length,counts},null,2));
  } finally {await context?.close();}
}
if(require.main===module)main().catch(e=>{console.error(e.code||e.message);process.exitCode=1;});
module.exports={safeSheetUrl,rented,sourceBytes};
