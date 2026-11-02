// Read-only by default. --apply moves legacy private fields after saving a local 0600 backup.
const fs=require('fs'),path=require('path'),os=require('os'),babel=require('@babel/core');
const auth=require('/usr/local/lib/node_modules/firebase-tools/lib/auth.js');
const src=path.resolve(__dirname,'../src')+path.sep, original=require.extensions['.js'];
require.extensions['.js']=(m,f)=>{if(f.startsWith(src))m._compile(babel.transformSync(fs.readFileSync(f,'utf8'),{filename:f,babelrc:false,configFile:false,plugins:['@babel/plugin-transform-modules-commonjs']}).code,f);else original(m,f);};
const {splitNeedData,NEED_PUBLIC_FIELDS}=require('../src/lib/needPrivacy');
const base='https://firestore.googleapis.com/v1/projects/leshan-crm/databases/(default)/documents';
const decode=v=>'stringValue'in v?v.stringValue:'booleanValue'in v?v.booleanValue:'integerValue'in v?Number(v.integerValue):'doubleValue'in v?v.doubleValue:'nullValue'in v?null:'timestampValue'in v?v.timestampValue:'arrayValue'in v?(v.arrayValue.values||[]).map(decode):'mapValue'in v?Object.fromEntries(Object.entries(v.mapValue.fields||{}).map(([k,x])=>[k,decode(x)])):null;
const encode=v=>v===null?{nullValue:null}:Array.isArray(v)?{arrayValue:{values:v.map(encode)}}:typeof v==='object'?{mapValue:{fields:fields(v)}}:typeof v==='boolean'?{booleanValue:v}:typeof v==='number'?Number.isInteger(v)?{integerValue:String(v)}:{doubleValue:v}:{stringValue:String(v)};
const fields=v=>Object.fromEntries(Object.entries(v).filter(([,x])=>x!==undefined).map(([k,x])=>[k,encode(x)]));
(async()=>{
 const account=auth.getGlobalDefaultAccount();if(!account)throw Error('Firebase login required');
 const token=await auth.getAccessToken(account.tokens.refresh_token,account.tokens.scopes||[]);
 const headers={Authorization:'Bearer '+token.access_token,'Content-Type':'application/json'};
 const api=async(url,body)=>{const r=await fetch(url,{method:body?'POST':'GET',headers,...(body?{body:JSON.stringify(body)}:{})});const j=await r.json();if(!r.ok)throw Error('Firestore request failed: '+r.status);return j;};
 let documents=[],page='';do{const result=await api(base+'/needs?pageSize=300'+(page?'&pageToken='+encodeURIComponent(page):''));documents.push(...(result.documents||[]));page=result.nextPageToken||'';}while(page);
 const legacy=documents.filter(d=>decode(d.fields.schemaVersion||{integerValue:'0'})!==2);
 console.log(JSON.stringify({total:documents.length,legacy:legacy.length,mode:process.argv.includes('--apply')?'apply':'dry-run'}));
 if(!process.argv.includes('--apply'))return;
 const backup=path.join(os.tmpdir(),'leshan-needs-privacy-backup-'+Date.now()+'.json');fs.writeFileSync(backup,JSON.stringify({documents}),{mode:0o600});console.log('Backup saved: '+backup);
 let count=0;
 for(const d of legacy){
  const data=Object.fromEntries(Object.entries(d.fields||{}).map(([k,v])=>[k,decode(v)]));if(!data.ownerUid)throw Error('A legacy need has no owner; migration stopped safely');
  const {publicData,privateData}=splitNeedData(data,data.ownerUid);
  const publicFields=fields(publicData);if(d.fields.createdAt)publicFields.createdAt=d.fields.createdAt;publicFields.updatedAt={timestampValue:new Date().toISOString()};
  const legacyFields=Object.fromEntries(Object.entries(d.fields).filter(([key])=>!NEED_PUBLIC_FIELDS.includes(key)));
  const privateFields={...fields(privateData),legacyFields:{mapValue:{fields:legacyFields}}};
  await api(base+':commit',{writes:[
    {update:{name:d.name,fields:publicFields},currentDocument:{updateTime:d.updateTime}},
    {update:{name:d.name+'/private/details',fields:privateFields},currentDocument:{exists:false}}
  ]});count++;
 }
 console.log(JSON.stringify({migrated:count,remaining:legacy.length-count}));
 // Verify every public document is schema v2 and has no legacy fields; never print recipient data.
 let verified=0;for(const d of documents){const current=await api('https://firestore.googleapis.com/v1/'+d.name);if(Object.keys(current.fields).some(k=>!NEED_PUBLIC_FIELDS.includes(k))||decode(current.fields.schemaVersion)!==2)throw Error('Public-field verification failed');verified++;}
 console.log(JSON.stringify({verifiedPublicDocuments:verified}));
})().catch(e=>{console.error(e.message);process.exitCode=1;});
