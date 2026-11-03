const {createHash}=require('node:crypto');
const PUBLISHER_UID='KiYlsnWcChW5muRkG167r7Mi1132';
const CASE_ID=/^[a-f0-9]{64}$/;
const UID=/^[A-Za-z0-9_-]{1,128}$/;
const SOURCE_ID=/^[A-Za-z0-9_-]{1,80}$/;
const HASH=/^[a-f0-9]{64}$/;
const STATES=['追蹤中','已寄信','已聯繫','洽談中','已取得委託','暫停追蹤','結案'];
const MAX_PHOTOS=10,MAX_PHOTO_BYTES=300*1024,LIBRARY_BYTES=250*1024*1024;
const FIELDS=['propertyAddress','buildingNo','landNo','completedOn','mainArea','accessoryArea','commonArea','parkingArea','totalArea','netArea','parkingNo','parkingType','floor','totalFloors','purpose','material','price','layout','managementFee','url','community','zone','kind'];
const hash=value=>createHash('sha256').update(typeof value==='string'||Buffer.isBuffer(value)?value:JSON.stringify(value)).digest('hex');
const fail=(status,message)=>Object.assign(new Error(message),{statusCode:status});
const text=(v,n=500)=>typeof v==='string'?v.trim().slice(0,n):'';
function checkSource(source){
 if(!source||!SOURCE_ID.test(source.sourceCaseId||'')||!HASH.test(source.sourceRevision||'')||!source.title||!source.details?.propertyAddress||!Array.isArray(source.photos)||!Array.isArray(source.owners))throw fail(502,'來源資料不完整，請先在市場開發確認門牌。');
 return source;
}
function detailsOf(raw={}){
 const out={};for(const k of FIELDS){const v=raw[k];out[k]=typeof v==='number'&&Number.isFinite(v)&&v>=0&&v<1e8?v:typeof v==='string'?text(v,k==='url'?2000:500):null;}
 if(out.url){let u;try{u=new URL(out.url);}catch{throw fail(400,'來源網址格式不正確。');}if(u.protocol!=='https:'||u.username||u.password||['localhost','127.0.0.1'].includes(u.hostname))out.url='';}
 return out;
}
function keyOf(source){
 const s=String(source.details.buildingNo||'').normalize('NFKC').replace(/\s/g,'');
 const m=s.match(/([^/]+?段)(\d{5})-?(\d{3})/),ad=String(source.details.propertyAddress||'').normalize('NFKC').replace(/臺/g,'台');
 const city=ad.match(/^(.{2,5}?[市縣])(.{1,5}?[區鄉鎮市])/);
 return m&&city?`${city[1]}/${city[2]}/${m[1].replace(/臺/g,'台').replace(new RegExp('^'+city[1]+city[2]),'')}/${m[2]}${m[3]}`:`leshan-market/${source.sourceCaseId}`;
}
function selectionOf(body,source){
 if(body.sourceRevision!==source.sourceRevision)throw fail(409,'來源已有更新，請重新讀取並確認再分享。');
 if(!Array.isArray(body.sharedWith)||body.sharedWith.length>50||body.sharedWith.some(id=>!UID.test(id)))throw fail(400,'請重新選擇同仁。');
 const sharedWith=[...new Set([PUBLISHER_UID,...body.sharedWith])];
 if(sharedWith.length<2)throw fail(400,'請至少選擇一位要分享的同仁。');
 const photoIds=Array.isArray(body.photoIds)?[...new Set(body.photoIds)]:[];
 if(photoIds.length>MAX_PHOTOS||photoIds.some(id=>!source.photos.some(p=>p.id===id)))throw fail(400,'照片選擇已變更，每間最多分享 10 張。');
 const ownerKeys=Array.isArray(body.ownerKeys)?[...new Set(body.ownerKeys)]:[];
 if(ownerKeys.length>50||ownerKeys.some(key=>!source.owners.some(o=>o.key===key)))throw fail(400,'請重新選擇要分享的屋主。');
 if(typeof body.includeDeed!=='boolean')throw fail(400,'請確認電傳分享選項。');
 const assigneeUid=text(body.assigneeUid,128);
 if(assigneeUid&&!sharedWith.includes(assigneeUid))throw fail(400,'負責同仁必須在分享名單內。');
 if(!Number.isInteger(body.expectedRevision)&&body.expectedRevision!==null)throw fail(400,'請重新讀取案件版本。');
 return {sharedWith,photoIds,ownerKeys,includeDeed:body.includeDeed,assigneeUid};
}
function canRead(c,uid){return !!c&&(c.publisherUid===uid||(!c.archived&&c.sharedWith?.includes(uid)));}
function canPrivate(c,uid){return canRead(c,uid)&&(c.publisherUid===uid||c.assigneeUid===uid);}
function assertRead(c,uid){if(!canRead(c,uid))throw fail(404,'找不到案件或尚未取得分享權限。');return c;}
function ownersOf(source,keys){return source.owners.filter(o=>keys.includes(o.key)).map(o=>({key:text(o.key,80),maskedName:text(o.maskedName,100),recipient:text(o.recipient,100),address:text(o.address),phone:text(o.phone,80),zip:/^\d{6}$/.test(o.zip||'')?o.zip:'',share:text(o.share,150),noContact:o.noContact===true}));}
function cleanDate(value){if(value==='')return '';if(typeof value!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(value)||!Number.isFinite(Date.parse(value+'T00:00:00Z'))||new Date(value+'T00:00:00Z').toISOString().slice(0,10)!==value)throw fail(400,'追蹤日期不正確。');return value;}
function mergePublished(old,source,sel,photos,actorName,now){
 const price=source.details.price,history=[...(old?.priceHistory||[])];
 if(typeof price==='number'&&price!==old?.details?.price)history.push({price,at:now,sourceUpdatedAt:source.sourceUpdatedAt||0});
 return {publisherUid:PUBLISHER_UID,publisherName:text(actorName,100),caseKey:keyOf(source),title:text(source.title,200),details:detailsOf(source.details),
  sourceCaseId:source.sourceCaseId,sourceRevision:source.sourceRevision,sourceUpdatedAt:source.sourceUpdatedAt||0,photos,
  sharedWith:sel.sharedWith,assigneeUid:sel.assigneeUid,includesOwners:!!sel.ownerKeys.length,includesDeed:sel.includeDeed,
  sourceSelection:{photoIds:sel.photoIds,ownerKeys:sel.ownerKeys,includeDeed:sel.includeDeed},
  status:old?.status||'追蹤中',nextFollowOn:old?.nextFollowOn||'',lastContactAt:old?.lastContactAt||null,
  lastActivityAt:old?.lastActivityAt||null,priceHistory:history.slice(-100),archived:false,
  createdAt:old?.createdAt||now,updatedAt:now,revision:(old?.revision||0)+1};
}
function listRecord(id,c){const {sourceSelection,...safe}=c;return {id,...safe};}
module.exports={PUBLISHER_UID,CASE_ID,UID,SOURCE_ID,HASH,STATES,MAX_PHOTOS,MAX_PHOTO_BYTES,LIBRARY_BYTES,FIELDS,hash,fail,text,checkSource,detailsOf,keyOf,selectionOf,canRead,canPrivate,assertRead,ownersOf,cleanDate,mergePublished,listRecord};
