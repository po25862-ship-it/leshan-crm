const {verifyCrmReferenceUser}=require('./_lib/crm-reference-auth');
const {parse}=require('parse5');
const recent=new Map();
function listingUrl(input){let url;try{url=new URL(input);}catch{throw new Error('請填完整售屋網址。');}if(url.protocol!=='https:'||url.username||url.password||url.port||!['www.sinyi.com.tw','sinyi.com.tw'].includes(url.hostname)||!/^\/buy\/house\/[A-Za-z0-9]{4,12}\/?$/.test(url.pathname))throw new Error('目前可直接讀取信義售屋網址；其他網站請貼上資料或自行填寫。');return `https://www.sinyi.com.tw${url.pathname.replace(/\/$/,'')}`;}
function parseListing(html,url){
  const tree=parse(html);let script='';const visit=n=>{if(n.tagName==='script'&&(n.attrs||[]).some(a=>a.name==='id'&&a.value==='__NEXT_DATA__'))script=(n.childNodes||[]).map(c=>c.value||'').join('');(n.childNodes||[]).forEach(visit);};visit(tree);
  let data;try{data=JSON.parse(script).props.initialReduxState.buyReducer.contentData;}catch{throw new Error('網站未提供可讀取的案件資料，請改用截圖或手動填寫。');}
  const no=url.split('/').pop();if(!data||data.houseNo!==no||!data.name)throw new Error('網站沒有對應這個案件的資料，請確認網址。');
  const details={title:String(data.name).slice(0,200),listingNo:no,url,layout:String(data.layout||'').slice(0,100),floor:String(data.floor||'').slice(0,30),totalFloors:Number(data.floors)||null,price:Number(data.totalPrice)>0?Number(data.totalPrice):null,listingArea:Number(data.areaBuilding)>0?Number(data.areaBuilding):null,listingAddress:String(data.address||'').slice(0,500),parkingType:String(data.parking||'').match(/坡道平面|升降平面|坡道機械|升降機械|平面|機械/)?.[0]||'',parkingPrice:null,managementFee:String(data.monthlyFee||'').slice(0,500)};
  const parking=String(data.parking||'').match(/車位總價[:：]\s*([\d.]+)萬/);if(parking)details.parkingPrice=Number(parking[1]);return {details,source:'信義房屋公開售屋頁',fetchedAt:Date.now()};
}
function handlerFactory({verifyUser=verifyCrmReferenceUser,fetcher=fetch}={}){return async(req,res)=>{
  res.setHeader('Cache-Control','private, no-store');res.setHeader('Content-Type','application/json; charset=utf-8');
  if(req.method!=='POST'){res.setHeader('Allow','POST');return res.status(405).json({error:'請使用讀取售屋網址按鈕。'});}
  try{const user=await verifyUser(req);let url;try{url=listingUrl(req.body?.url);}catch(error){return res.status(400).json({error:error.message});}
    const now=Date.now(),times=(recent.get(user.uid)||[]).filter(t=>t>now-60000);if(times.length>=15)return res.status(429).json({error:'讀取較頻繁，請稍後再試。'});times.push(now);recent.set(user.uid,times);if(recent.size>10000)for(const [key,v]of recent)if(v.at(-1)<now-60000)recent.delete(key);
    const response=await fetcher(url,{headers:{'User-Agent':'Mozilla/5.0 (compatible; LeshanCRM/1.0)'},redirect:'error',signal:AbortSignal.timeout(12000)});if(!response.ok)throw new Error('售屋網站暫時無法讀取，可改用手動填寫。');
    const reader=response.body?.getReader();let html='';if(reader){const decoder=new TextDecoder();let bytes=0;try{while(true){const {done,value}=await reader.read();if(done)break;if((bytes+=value.length)>2*1024*1024)throw new Error('網站資料過大，請改用手動填寫。');html+=decoder.decode(value,{stream:true});}html+=decoder.decode();}finally{reader.cancel().catch(()=>{});}}else{html=await response.text();if(html.length>2*1024*1024)throw new Error('網站資料過大。');}
    return res.status(200).json(parseListing(html,url));
  }catch(error){return res.status(error.statusCode===401?401:503).json({error:error.statusCode===401?'請重新登入後再讀取。':error.message||'網站暫時無法讀取，可改用手動填寫。'});}
};}
module.exports=handlerFactory();module.exports.handlerFactory=handlerFactory;module.exports.listingUrl=listingUrl;module.exports.parseListing=parseListing;module.exports.config={maxDuration:30,api:{bodyParser:{sizeLimit:'4kb'}}};
