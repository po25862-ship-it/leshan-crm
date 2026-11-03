const {googleAccessToken}=require('./google-drive');
const {hash,fail}=require('./market-case-model');
let folderPromise;
async function drive(path,options={}){
 const response=await fetch('https://www.googleapis.com/'+path,{...options,redirect:'error',signal:AbortSignal.timeout(25000),headers:{Authorization:'Bearer '+await googleAccessToken(),...options.headers}});
 if(!response.ok)throw fail(503,'雲端硬碟暫時無法使用，請稍後重試。');return response;
}
async function folder(){
 if(!folderPromise){folderPromise=(async()=>{const q="trashed=false and mimeType='application/vnd.google-apps.folder' and appProperties has { key='leshanRole' and value='crm-market-cases' }";
 const found=await(await drive('drive/v3/files?'+new URLSearchParams({q,fields:'files(id)',pageSize:'2'}))).json();
 if(found.files?.[0])return found.files[0].id;
 const result=await(await drive('drive/v3/files?fields=id',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({name:'樂善 CRM－共享市場案件',mimeType:'application/vnd.google-apps.folder',appProperties:{leshanRole:'crm-market-cases'}})})).json();return result.id;
 })().catch(e=>{folderPromise=null;throw e;});}return folderPromise;
}
async function quota(){const d=await(await drive('drive/v3/about?fields=storageQuota')).json();return d.storageQuota||{};}
async function uploadPrivate(bytes,mime){
 const sha=hash(bytes),parent=await folder();
 const q=`trashed=false and '${parent}' in parents and appProperties has { key='sha256' and value='${sha}' }`;
 const found=await(await drive('drive/v3/files?'+new URLSearchParams({q,fields:'files(id,size,mimeType)',pageSize:'10'}))).json();
 const match=found.files?.find(f=>Number(f.size)===bytes.length&&f.mimeType===mime);if(match)return {fileId:match.id,sha256:sha,size:bytes.length,type:mime};
 const storage=await quota();if(storage.limit&&Number(storage.usage||0)+bytes.length>Number(storage.limit))throw fail(413,'Google Drive 空間不足，請先整理容量。');
 const boundary='leshan-'+sha.slice(0,24),extension=mime==='image/jpeg'?'jpg':'json';
 const meta={name:sha+'.'+extension,parents:[parent],appProperties:{leshanRole:'crm-market-cases',sha256:sha}};
 const body=Buffer.concat([Buffer.from(`--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(meta)}\r\n--${boundary}\r\nContent-Type: ${mime}\r\n\r\n`),bytes,Buffer.from(`\r\n--${boundary}--\r\n`)]);
 const result=await(await drive('upload/drive/v3/files?uploadType=multipart&fields=id,size,mimeType',{method:'POST',headers:{'Content-Type':'multipart/related; boundary='+boundary},body})).json();
 return {fileId:result.id,sha256:sha,size:bytes.length,type:mime};
}
async function downloadPrivate(file){
 if(!/^[A-Za-z0-9_-]{10,200}$/.test(file.fileId||''))throw fail(404,'檔案不存在。');
 if(!Number.isInteger(file.size)||file.size<1||file.size>700*1024)throw fail(502,'檔案資料不正確。');
 const response=await drive('drive/v3/files/'+encodeURIComponent(file.fileId)+'?alt=media');
 const reader=response.body.getReader(),parts=[];let size=0;try{for(;;){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>file.size){await reader.cancel();throw fail(502,'檔案大小不符。');}parts.push(Buffer.from(value));}}finally{reader.releaseLock();}const bytes=Buffer.concat(parts);
 if(bytes.length!==file.size||hash(bytes)!==file.sha256)throw fail(502,'檔案檢查不符，請聯絡分享人重新同步。');
 return bytes;
}
module.exports={uploadPrivate,downloadPrivate,quota};
