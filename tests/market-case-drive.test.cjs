const {test}=require('node:test');
const assert=require('node:assert/strict');
const {generateKeyPairSync,createVerify}=require('node:crypto');
const {createDriveClient}=require('../api/_lib/market-case-drive');
const {hash}=require('../api/_lib/market-case-model');
test('Drive uses the publisher account to upload, grants only system reader access, and reads without publisher login',async()=>{
 const {privateKey,publicKey}=generateKeyPairSync('rsa',{modulusLength:2048}),oldEnv=process.env.FIREBASE_SERVICE_ACCOUNT_JSON,originalFetch=global.fetch;
 process.env.FIREBASE_SERVICE_ACCOUNT_JSON=JSON.stringify({client_email:'crm-reader@example.iam.gserviceaccount.com',private_key:privateKey.export({type:'pkcs8',format:'pem'})});
 const bytes=Buffer.from([255,216,255,217]),calls=[];
 const reply=data=>new Response(JSON.stringify(data),{headers:{'Content-Type':'application/json'}});
 global.fetch=async(url,options={})=>{calls.push({url,options});
  if(url.includes('/about?'))return reply({user:{emailAddress:'po25862@gmail.com'},storageQuota:{limit:'5000000000',usage:'1000'}});
  if(url==='https://oauth2.googleapis.com/token'){
   const jwt=options.body.get('assertion'),parts=jwt.split('.'),claim=JSON.parse(Buffer.from(parts[1],'base64url'));assert.equal(claim.scope,'https://www.googleapis.com/auth/drive.readonly');assert.equal(claim.iss,'crm-reader@example.iam.gserviceaccount.com');assert.equal(createVerify('RSA-SHA256').update(parts[0]+'.'+parts[1]).verify(publicKey,Buffer.from(parts[2],'base64url')),true);return reply({access_token:'server-reader-token',expires_in:3600});
  }
  if(url.includes('alt=media')){assert.equal(options.headers.Authorization,'Bearer server-reader-token');return new Response(bytes);}
  if(url.includes('/permissions'))return options.method==='POST'?reply({id:'permission'}):reply({permissions:[]});
  if(url.includes('upload/drive'))return reply({id:'private-file-123'});
  if(url.includes('drive/v3/files?fields=id')&&options.method==='POST')return reply({id:'private-folder-123'});
  if(url.includes('drive/v3/files?'))return reply({files:[]});
  throw Error('Unexpected request');
 };
 try{
  const uploader=createDriveClient('publisher-session-token-1234567890');const file=await uploader.uploadPrivate(bytes,'image/jpeg');assert.equal(file.sha256,hash(bytes));
  const sharing=calls.filter(c=>c.url.includes('/permissions')&&c.options.method==='POST');assert.equal(sharing.length,1);assert.ok(sharing[0].url.includes('sendNotificationEmail=false'));assert.deepEqual(JSON.parse(sharing[0].options.body),{type:'user',role:'reader',emailAddress:'crm-reader@example.iam.gserviceaccount.com'});
  const reader=createDriveClient();assert.deepEqual(await reader.downloadPrivate(file),bytes);
  await assert.rejects(reader.quota(),e=>e.statusCode===412);
  assert.ok(calls.every(c=>!String(c.options.body||'').includes('anyone')));
 }finally{global.fetch=originalFetch;if(oldEnv===undefined)delete process.env.FIREBASE_SERVICE_ACCOUNT_JSON;else process.env.FIREBASE_SERVICE_ACCOUNT_JSON=oldEnv;}
});
