const fs = require('fs');
const auth = require('/usr/local/lib/node_modules/firebase-tools/lib/auth.js');
const uid = 'outreach-staff-a', other = 'outreach-staff-b', admin = 'KiYlsnWcChW5muRkG167r7Mi1132', hash = 'a'.repeat(64);
const root = require('path').resolve(__dirname,'..');
const record = { ownerUid:uid, title:'測試案件',listingNo:'',propertyId:'',propertyAddress:'',url:'',recipient:'測試收件人',address:'桃園市龜山區樂善一路6號',zip:'333001',zipVerifiedAddress:'桃園市龜山區樂善一路6號',letterId:'',status:'待寄出',followOn:'',notes:'',revision:1,createdAt:1,updatedAt:1,sentCount:0,lastSentOn:'' };
const letter = {ownerUid:uid,name:'測試.pdf',type:'application/pdf',size:100,pages:1,storagePath:`outreachPrivate/${uid}/${hash}`,archived:false,createdAt:1,updatedAt:1};
const request=(expectation,path,method,who,resource,next)=>({expectation,request:{path,method,auth:who?{uid:who,token:{}}:null,...(next?{resource:{data:next}}:{})},...(resource?{resource:{data:resource}}:{})});
const path = suffix=>`/databases/(default)/documents/outreachPrivate/${uid}/${suffix}`;
const cases=[];
for(const suffix of ['records/test','records/test/events/test','letters/'+hash,'batches/test','settings/main']) {
  cases.push(request('ALLOW',path(suffix),'get',uid,record));
  for(const who of [null,other,admin]) cases.push(request('DENY',path(suffix),'get',who,record));
}
cases.push(request('ALLOW',path('records/test'),'create',uid,null,record));
for(const who of [other,admin,null]) cases.push(request('DENY',path('records/test'),'create',who,null,record));
cases.push(request('DENY',path('records/test'),'create',uid,null,{...record,ownerUid:other}));
cases.push(request('DENY',path('records/test'),'create',uid,null,{...record,shared:true}));
cases.push(request('DENY',path('records/test'),'create',uid,null,{...record,url:'javascript:alert(1)'}));
cases.push(request('DENY',path('records/test'),'create',uid,null,{...record,zip:'33300'}));
cases.push(request('ALLOW',path('records/test'),'update',uid,record,{...record,revision:2,notes:'已修改'}));
cases.push(request('DENY',path('records/test'),'update',uid,record,{...record,revision:2,ownerUid:other}));
cases.push(request('DENY',path('records/test'),'update',uid,record,{...record,notes:'未增加版號'}));
cases.push(request('DENY',path('records/test'),'update',other,record,{...record,revision:2}));
cases.push(request('DENY',path('records/test'),'update',admin,record,{...record,revision:2}));
cases.push(request('ALLOW',path('letters/'+hash),'create',uid,null,letter));
cases.push(request('ALLOW',path('letters/'+hash),'delete',uid,letter));
cases.push(request('DENY',path('letters/'+hash),'delete',uid,{...letter,usedInHistory:true}));
cases.push(request('DENY',path('letters/'+hash),'update',uid,{...letter,usedInHistory:true},{...letter,usedInHistory:false}));
cases.push(request('DENY',path('letters/'+hash),'create',uid,null,{...letter,storagePath:`outreachPrivate/${other}/${hash}`}));
cases.push(request('DENY',path('letters/'+hash),'create',uid,null,{...letter,size:5242881}));
cases.push(request('DENY',path('letters/'+hash),'create',admin,null,letter));
cases.push(request('ALLOW',path('letters/'+hash),'create',uid,null,{...letter,type:'text/plain',size:0,pages:0,storagePath:'',text:'{{姓名}} 您好'}));
cases.push(request('ALLOW',path('settings/main'),'create',uid,null,{ownerUid:uid,senderAddress:'桃園市龜山區樂善一路6號',senderZip:'333001',senderZipVerifiedAddress:'桃園市龜山區樂善一路6號',updatedAt:1}));
cases.push(request('ALLOW',path('batches/test'),'create',uid,null,{ownerUid:uid,name:'第一輪',recordIds:['test'],updatedAt:1}));
cases.push(request('DENY',path('batches/test'),'create',other,null,{ownerUid:uid,name:'第一輪',recordIds:['test'],updatedAt:1}));
const event={ownerUid:uid,type:'已寄出',day:'2026-11-02',note:'',followOn:'2026-11-09',batchId:'',letterId:hash,letterName:'測試.pdf',recipient:record.recipient,address:record.address,zip:'333001',createdAt:1};
cases.push(request('ALLOW',path('records/test/events/sent-2026-11-02'),'create',uid,null,event));
cases.push(request('DENY',path('records/test/events/sent-2026-11-02'),'update',uid,event,event));
cases.push(request('DENY',path('records/test/events/sent-2026-11-02'),'create',other,null,event));
cases.push(request('ALLOW','/databases/(default)/documents/legacyAdmin/test','get',admin,{x:1}));
cases.push(request('DENY','/databases/(default)/documents/legacyAdmin/test','get',other,{x:1}));
cases.push(request('ALLOW','/databases/(default)/documents/properties/test','get',other,{x:1}));
const privateCase={ownerUid:uid,key:'桃園市/龜山區/測試段/04901000',title:'整合測試',details:{propertyAddress:'桃園市龜山區測試路13號6樓',buildingNo:'測試段04901-000',totalArea:49.46},owners:[{key:'0004',address:'測試地址',share:'1/3'}],sourceIds:[hash],priceHistory:[],revision:1,createdAt:1,updatedAt:1};
const source={ownerUid:uid,name:'deed.html',type:'application/json',size:100,storagePath:`outreachPrivate/${uid}/sources/${hash}`,usedInCase:false,createdAt:1};
for(const kind of ['cases','sourceFiles']){for(const who of [null,other,admin])cases.push(request('DENY',path(kind+'/'+hash),'get',who,kind==='cases'?privateCase:source));cases.push(request('ALLOW',path(kind+'/'+hash),'get',uid,kind==='cases'?privateCase:source));}
cases.push(request('ALLOW',path('cases/'+hash),'create',uid,null,privateCase));
for(const who of [null,other,admin])cases.push(request('DENY',path('cases/'+hash),'create',who,null,privateCase));
cases.push(request('DENY',path('cases/'+hash),'create',uid,null,{...privateCase,ownerUid:other}));
cases.push(request('DENY',path('cases/'+hash),'create',uid,null,{...privateCase,sharedWith:[other]}));
cases.push(request('ALLOW',path('cases/'+hash),'update',uid,privateCase,{...privateCase,revision:2,title:'修改'}));
cases.push(request('DENY',path('cases/'+hash),'update',uid,privateCase,{...privateCase,title:'未增加版號'}));
cases.push(request('DENY',path('cases/'+hash),'update',uid,privateCase,{...privateCase,key:'其他建號',revision:2}));
cases.push(request('ALLOW',path('sourceFiles/'+hash),'create',uid,null,source));
cases.push(request('DENY',path('sourceFiles/'+hash),'create',admin,null,source));
cases.push(request('DENY',path('sourceFiles/'+hash),'create',uid,null,{...source,storagePath:`outreachPrivate/${other}/sources/${hash}`}));
cases.push(request('DENY',path('sourceFiles/'+hash),'create',uid,null,{...source,type:'text/html'}));
cases.push(request('DENY',path('sourceFiles/'+hash),'create',uid,null,{...source,size:5242881}));
cases.push(request('ALLOW',path('sourceFiles/'+hash),'update',uid,source,{...source,usedInCase:true}));
cases.push(request('DENY',path('sourceFiles/'+hash),'update',uid,{...source,usedInCase:true},source));
cases.push(request('DENY',path('sourceFiles/'+hash),'update',uid,source,{...source,name:'overwrite'}));
cases.push(request('ALLOW',path('records/integrated'),'create',uid,null,{...record,caseId:hash,caseKey:privateCase.key,sourceOwnerKey:'0004'}));
cases.push(request('DENY',path('records/integrated'),'create',uid,null,{...record,caseId:'../other'}));
async function run(token,name,testCases) {
  const r=await fetch('https://firebaserules.googleapis.com/v1/projects/leshan-crm:test',{method:'POST',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},body:JSON.stringify({source:{files:[{name,content:fs.readFileSync(root+'/'+name,'utf8')}]},testSuite:{testCases}})});
  const data=await r.json();const failed=(data.testResults||[]).map((r,i)=>({...r,index:i,request:testCases[i]?.request})).filter(r=>r.state!=='SUCCESS');
  if(!r.ok||data.issues?.some(i=>i.severity==='ERROR')||failed.length||(data.testResults||[]).length!==testCases.length){console.log(JSON.stringify({name,issues:data.issues,failed,returned:data.testResults?.length,status:r.status}));throw Error(name+' tests failed');}console.log(`${name}: ${testCases.length} passed`);
}
(async()=>{const a=auth.getGlobalDefaultAccount(),t=await auth.getAccessToken(a.tokens.refresh_token,a.tokens.scopes||[]);await run(t.access_token,'firestore.rules',cases);
const storageCases=[];
const make=(expectation,method,who,size=100,type='application/pdf',metadata={ownerUid:uid,sha256:hash},fileId=hash)=>({expectation,request:{path:`/b/leshan-crm.firebasestorage.app/o/outreachPrivate/${uid}/${fileId}`,method,auth:who?{uid:who,token:{}}:null,resource:{size,contentType:type,metadata}}});
storageCases.push(make('ALLOW','create',uid));
for(const who of [other,admin,null]) {storageCases.push(make('DENY','create',who));storageCases.push(make('DENY','get',who));}
storageCases.push(make('ALLOW','delete',uid),make('DENY','delete',other),make('DENY','delete',admin),make('ALLOW','get',uid),make('DENY','update',uid),make('DENY','create',uid,5242881),make('DENY','create',uid,0),make('DENY','create',uid,100,'text/html'),make('DENY','create',uid,100,'application/pdf',{ownerUid:other,sha256:hash}),make('DENY','create',uid,100,'application/pdf',{ownerUid:uid,sha256:hash},'bad-path'));
storageCases.push({expectation:'ALLOW',request:{path:'/b/leshan-crm.firebasestorage.app/o/properties/test/sheet.pdf',method:'get',auth:{uid:other,token:{}}}});
for(const who of [uid,other,admin,null]){const mine=who===uid;storageCases.push({expectation:mine?'ALLOW':'DENY',request:{path:`/b/leshan-crm.firebasestorage.app/o/outreachPrivate/${uid}/sources/${hash}`,method:'get',auth:who?{uid:who,token:{}}:null}});storageCases.push({...make(mine?'ALLOW':'DENY','create',who,100,'application/json'),request:{...make(mine?'ALLOW':'DENY','create',who,100,'application/json').request,path:`/b/leshan-crm.firebasestorage.app/o/outreachPrivate/${uid}/sources/${hash}`}});}
for(const [size,type]of [[5242881,'application/json'],[0,'application/json'],[100,'text/html']]){const c=make('DENY','create',uid,size,type);c.request.path=`/b/leshan-crm.firebasestorage.app/o/outreachPrivate/${uid}/sources/${hash}`;storageCases.push(c);}
await run(t.access_token,'storage.rules',storageCases);})().catch(e=>{console.error(e.message);process.exitCode=1;});
