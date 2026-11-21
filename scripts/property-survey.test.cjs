const test=require('node:test'),assert=require('node:assert/strict');
const model=require('../src/lib/propertySurveyModel');
const {createSurveyService,caseId,OWNER_UID}=require('../api/_lib/property-survey-service');
const {handlerFactory}=require('../api/property-survey');
const {DEFAULT_APPEARANCE}=require('../src/lib/propertySurveyAppearance');
const {DEFAULT_TYPOGRAPHY,sellingPointRuns}=require('../src/lib/propertySurveyTypography');
const {applyCommunity,STARTER_PRESETS}=require('../src/lib/propertySurveyCommunities');
function database(){const rows=new Map();const ref=path=>({path,collection:name=>collection(path+'/'+name),get:async()=>({id:path.split('/').pop(),exists:rows.has(path),data:()=>rows.get(path)}),set:async value=>rows.set(path,value)});const collection=path=>({doc:id=>ref(path+'/'+id),orderBy:()=>({limit:()=>({get:async()=>({docs:[...rows].filter(([k])=>k.startsWith(path+'/')&&k.slice(path.length+1).split('/').length===1).map(([k,v])=>({id:k.split('/').pop(),data:()=>v}))})})})});return {rows,collection,runTransaction:async fn=>fn({get:r=>r.get(),set:(r,v)=>rows.set(r.path,v)})};}
const draft=name=>({salesData:{case_name:name,sale_floor:3,total_floors:6,basement_floors:0},sellingPointsText:'1. 鄰近公園',rawText:'原始文字'});
test('survey typography and valid emphasis survive a save and old cases keep the original font',async()=>{
 const service=createSurveyService(database());
 const typography={font:'serif',sizePercent:110,lineSpacing:1.4,bold:false};
 const input={...draft('物調排版'),typography,sellingPointEmphasis:['公園','不存在','公園']};
 const saved=await service.save('A',input),loaded=await service.get('A',saved.id);
 assert.deepEqual(loaded.typography,typography);
 assert.deepEqual(loaded.sellingPointEmphasis,['公園']);
 assert.deepEqual(sellingPointRuns('鄰近公園',['公','公園']),[{text:'鄰近',highlighted:false},{text:'公園',highlighted:true}]);
 assert.deepEqual(model.normalizeDraft(draft('舊物調')).typography,DEFAULT_TYPOGRAPHY);
 assert.deepEqual(model.normalizeDraft({...draft('無效設定'),typography:{font:'not-a-font',sizePercent:300,lineSpacing:0,bold:'no'}}).typography,DEFAULT_TYPOGRAPHY);
});
test('switching communities replaces inherited data and preserves a checked case-specific value',()=>{
 const [starter]=STARTER_PRESETS;
 const initial=applyCommunity({case_name:'個案',completion_date:'單案日期'},null,starter.name,starter);
 assert.equal(initial.salesData.park,starter.values.park);
 assert.equal(initial.salesData.completion_date,'單案日期');
 assert.deepEqual(initial.retained,['建築完成日期']);
 const next=applyCommunity(initial.salesData,initial.communityAppliedValues,'另一社區',{values:{park:'另一公園'}});
 assert.equal(next.salesData.park,'另一公園');
 assert.equal(next.salesData.school,'');
 assert.equal(next.salesData.completion_date,'單案日期');
 assert.deepEqual(model.normalizeDraft(next).communityAppliedValues,{park:'另一公園'});
});
test('community defaults API stores only account-scoped community fields and supports updating the same name',async()=>{
 const db=database(),service=createSurveyService(db);
 await db.collection('colleagues').doc('A').set({name:'測試同事'});
 const handler=handlerFactory({authenticate:async()=>({uid:'A'}),admin:()=>({firestore:db}),initial:()=>[]});
 const call=async req=>{const res={setHeader(){},status(code){this.code=code;return this;},json(value){this.value=value;return this;}};await handler(req,res);return res;};
 const save=(name,values)=>call({method:'POST',body:{action:'community-default',uid:'B',preset:{name,values}}});
 assert.equal((await save('測試社區',{school:'學校甲',case_name:'不可儲存'})).code,200);
 assert.equal((await save(' 測試 社區 ',{school:'學校乙'})).code,200);
 assert.equal((await save('無內容',{case_name:'測試'})).code,400);
 assert.deepEqual((await call({method:'GET',query:{}})).value.communityDefaults,[{name:'測試 社區',values:{school:'學校乙'}}]);
 assert.deepEqual(await service.getCommunityDefaults('B'),[]);
});
test('appearance survives private cloud save/reload and malformed colors cannot be persisted',async()=>{
 const db=database(),service=createSurveyService(db),appearance={textColor:'#112233',headingColor:'#224466',accentColor:'#993311',panelColor:'#EEEECC',borderColor:'#887766',ownerUid:'B'};
 const saved=await service.save('A',{...draft('自訂配色'),appearance}),loaded=await service.get('A',saved.id);
 assert.equal(loaded.appearance.panelColor,'#eeeecc');assert.equal(loaded.appearance.ownerUid,undefined);assert.equal(loaded.appearance.textColor,'#112233');
 await assert.rejects(service.get('B',saved.id),e=>e.statusCode===404);
 assert.deepEqual(model.normalizeDraft(draft('舊格式')).appearance,{...DEFAULT_APPEARANCE});
 const before=JSON.stringify([...db.rows]);
 for(const value of ['red','url(https://example.invalid)','<script>',123,'#123',[]])await assert.rejects(service.save('A',{...draft('不合法配色'),appearance:{textColor:value}}),e=>e.statusCode===400);
 assert.equal(JSON.stringify([...db.rows]),before);
});
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
const ratioAreas={total_ping:'54.59',parking_area_ping:'11.01',main_area_ping:'27.36',attached_area_ping:'3.18'};
test('common ratio recognizes both area conventions and never subtracts parking twice',()=>{
 const gross=model.commonRatio({...ratioAreas,common_area_ping:'24.05'}),net=model.commonRatio({...ratioAreas,common_area_ping:'13.04'});
 assert.equal(gross.value,'29.92');assert.equal(gross.basis,'including-parking');assert.equal(net.value,'29.92');assert.equal(net.basis,'excluding-parking');
 assert.equal(model.commonRatio({total_ping:'30',parking_area_ping:'0',common_area_ping:'10'}).value,'33.33');
 assert.equal(model.commonRatio({total_ping:'３０',parking_area_ping:'０',common_area_ping:'１０'}).value,'33.33');
 assert.equal(model.commonRatio({...ratioAreas,common_area_ping:'10',main_area_ping:'',attached_area_ping:''}).value,'22.95');
 assert.equal(model.commonRatio({total_ping:'44.6',parking_area_ping:'7.482',main_area_ping:'17.947',attached_area_ping:'7.611',common_area_ping:'11.563'}).value,'31.15');
});
test('missing, ambiguous and contradictory areas do not produce automatic ratios or keep stale results',()=>{
 for(const change of [{parking_area_ping:''},{parking_area_ping:'54.59'},{parking_area_ping:'-1'},{common_area_ping:'-1'},{common_area_ping:'90'},{main_area_ping:'1'},{main_area_ping:'',attached_area_ping:''}]){
  const data={case_name:'不確定',...ratioAreas,common_area_ping:'24.05',...change,common_ratio_mode:'auto',common_ratio_percent:'99'};
  assert.equal(model.commonRatio(data).value,null);assert.equal(model.normalizeDraft({salesData:data}).salesData.common_ratio_percent,'');assert.equal(model.values(data).common_ratio_percent,'');
 }
 assert.equal(model.commonRatio({...ratioAreas,main_area_ping:'',attached_area_ping:'',common_area_ping:'24.05',common_area_basis:'including-parking'}).value,'29.92');
 assert.equal(model.commonRatio({...ratioAreas,common_area_ping:'5',common_area_basis:'including-parking'}).value,null);
});
test('computed ratios survive saves and exports; legacy manual ratios remain explicit and CRM basis metadata is retained',async()=>{
 const data={case_name:'自動公設',...ratioAreas,common_area_ping:'24.05',common_ratio_mode:'auto'};
 const normalized=model.normalizeDraft({salesData:data});assert.equal(normalized.salesData.common_ratio_percent,'29.92');assert.equal(model.values(normalized.salesData).common_ratio_percent,'29.92');
 const service=createSurveyService(database()),saved=await service.save('A',{salesData:data});assert.equal((await service.get('A',saved.id)).salesData.common_ratio_percent,'29.92');
 const legacy=model.normalizeDraft({salesData:{case_name:'舊資料',common_ratio_percent:'31.5'}});assert.equal(legacy.salesData.common_ratio_mode,'manual');assert.equal(model.values(legacy.salesData).common_ratio_percent,'31.5');
 const crm=model.fromCrm({title:'已扣車位',titlePing:54.59,parkingPing:11.01,commonAreaPing:13.04,commonAreaBasis:'excluding-parking'});
 assert.equal(crm.common_area_basis,'excluding-parking');assert.equal(model.commonRatio(crm).value,'29.92');
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
test('remembered survey teams are private per account, bounded to three people and separate from existing cases',async()=>{
 const db=database(),service=createSurveyService(db,{now:()=>123});const saved=await service.save('A',draft('保留案件'));
 await service.saveSalesDefaults('A',{sales_rep_count:'3',sales_rep:'甲',sales_rep_phone:'0900000001',sales_rep_2:'乙',sales_rep_3:'丙',case_name:'不應記住的案件',ownerUid:'B'});
 assert.equal((await service.getSalesDefaults('A')).sales_rep_3,'丙');assert.equal(await service.getSalesDefaults('B'),null);
 assert.equal((await service.getSalesDefaults('A')).case_name,undefined);assert.equal((await service.get('A',saved.id)).salesData.sales_rep,'');
 const snapshot=JSON.stringify([...db.rows]);await assert.rejects(service.saveSalesDefaults('A',{sales_rep_count:'4'}),e=>e.statusCode===400);await assert.rejects(service.saveSalesDefaults('A',{sales_rep:'x'.repeat(501)}),e=>e.statusCode===400);assert.equal(JSON.stringify([...db.rows]),snapshot);
 await service.saveSalesDefaults('A',{sales_rep_count:'1'});assert.equal((await service.getSalesDefaults('A')).sales_rep,'');
});
test('defaults API derives ownership only from authentication and list responses include that account\'s preferences',async()=>{
 const db=database(),handler=handlerFactory({authenticate:async()=>({uid:OWNER_UID}),admin:()=>({firestore:db}),initial:()=>[]});
 const call=async req=>{const res={setHeader(){},status(code){this.code=code;return this;},json(value){this.value=value;return this;}};await handler(req,res);return res;};
 const saved=await call({method:'POST',body:{action:'sales-defaults',uid:'other',salesData:{sales_rep_count:'2',sales_rep:'自己的甲',sales_rep_2:'自己的乙'}}});assert.equal(saved.code,200);
 const listed=await call({method:'GET',query:{}});assert.equal(listed.value.salesDefaults.sales_rep_2,'自己的乙');assert.deepEqual(listed.value.cases,[]);
 assert.equal(await createSurveyService(db).getSalesDefaults('other'),null);
});
