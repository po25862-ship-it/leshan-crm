const {requireFirebaseUser,ensureFirebaseAdmin}=require('./_lib/market-auth');
const {createMarketCaseService}=require('./_lib/market-case-service');
const model=require('./_lib/market-case-model');
const ORIGINS=['https://leshan-crm.vercel.app','https://leshan-property-editor.vercel.app'];
function createHandler(deps={}){
 const windows=new Map();
 function limit(uid,action){const key=uid+':'+(action==='publish'?'publish':'read'),time=Date.now(),entry=windows.get(key);if(!entry||entry.until<time){if(windows.size>5000)windows.clear();windows.set(key,{until:time+60000,count:1});return;}if(++entry.count>(action==='publish'?6:240))throw model.fail(429,'操作較頻繁，請稍候一分鐘再試。');}

 return async function handler(req,res){
  const origin=req.headers.origin;if(origin&&!ORIGINS.includes(origin))return res.status(403).json({error:'此來源未開放。'});
  if(origin){res.setHeader('Access-Control-Allow-Origin',origin);res.setHeader('Vary','Origin');res.setHeader('Access-Control-Allow-Headers','Authorization, Content-Type');res.setHeader('Access-Control-Allow-Methods','GET, POST, OPTIONS');}
  res.setHeader('Cache-Control','private, no-store');res.setHeader('X-Content-Type-Options','nosniff');
  if(req.method==='OPTIONS')return res.status(204).end();
  if(!['GET','POST'].includes(req.method))return res.status(405).json({error:'操作不支援。'});
  try{
   const user=await(deps.authenticate||requireFirebaseUser)(req),token=String(req.headers.authorization||'').slice(7);
   const service=deps.service||createMarketCaseService({db:ensureFirebaseAdmin().firestore,drive:require('./_lib/market-case-drive'),source:require('./_lib/market-case-source')});
   const body=req.method==='POST'?req.body||{}:req.query||{};
   limit(user.uid,body.action);
   if(JSON.stringify(body).length>20000)throw model.fail(413,'輸入內容過大。');
   if(req.method==='POST'){
    if(body.action==='publish')return res.status(200).json(await service.publish(user,body,token));
    if(body.action==='update')return res.status(200).json(await service.update(user,body));
    throw model.fail(400,'操作不正確。');
   }
   if(body.action==='source')return res.status(200).json(await service.preview(user,body.sourceCaseId,token));
   if(body.action==='directory')return res.status(200).json(await service.directory(user));
   if(body.action==='detail')return res.status(200).json(await service.detail(user,body.id));
   if(body.action==='list'||!body.action)return res.status(200).json(await service.list(user,body.cursor));
   if(body.action==='sourceAsset'){
    if(user.uid!==model.PUBLISHER_UID)throw model.fail(403,'只有分享人可以檢視私人來源照片。');
    if(!model.SOURCE_ID.test(body.sourceCaseId||'')||!model.HASH.test(body.sourceRevision||'')||!/^[a-f0-9]{32}$/.test(body.photoId||''))throw model.fail(400,'照片資料不正確。');
    const source=deps.source||require('./_lib/market-case-source'),image=await source.asset(body.sourceCaseId,body.photoId,body.sourceRevision,token);
    if(image.bytes.length>model.MAX_PHOTO_BYTES)throw model.fail(413,'照片過大。');res.setHeader('Content-Type','image/jpeg');return res.status(200).send(image.bytes);
   }
   if(body.action==='media'){const file=await service.media(user,body.id,body.mediaId);res.setHeader('Content-Type',file.type);return res.status(200).send(file.bytes);}
   throw model.fail(400,'操作不正確。');
  }catch(error){if(!error.statusCode||error.statusCode>=500)console.error('market_cases_failed',JSON.stringify({action:(req.body||req.query||{}).action||'list',name:error.name,code:error.code,status:error.statusCode,frames:String(error.stack||'').split('\n').filter(line=>line.trim().startsWith('at ')).slice(0,4)}));const status=error.statusCode===401||error.statusCode===403?error.statusCode:error.statusCode||500;return res.status(status).json({error:status===401?'請重新登入 CRM。':status===500?'處理暫時失敗，請稍後重試。':error.message});}
 };
}
module.exports=createHandler();module.exports.createHandler=createHandler;
module.exports.config={maxDuration:300,api:{bodyParser:{sizeLimit:'20kb'}}};
