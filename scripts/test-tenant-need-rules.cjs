const fs=require('fs');
// Uses the existing Firebase CLI login; credentials are never printed.
const auth=require(process.env.FIREBASE_CLI_AUTH_MODULE || '/usr/local/lib/node_modules/firebase-tools/lib/auth.js');
const root=require('path').resolve(__dirname,'..');
const member='staff-a', other='staff-b';
const f=require('../src/lib/tenantNeedFields.js');
const data={...f.tenantNeedPayload({...f.tenantNeedForm(),name:'租客甲',areas:'A7',budgetText:'30000'}),ownerUid:member,ownerName:'同事甲',lastModifiedByUid:member,source:'manual',sourceEventId:'',revision:1,createdAt:1,updatedAt:1};
const path='/databases/(default)/documents/tenantNeeds/test';
const test=(expectation,method,uid,resource,next)=>({expectation,request:{path,method,auth:uid?{uid,token:{}}:null,...(next?{resource:{data:next}}:{})},...(resource?{resource:{data:resource}}:{})});
const cases=[
 test('ALLOW','create',member,null,data),
 test('DENY','create',other,null,data),
 test('DENY','create',member,null,{...data,source:'line'}),
 test('DENY','create',member,null,{...data,budgetMax:-1}),
 test('DENY','create',member,null,{...data,notes:{bad:'schema'}}),
 test('ALLOW','get',member,data),
 test('DENY','get',other,data),
 test('DENY','get',null,data),
 test('ALLOW','get',other,{...data,sharedWith:[other]}),
 test('DENY','update',other,{...data,sharedWith:[other]},{...data,sharedWith:[other],revision:2,lastModifiedByUid:other}),
 test('ALLOW','update',member,data,{...data,name:'乙',revision:2}),
 test('DENY','update',member,data,{...data,name:'乙'}),
 test('DENY','update',member,data,{...data,ownerUid:other,revision:2}),
 test('DENY','update',member,data,{...data,source:'line',revision:2}),
 test('DENY','delete',member,data),
 test('ALLOW','get','KiYlsnWcChW5muRkG167r7Mi1132',data),
];
(async()=>{const a=auth.getGlobalDefaultAccount();const t=await auth.getAccessToken(a.tokens.refresh_token,a.tokens.scopes||[]);const source=fs.readFileSync(root+'/firestore.rules','utf8');const r=await fetch('https://firebaserules.googleapis.com/v1/projects/leshan-crm:test',{method:'POST',headers:{Authorization:'Bearer '+t.access_token,'content-type':'application/json'},body:JSON.stringify({source:{files:[{name:'firestore.rules',content:source}]},testSuite:{testCases:cases}})});const j=await r.json();if(!r.ok){console.log(JSON.stringify(j));process.exit(1)}if((j.testResults||[]).length !== cases.length || j.testResults.some(t=>t.state!=='SUCCESS')) { console.log(JSON.stringify({issues:j.issues,failed:(j.testResults||[]).map((result,index)=>({index,...result})).filter(result=>result.state!=='SUCCESS')}));process.exit(1); } console.log('Firestore rules: '+cases.length+' passed');
})().catch(error => { console.error(error.message); process.exitCode=1; });
