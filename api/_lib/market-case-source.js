const {fail}=require('./market-case-model');
async function limitedBytes(response,max){if(Number(response.headers.get('content-length'))>max)throw fail(502,'來源內容過大。');const reader=response.body.getReader(),parts=[];let size=0;try{for(;;){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>max){await reader.cancel();throw fail(502,'來源內容過大。');}parts.push(Buffer.from(value));}}finally{reader.releaseLock();}return Buffer.concat(parts);}
const ENDPOINT='https://market.lkgsliu.com/crm-case-export';
async function request(body,token){
 let r;try{r=await fetch(ENDPOINT,{method:'POST',redirect:'error',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},body:JSON.stringify(body),signal:AbortSignal.timeout(20000)});}catch{throw fail(503,'市場開發本機程式目前無法連線。首次分享或更新來源時，請先開啟本機程式；已分享的案件仍可查看。');}
 if(!r.ok){const d=await r.json().catch(()=>({}));throw fail(r.status===409?409:503,d.error==='source_changed'?'來源已更新，請重新讀取再分享。':'暫時讀不到來源，請確認市場開發本機程式已更新並在線。');}return r;
}
module.exports={
 preview:async(caseId,token)=>{const r=await request({action:'preview',caseId},token);const raw=await limitedBytes(r,1024*1024);return JSON.parse(raw.toString('utf8'));},
 asset:async(caseId,photoId,revision,token)=>{const r=await request({action:'asset',caseId,photoId,revision},token);const bytes=await limitedBytes(r,300*1024);return {bytes,width:Number(r.headers.get('x-image-width')),height:Number(r.headers.get('x-image-height'))};}
};
