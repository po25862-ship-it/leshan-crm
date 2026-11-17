const test=require('node:test'),assert=require('node:assert/strict');
const model=require('../src/lib/propertySurveyModel');
const {createSurveyService,caseId,OWNER_UID}=require('../api/_lib/property-survey-service');
const {handlerFactory}=require('../api/property-survey');
function database(){const rows=new Map();const ref=path=>({path,collection:name=>collection(path+'/'+name),get:async()=>({id:path.split('/').pop(),exists:rows.has(path),data:()=>rows.get(path)}),set:async value=>rows.set(path,value)});const collection=path=>({doc:id=>ref(path+'/'+id),orderBy:()=>({limit:()=>({get:async()=>({docs:[...rows].filter(([k])=>k.startsWith(path+'/')&&k.slice(path.length+1).split('/').length===1).map(([k,v])=>({id:k.split('/').pop(),data:()=>v}))})})})});return {rows,collection,runTransaction:async fn=>fn({get:r=>r.get(),set:(r,v)=>rows.set(r.path,v)})};}
const draft=name=>({salesData:{case_name:name,sale_floor:3,total_floors:6,basement_floors:0},sellingPointsText:'1. 鄰近公園',rawText:'原始文字'});
test('floors, zero and inclusive parking price follow the approved format',()=>{
 assert.equal(model.floorLine({sale_floor:'３Ｆ',total_floors:'6樓',basement_floors:'地下1層'}),'出售樓層3樓　總樓層6層　地下1層');
 const d=model.normalizeDraft(draft('案件'));assert.equal(d.salesData.basement_floors,'0');
 const v=model.values({price_wan:858,total_ping:17.51,parking_area_ping:0});assert.equal(v.unit_price,'49');
 assert.equal(model.fromCrm({floor:'3/6',title:'案件'}).total_floors,'6');
 assert.throws(()=>model.normalizeDraft({salesData:{}}),/案名/);
 assert.throws(()=>model.normalizeDraft({...draft('案件'),floorplanBase64:'https://foreign.invalid/photo.png'}),/照片/);
});
test('survey contacts support one to three reps without changing legacy names or losing hidden contacts',()=>{
 const legacy=model.normalizeDraft({...draft('舊物調'),salesData:{case_name:'舊物調',sales_rep:'原有業務',sales_rep_phone:'0900-000-001'}});
 assert.equal(legacy.salesData.sales_rep_count,'1');assert.deepEqual(model.salesReps(legacy.salesData),[{name:'原有業務',phone:'0900-000-001'}]);
 const data={...legacy.salesData,sales_rep_count:'3',sales_rep_2:'第二位',sales_rep_phone_2:'0900-000-002',sales_rep_3:'第三位',sales_rep_phone_3:'0900-000-003'};
 const normalized=model.normalizeDraft({salesData:data});assert.equal(model.salesReps(normalized.salesData).length,3);
 assert.equal(model.salesRepCount({...data,sales_rep_count:''}),3);
 const reduced=model.normalizeDraft({salesData:{...data,sales_rep_count:'1'}});
 assert.deepEqual(model.salesReps(reduced.salesData),[{name:'原有業務',phone:'0900-000-001'}]);assert.equal(reduced.salesData.sales_rep_3,'第三位');
 assert.equal(model.normalizeDraft({salesData:{...data,sales_rep_count:'３'}}).salesData.sales_rep_count,'3');
 for(const count of ['0','4','30','1.5','兩人'])assert.throws(()=>model.normalizeDraft({salesData:{...data,sales_rep_count:count}}),/1 到 3/);
 for(const key of model.SALES_REP_KEYS)assert.ok(model.CONTACT_KEYS.includes(key));
});
test('all three contacts survive cloud save and reload; invalid counts cause no database writes',async()=>{
 const db=database(),service=createSurveyService(db);const record={...draft('三人案件'),salesData:{case_name:'三人案件',sales_rep_count:'3',sales_rep:'甲',sales_rep_phone:'0900000001',sales_rep_2:'乙',sales_rep_phone_2:'0900000002',sales_rep_3:'丙',sales_rep_phone_3:'0900000003'}};
 const saved=await service.save('A',record),loaded=await service.get('A',saved.id);
 assert.deepEqual(model.salesReps(loaded.salesData),[{name:'甲',phone:'0900000001'},{name:'乙',phone:'0900000002'},{name:'丙',phone:'0900000003'}]);
 const before=JSON.stringify([...db.rows]);await assert.rejects(service.save('A',{salesData:{...record.salesData,sales_rep_count:'4'}}),e=>e.statusCode===400);assert.equal(JSON.stringify([...db.rows]),before);
});
test('cases are isolated by uid and an old revision cannot overwrite a newer record',async()=>{
 const db=database(),service=createSurveyService(db,{now:()=>100});const a=await service.save('A',draft('第一案'));
 assert.equal(a.revision,1);assert.equal((await service.list('B')).length,0);
 await assert.rejects(service.get('B',a.id),e=>e.statusCode===404);
 await assert.rejects(service.save('A',draft('第一案')),e=>e.statusCode===409);
 const next=await service.save('A',{...draft('更新案名'),id:a.id,revision:1});assert.equal(next.revision,2);
 assert.equal((await service.get('A',a.id)).salesData.case_name,'更新案名');
 await assert.rejects(service.save('A',{...draft('舊草稿'),id:a.id,revision:1}),e=>e.statusCode===409);
});
test('desktop import is owner-only, idempotent and never overwrites cloud edits',async()=>{
 const service=createSurveyService(database());await service.seed('B',[draft('本機')]);assert.equal((await service.list('B')).length,0);
 const existing=await service.save(OWNER_UID,draft('本機'));await service.save(OWNER_UID,{...draft('本機'),id:existing.id,revision:1,notes:'雲端修改'});
 await service.seed(OWNER_UID,[draft('本機'),draft('第二案')]);await service.seed(OWNER_UID,[draft('第三案')]);
 assert.equal((await service.list(OWNER_UID)).length,2);assert.equal((await service.get(OWNER_UID,caseId('本機'))).notes,'雲端修改');
});
test('unauthenticated requests do not touch the database',async()=>{
 let accessed=false;const handler=handlerFactory({authenticate:async()=>{throw Object.assign(new Error(),{statusCode:401});},admin:()=>{accessed=true;}}),res={setHeader(){},status(code){this.code=code;return this;},json(value){this.value=value;return this;}};
 await handler({method:'POST',body:{action:'save',record:draft('案件')}},res);assert.equal(res.code,401);assert.equal(accessed,false);
});
test('authenticated save/list/get use only the authenticated account',async()=>{
 const db=database(),handler=handlerFactory({authenticate:async()=>({uid:OWNER_UID}),admin:()=>({firestore:db}),initial:()=>[]});
 const call=async req=>{const res={setHeader(){},status(code){this.code=code;return this;},json(value){this.value=value;return this;}};await handler(req,res);return res;};
 const saved=await call({method:'POST',body:{action:'save',record:{...draft('雲端案件'),ownerUid:'other'}}});assert.equal(saved.code,200);
 const listed=await call({method:'GET',query:{}});assert.equal(listed.value.cases[0].case_name,'雲端案件');
 const loaded=await call({method:'GET',query:{id:saved.value.id}});assert.equal(loaded.value.record.ownerUid,OWNER_UID);
 const snapshot=JSON.stringify([...db.rows]);await call({method:'POST',body:{action:'unknown'}});assert.equal(JSON.stringify([...db.rows]),snapshot);
});
