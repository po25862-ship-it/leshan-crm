import {auth} from '../firebase';
export const MARKET_PUBLISHER_UID='KiYlsnWcChW5muRkG167r7Mi1132';
export const MARKET_STATES=['追蹤中','已寄信','已聯繫','洽談中','已取得委託','暫停追蹤','結案'];
export function marketApiUrl(query={}){return `https://leshan-crm.vercel.app/api/market-cases?${new URLSearchParams(query)}`;}
export async function marketRequest(action,values={},method='GET'){
 const user=auth.currentUser;if(!user)throw new Error('請先登入 CRM。');
 const token=await user.getIdToken(),response=await fetch(marketApiUrl(method==='GET'?{action,...values}:{}),{method,headers:{Authorization:'Bearer '+token,...(method==='POST'?{'Content-Type':'application/json'}:{})},...(method==='POST'?{body:JSON.stringify({action,...values})}:{}),cache:'no-store'});
 if(auth.currentUser?.uid!==user.uid)throw new Error('帳號已變更，請重新讀取。');
 if(!response.ok){const data=await response.json().catch(()=>({}));throw new Error(data.error||'讀取失敗，請稍後重試。');}
 return response.json();
}
export async function marketBlob(query){
 const user=auth.currentUser;if(!user)throw new Error('請先登入 CRM。');
 const response=await fetch(marketApiUrl(query),{headers:{Authorization:'Bearer '+await user.getIdToken()},cache:'no-store'});
 if(!response.ok)throw new Error('照片暫時無法讀取，或已撤回分享。');
 if(auth.currentUser?.uid!==user.uid)throw new Error('帳號已變更。');return response.blob();
}
export const marketFacts=[['mainArea','主建物'],['accessoryArea','附屬建物'],['commonArea','公設（扣車位）'],['parkingArea','車位面積'],['totalArea','權狀總坪數'],['netArea','扣車面積']];
export function filterMarketCases(cases,{query='',status='',mine=false,due=false,archived=false,uid='',today=new Date().toLocaleDateString('sv-SE',{timeZone:'Asia/Taipei'})}={}){
 const q=query.normalize('NFKC').trim().toLowerCase();
 return cases.filter(c=>!!c.archived===archived&&(!mine||c.assigneeUid===uid)&&(!due||c.nextFollowOn&&c.nextFollowOn<=today)&&(!status||(status==='待認領'?!c.assigneeUid:!!c.assigneeUid&&c.status===status))&&(!q||[c.title,c.details?.propertyAddress,c.details?.community,c.details?.zone,c.assigneeName].filter(Boolean).join(' ').normalize('NFKC').toLowerCase().includes(q))).sort((a,b)=>b.updatedAt-a.updatedAt);
}
