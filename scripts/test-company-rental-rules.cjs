const fs=require('fs');
// Uses the existing Firebase CLI login; credentials are never printed.
const auth=require(process.env.FIREBASE_CLI_AUTH_MODULE || '/usr/local/lib/node_modules/firebase-tools/lib/auth.js');
const root=require('path').resolve(__dirname,'..');
const member='staff-a', other='staff-b';
const data={title:'租賃測試',ownerUid:member,photos:[],status:'available',rent:28000,city:'桃園市',district:'龜山區',street:'樂善二路',lastModifiedByUid:member};
const test=(expectation,path,method,uid,resource,next,mocks=[])=>({expectation,request:{path,method,auth:uid?{uid,token:{}}:null,...(next?{resource:{data:next}}:{})},...(resource?{resource:{data:resource}}:{}),functionMocks:mocks});
const cases=[
 test('ALLOW','/databases/(default)/documents/companyRentals/test','create',member,null,{...data,buyerServiceFee:'half month',agentUid:other}),
 test('DENY','/databases/(default)/documents/companyRentals/test','create',member,null,{...data,sellerServiceFee:'private'}),
 test('DENY','/databases/(default)/documents/companyRentals/test','create',member,null,{...data,legacyServiceFee:'private'}),
 test('ALLOW','/databases/(default)/documents/companyRentals/test/internal/details','create',member,null,{sellerServiceFee:'private',legacyServiceFee:'unclassified'},[{function:'getAfter',args:[{anyValue:{}}],result:{value:{data:{ownerUid:member}}}}]),
 test('DENY','/databases/(default)/documents/companyRentals/test/internal/details','get',null,{sellerServiceFee:'private'}),
 test('ALLOW','/databases/(default)/documents/companyRentals/test','get',member,data),
 test('DENY','/databases/(default)/documents/companyRentals/test','get',null,data),
 test('ALLOW','/databases/(default)/documents/companyRentals/test','create',member,null,data),
 test('DENY','/databases/(default)/documents/companyRentals/test','create',other,null,data),
 test('ALLOW','/databases/(default)/documents/companyRentals/test','update',member,data,{...data,rent:30000}),
 test('DENY','/databases/(default)/documents/companyRentals/test','update',other,data,{...data,lastModifiedByUid:other}),
 test('DENY','/databases/(default)/documents/companyRentals/test','update',member,data,{...data,ownerUid:other}),
 test('DENY','/databases/(default)/documents/companyRentals/test','create',member,null,{...data,landlordPhone:'secret'}),
 test('DENY','/databases/(default)/documents/rentals/private','get',other,{ownerUid:member,sharedWith:[]}),
 test('DENY','/databases/(default)/documents/companyRentals/test','delete',member,data),
 test('ALLOW','/databases/(default)/documents/companyRentals/test/internal/details','create',member,null,{doorAddress:'secret'},[{function:'getAfter',args:[{anyValue:{}}],result:{value:{data:{ownerUid:member}}}}]),
 test('DENY','/databases/(default)/documents/companyRentals/test/internal/details','update',other,{doorAddress:'secret'},{doorAddress:'edit'},[{function:'getAfter',args:[{anyValue:{}}],result:{value:{data:{ownerUid:member}}}}]),
 test('ALLOW','/databases/(default)/documents/contacts/new/appointments/test','create',member,null,{date:'2026-11-01'},[{function:'getAfter',args:[{anyValue:{}}],result:{value:{data:{ownerUid:member,sharedWith:[]}}}}]),
 test('DENY','/databases/(default)/documents/contacts/new/appointments/test','create',other,null,{date:'2026-11-01'},[{function:'getAfter',args:[{anyValue:{}}],result:{value:{data:{ownerUid:member,sharedWith:[]}}}}]),
];
(async()=>{const a=auth.getGlobalDefaultAccount();const t=await auth.getAccessToken(a.tokens.refresh_token,a.tokens.scopes||[]);const source=fs.readFileSync(root+'/firestore.rules','utf8');const r=await fetch('https://firebaserules.googleapis.com/v1/projects/leshan-crm:test',{method:'POST',headers:{Authorization:'Bearer '+t.access_token,'content-type':'application/json'},body:JSON.stringify({source:{files:[{name:'firestore.rules',content:source}]},testSuite:{testCases:cases}})});const j=await r.json();if(!r.ok){console.log(JSON.stringify(j));process.exit(1)}if((j.testResults||[]).length !== cases.length || j.testResults.some(t=>t.state!=='SUCCESS')) { console.log(JSON.stringify(j));process.exit(1); } console.log('Firestore rules: '+cases.length+' passed');
const storageCases=[['ALLOW','create',member,100,'image/jpeg',member],['DENY','create',member,300001,'image/jpeg',member],['DENY','create',member,100,'application/pdf',member],['DENY','create',other,100,'image/jpeg',member],['DENY','get',null,0,'',member],['ALLOW','get',other,100,'image/jpeg',member],['ALLOW','delete',member,0,'',member],['DENY','delete',other,0,'',member]].map(([expectation,method,uid,size,type,owner])=>({expectation,request:{path:'/b/leshan-crm.firebasestorage.app/o/companyRentals/'+owner+'/test/photo.jpg',method,auth:uid?{uid,token:{}}:null,resource:{size,contentType:type}}}));
const sr=await fetch('https://firebaserules.googleapis.com/v1/projects/leshan-crm:test',{method:'POST',headers:{Authorization:'Bearer '+t.access_token,'content-type':'application/json'},body:JSON.stringify({source:{files:[{name:'storage.rules',content:fs.readFileSync(root+'/storage.rules','utf8')}]},testSuite:{testCases:storageCases}})}); const sj=await sr.json();if(!sr.ok || (sj.testResults||[]).length!==storageCases.length || sj.testResults.some(t=>t.state!=='SUCCESS')){console.log(JSON.stringify(sj));process.exit(1)}console.log('Storage rules: '+storageCases.length+' passed');})().catch(error => { console.error(error.message); process.exitCode=1; });
