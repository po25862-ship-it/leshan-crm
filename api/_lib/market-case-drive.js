const {createSign}=require('node:crypto');
const {hash,fail}=require('./market-case-model');
let readerToken=null,readerExpires=0;
function serviceAccount(){try{const a=JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON||'{}');if(!a.client_email||!a.private_key)throw Error();return {...a,private_key:a.private_key.replace(/\\n/g,'\n')};}catch{throw fail(503,'雲端檔案讀取設定尚未完成。');}}
async function readToken(){
 if(readerToken&&Date.now()<readerExpires-60000)return readerToken;
 const a=serviceAccount(),iat=Math.floor(Date.now()/1000),part=v=>Buffer.from(JSON.stringify(v)).toString('base64url');
 const body=part({alg:'RS256',typ:'JWT'})+'.'+part({iss:a.client_email,scope:'https://www.googleapis.com/auth/drive.readonly',aud:'https://oauth2.googleapis.com/token',iat,exp:iat+3600});
 const assertion=body+'.'+createSign('RSA-SHA256').update(body).sign(a.private_key,'base64url');
 const r=await fetch('https://oauth2.googleapis.com/token',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({grant_type:'urn:ietf:params:oauth:grant-type:jwt-bearer',assertion}),signal:AbortSignal.timeout(20000)});
 const d=await r.json().catch(()=>({}));if(!r.ok||!d.access_token)throw fail(503,'雲端檔案讀取暫時無法使用。');readerToken=d.access_token;readerExpires=Date.now()+Number(d.expires_in||3600)*1000;return readerToken;
}
async function request(path,token,options={}){
 const response=await fetch('https://www.googleapis.com/'+path,{...options,redirect:'error',signal:AbortSignal.timeout(25000),headers:{Authorization:'Bearer '+token,...options.headers}});
 if(!response.ok)throw fail(response.status===401?412:503,response.status===401?'Google 連線已過期，請重新連結後再分享。':'Google Drive 暫時無法使用，請確認已授權此程式存取檔案。');return response;
}
function createDriveClient(uploadToken=''){
 let folderPromise,accountPromise;
 async function account(){
  if(!uploadToken||!/^[A-Za-z0-9._~-]{20,4096}$/.test(uploadToken))throw fail(412,'請先連結 Google Drive，再分享照片或電傳整理資料。');
  if(!accountPromise)accountPromise=(async()=>{const d=await(await request('drive/v3/about?fields=storageQuota,user(emailAddress)',uploadToken)).json();if(!['po25862@gmail.com','twhgliu@gmail.com'].includes(String(d.user?.emailAddress||'').toLowerCase()))throw fail(403,'請使用你原有的 po25862@gmail.com 或 twhgliu@gmail.com 雲端硬碟。');return d;})();return accountPromise;
 }
 async function folder(){
  await account();
  if(!folderPromise)folderPromise=(async()=>{const q="trashed=false and mimeType='application/vnd.google-apps.folder' and appProperties has { key='leshanRole' and value='crm-market-cases' }";
   const found=await(await request('drive/v3/files?'+new URLSearchParams({q,fields:'files(id)',pageSize:'2'}),uploadToken)).json();
   const parent=found.files?.[0]?.id||(await(await request('drive/v3/files?fields=id',uploadToken,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({name:'樂善 CRM－共享市場案件',mimeType:'application/vnd.google-apps.folder',appProperties:{leshanRole:'crm-market-cases'}})})).json()).id;
   const email=serviceAccount().client_email;
   const permissions=await(await request('drive/v3/files/'+parent+'/permissions?fields=permissions(emailAddress,role,type)',uploadToken)).json();
   if(!permissions.permissions?.some(p=>p.emailAddress===email&&['reader','writer','owner'].includes(p.role)))await request('drive/v3/files/'+parent+'/permissions?sendNotificationEmail=false',uploadToken,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({type:'user',role:'reader',emailAddress:email})});
   return parent;
  })().catch(e=>{folderPromise=null;throw e;});return folderPromise;
 }
 async function quota(){return (await account()).storageQuota||{};}
 async function uploadPrivate(bytes,mime){
  const sha=hash(bytes),parent=await folder(),q=`trashed=false and '${parent}' in parents and appProperties has { key='sha256' and value='${sha}' }`;
  const found=await(await request('drive/v3/files?'+new URLSearchParams({q,fields:'files(id,size,mimeType)',pageSize:'10'}),uploadToken)).json();
  const match=found.files?.find(f=>Number(f.size)===bytes.length&&f.mimeType===mime);if(match)return {fileId:match.id,sha256:sha,size:bytes.length,type:mime};
  const storage=await quota();if(storage.limit&&Number(storage.usage||0)+bytes.length>Number(storage.limit))throw fail(413,'Google Drive 空間不足，請先整理容量。');
  const boundary='leshan-'+sha.slice(0,24),meta={name:sha+(mime==='image/jpeg'?'.jpg':'.json'),parents:[parent],appProperties:{leshanRole:'crm-market-cases',sha256:sha}};
  const body=Buffer.concat([Buffer.from(`--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(meta)}\r\n--${boundary}\r\nContent-Type: ${mime}\r\n\r\n`),bytes,Buffer.from(`\r\n--${boundary}--\r\n`)]);
  const result=await(await request('upload/drive/v3/files?uploadType=multipart&fields=id,size,mimeType',uploadToken,{method:'POST',headers:{'Content-Type':'multipart/related; boundary='+boundary},body})).json();
  return {fileId:result.id,sha256:sha,size:bytes.length,type:mime};
 }
 async function downloadPrivate(file){
  if(!/^[A-Za-z0-9_-]{10,200}$/.test(file.fileId||'')||!Number.isInteger(file.size)||file.size<1||file.size>700*1024)throw fail(404,'檔案資料不正確。');
  const response=await request('drive/v3/files/'+encodeURIComponent(file.fileId)+'?alt=media',await readToken());
  const reader=response.body.getReader(),parts=[];let size=0;try{for(;;){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>file.size){await reader.cancel();throw fail(502,'檔案大小不符。');}parts.push(Buffer.from(value));}}finally{reader.releaseLock();}const bytes=Buffer.concat(parts);
  if(bytes.length!==file.size||hash(bytes)!==file.sha256)throw fail(502,'檔案檢查不符，請聯絡分享人重新同步。');return bytes;
 }
 return {quota,uploadPrivate,downloadPrivate};
}
module.exports={createDriveClient};
