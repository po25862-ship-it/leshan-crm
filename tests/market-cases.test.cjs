const {test}=require('node:test');
const assert=require('node:assert/strict');
const m=require('../api/_lib/market-case-model');
const {createMarketCaseService}=require('../api/_lib/market-case-service');
const {createHandler}=require('../api/market-cases');
class MemoryDB {
 constructor(){this.docs=new Map();this.serial=0;}
 doc(path){const db=this;return {path,id:path.split('/').at(-1),collection(k){return db.collection(path+'/'+k)},async get(){return db.snapshot(path)}};}
 snapshot(path){const v=this.docs.get(path);return {id:path.split('/').at(-1),exists:v!==undefined,data:()=>v===undefined?undefined:structuredClone(v)}}
 collection(path){const db=this;const make=(where=null,order=null,limit=Infinity,after='')=>({doc:id=>db.doc(path+'/'+(id||'auto-'+(++db.serial))),where:(...w)=>make(w,order,limit,after),orderBy:(...o)=>make(where,o,limit,after),limit:n=>make(where,order,n,after),startAfter:id=>make(where,order,limit,id),async get(){let rows=[...db.docs.keys()].filter(k=>k.startsWith(path+'/')&&!k.slice(path.length+1).includes('/')).map(k=>db.snapshot(k));if(where)rows=rows.filter(s=>where[1]==='array-contains'?s.data()[where[0]]?.includes(where[2]):s.data()[where[0]]===where[2]);if(order)rows.sort((a,b)=>{const x=order[0]==='__name__'?a.id:a.data()[order[0]],y=order[0]==='__name__'?b.id:b.data()[order[0]];return (x<y?-1:x>y?1:0)*(order[1]==='desc'?-1:1)});if(after)rows=rows.filter(s=>s.id>after);return {docs:rows.slice(0,limit)}}});return make()}
 async runTransaction(fn){const writes=[];const tx={get:r=>r.get(),set:(r,v)=>writes.push([r.path,v]),update:(r,v)=>writes.push([r.path,{...this.docs.get(r.path),...v}])};const result=await fn(tx);for(const [p,v]of writes)this.docs.set(p,structuredClone(v));return result;}
}
const publisher={uid:m.PUBLISHER_UID,name:'分享人'},staff={uid:'staff-a'},staffB={uid:'staff-b'},outsider={uid:'other'};
const photoId='b'.repeat(32),jpeg=Buffer.from([255,216,255,217]);
function fixture(){
 const db=new MemoryDB();for(const u of [publisher,staff,staffB])db.docs.set('colleagues/'+u.uid,{name:u.name||u.uid});
 const snapshot={sourceCaseId:'sourceA',sourceRevision:'a'.repeat(64),sourceUpdatedAt:3,title:'示範三房車',details:{propertyAddress:'桃園市龜山區華亞三路199巷13號6樓',buildingNo:'桃園市龜山區善捷段04901-000建號',price:1800,totalArea:49.46,parkingArea:9.23},photos:[{id:photoId,name:'照片.jpg'}],owners:[{key:'owner-a',recipient:'測試先生',address:'新北市三重區測試路23號',zip:'241043',idNo:'NEVER_SHARE',privateNote:'NEVER_SHARE'},{key:'owner-b',recipient:'不分享屋主'}],deed:{summary:{主建物坪:24.09}}};
 let uploads=0,offline=false,failUpload=false;
 const blobs=new Map(),drive={async uploadPrivate(bytes,type){if(failUpload)throw Error('drive offline');uploads++;const file={fileId:'drive-file-'+uploads,size:bytes.length,type,sha256:m.hash(bytes)};blobs.set(file.fileId,bytes);return file;},async downloadPrivate(file){return blobs.get(file.fileId)},async quota(){return {limit:String(5*1024**4),usage:'1000'}}};
 const source={async preview(){if(offline)throw Error('source offline');return structuredClone(snapshot)},async asset(){return {bytes:jpeg,width:10,height:10}}};
 const service=createMarketCaseService({db,drive,source,now:()=>1780000000000});
 const body={sourceCaseId:snapshot.sourceCaseId,sourceRevision:snapshot.sourceRevision,expectedRevision:null,sharedWith:[staff.uid,staffB.uid],photoIds:[photoId],ownerKeys:['owner-a'],includeDeed:true,assigneeUid:''};
 return {db,snapshot,service,source,body,get uploads(){return uploads},setOffline:v=>offline=v,setFailUpload:v=>failUpload=v};
}
test('canonical building identity tolerates fullwidth and city prefix, preserves 建 as section name',()=>{
 const f=fixture();assert.equal(m.keyOf(f.snapshot),'桃園市/龜山區/善捷段/04901000');
 f.snapshot.details.buildingNo='善捷段０４９０１－０００建號';assert.equal(m.keyOf(f.snapshot),'桃園市/龜山區/善捷段/04901000');
 f.snapshot.details.buildingNo='建國段04901-000';assert.equal(m.keyOf(f.snapshot),'桃園市/龜山區/建國段/04901000');
 f.snapshot.details.propertyAddress='沒有完整城市';assert.equal(m.keyOf(f.snapshot),'leshan-market/sourceA');
});
test('publisher selects recipients, old revisions and unexpected photo IDs fail before upload',async()=>{
 const f=fixture();await assert.rejects(f.service.preview(staff,'sourceA','t'),e=>e.statusCode===403);
 for(const patch of [{sharedWith:[]},{photoIds:['bad']},{ownerKeys:['bad']},{sourceRevision:'c'.repeat(64)},{assigneeUid:outsider.uid},{sharedWith:[outsider.uid]}])await assert.rejects(f.service.publish(publisher,{...f.body,...patch},'t'));
 assert.equal(f.uploads,0);assert.equal(f.db.docs.has('marketCaseSystem/storage'),false);
});
test('only assignee can read owners; selected photos survive source offline; no unrelated owner data leaks',async()=>{
 const f=fixture(),{id}=await f.service.publish(publisher,f.body,'t');f.setOffline(true);
 assert.equal((await f.service.detail(staff,id)).canReadOwners,false);
 assert.equal((await f.service.detail(staff,id)).owners.length,0);
 await assert.rejects(f.service.detail(outsider,id),e=>e.statusCode===404);
 await f.service.update(staff,{id,op:'claim',expectedRevision:1});
 const detail=await f.service.detail(staff,id);assert.equal(detail.owners.length,1);assert.equal(detail.owners[0].idNo,undefined);
 assert.equal(detail.assigneeName,staff.uid);
 await assert.rejects(f.service.update(staffB,{id,op:'claim',expectedRevision:2}),e=>e.statusCode===409);
 const picture=await f.service.media(staff,id,detail.photos[0].id);assert.deepEqual(picture.bytes,jpeg);
 await assert.rejects(f.service.media(staffB,id,detail.deedId),e=>e.statusCode===404);
 const deed=JSON.parse((await f.service.media(staff,id,detail.deedId)).bytes);assert.equal(deed.owners.length,1);assert.ok(!JSON.stringify(deed).includes('NEVER_SHARE'));
 const listed=await f.service.list(staff);assert.equal(listed.cases.length,1);assert.equal(listed.cases[0].sourceSelection,undefined);assert.equal(listed.cases[0].owners,undefined);
});
test('source sync deduplicates Drive bytes, preserves follow-up and actual contact date, price history grows',async()=>{
 const f=fixture(),{id}=await f.service.publish(publisher,f.body,'t');await f.service.update(staff,{id,op:'claim',expectedRevision:1});
 await f.service.update(staff,{id,op:'progress',expectedRevision:2,status:'洽談中',nextFollowOn:'2027-01-01'});
 assert.equal((await f.service.detail(staff,id)).lastContactAt,null);
 await f.service.update(staff,{id,op:'note',expectedRevision:3,type:'聯繫紀錄',note:'今天聯繫，保留紀錄'});
 const before=await f.service.detail(staff,id);f.snapshot.details.price=1750;f.snapshot.sourceRevision='c'.repeat(64);
 await f.service.publish(publisher,{...f.body,sourceRevision:f.snapshot.sourceRevision,expectedRevision:4,assigneeUid:staff.uid},'t');
 const after=await f.service.detail(staff,id);assert.equal(f.uploads,2);assert.equal(after.status,'洽談中');assert.equal(after.nextFollowOn,'2027-01-01');assert.equal(after.lastContactAt,before.lastContactAt);assert.equal(after.activities.filter(a=>a.note==='今天聯繫，保留紀錄').length,1);assert.equal(after.priceHistory.length,2);assert.equal(after.details.price,1750);
 await f.service.update(publisher,{id,op:'revoke',expectedRevision:5});
 await assert.rejects(f.service.detail(staff,id),e=>e.statusCode===404);await assert.rejects(f.service.media(staff,id,after.photos[0].id),e=>e.statusCode===404);assert.equal((await f.service.detail(publisher,id)).archived,true);assert.equal((await f.service.list(staff)).cases.length,0);
});
test('upload failure leaves no shared case and releases held quota; guard rejects full library',async()=>{
 const f=fixture();f.setFailUpload(true);await assert.rejects(f.service.publish(publisher,f.body,'t'));assert.equal([...f.db.docs.keys()].filter(k=>/^marketCases\//.test(k)).length,0);assert.equal(f.db.docs.get('marketCaseSystem/storage').reservedBytes,0);
 f.setFailUpload(false);f.db.docs.set('marketCaseSystem/storage',{usedBytes:m.LIBRARY_BYTES,reservedBytes:0});await assert.rejects(f.service.publish(publisher,f.body,'t'),e=>e.statusCode===413);assert.equal(f.uploads,0);
});
test('deleting access or changing assignee immediately blocks private media; invalid follow date is rejected',async()=>{
 const f=fixture(),{id}=await f.service.publish(publisher,{...f.body,assigneeUid:staff.uid},'t');const d=await f.service.detail(staff,id);
 await assert.rejects(f.service.update(staffB,{id,op:'note',expectedRevision:1,type:'追蹤紀錄',note:'fail'}),e=>e.statusCode===403);
 await assert.rejects(f.service.update(staff,{id,op:'progress',expectedRevision:1,status:'追蹤中',nextFollowOn:'2026-02-30'}),e=>e.statusCode===400);
 await f.service.publish(publisher,{...f.body,expectedRevision:1,assigneeUid:staffB.uid},'t');await assert.rejects(f.service.media(staff,id,d.deedId),e=>e.statusCode===404);assert.equal((await f.service.detail(staff,id)).owners.length,0);
});
test('API denies foreign origins, enforces authentication and never caches private responses',async()=>{
 const f=fixture();const handler=createHandler({service:f.service,authenticate:async req=>{if(!req.headers.authorization)throw m.fail(401,'missing');return staff}});
 const invoke=async req=>{const out={headers:{},status(n){this.code=n;return this},setHeader(k,v){this.headers[k]=v},json(v){this.body=v;return this},end(){return this}};await handler(req,out);return out};
 const base={method:'GET',headers:{origin:'https://leshan-property-editor.vercel.app',authorization:'Bearer fixture'},query:{action:'list'}};
 assert.equal((await invoke({...base,headers:{origin:'https://attacker.invalid'}})).code,403);assert.equal((await invoke({...base,headers:{}})).code,401);
 const r=await invoke(base);assert.equal(r.code,200);assert.equal(r.headers['Cache-Control'],'private, no-store');assert.equal(r.headers['Access-Control-Allow-Origin'],base.headers.origin);
 assert.equal((await invoke({...base,method:'OPTIONS'})).code,204);
});

test('adding a deed later retains the same shared case and prevents a second source from duplicating its building',async()=>{
 const f=fixture();f.snapshot.details.buildingNo='';const {id}=await f.service.publish(publisher,f.body,'t');
 f.snapshot.details.buildingNo='善捷段04901-000';f.snapshot.sourceRevision='d'.repeat(64);const result=await f.service.publish(publisher,{...f.body,sourceRevision:f.snapshot.sourceRevision,expectedRevision:1},'t');assert.equal(result.id,id);
 f.snapshot.sourceCaseId='anotherSource';await assert.rejects(f.service.preview(publisher,'anotherSource','t'),e=>e.statusCode===409);
});
