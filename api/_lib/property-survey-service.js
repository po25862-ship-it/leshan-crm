const crypto=require('crypto');
const model=require('../../src/lib/propertySurveyModel');
const fail=(status,message)=>Object.assign(new Error(message),{statusCode:status});
const ID=/^[a-f0-9]{32}$/;
const OWNER_UID='KiYlsnWcChW5muRkG167r7Mi1132';
function caseId(title){return crypto.createHash('sha256').update(String(title).trim()).digest('hex').slice(0,32);}
function validateDraft(value){try{const draft=model.normalizeDraft(value);if(Buffer.byteLength(JSON.stringify(draft),'utf8')>900000)throw new Error('案件資料過大，請縮小照片或精簡文字。');return draft;}catch(error){throw fail(400,error.message);}}
function createSurveyService(db,{now=()=>Date.now()}={}){
  const cases=uid=>db.collection('propertySurveys').doc(uid).collection('cases');
  const ref=(uid,id)=>{if(!ID.test(id||''))throw fail(400,'案件編號不正確。');return cases(uid).doc(id);};
  async function save(uid,body){
    const draft=validateDraft(body),id=body.id||caseId(draft.salesData.case_name),target=ref(uid,id);
    return db.runTransaction(async tx=>{
      const current=await tx.get(target),old=current.exists?current.data():null;
      if(old&&(body.revision??null)!==old.revision)throw fail(409,'這個案件已存在或剛在其他裝置更新，請先從案件記錄載入最新資料。');
      if(!old&&body.revision)throw fail(409,'案件已不存在，請重新載入。');
      const time=now(),record={...draft,ownerUid:uid,revision:(old?.revision||0)+1,createdAt:old?.createdAt||time,updatedAt:time};
      tx.set(target,record);return {id,revision:record.revision,updatedAt:time};
    });
  }
  async function list(uid){const result=await cases(uid).orderBy('updatedAt','desc').limit(200).get();return result.docs.map(s=>{const d=s.data();return {id:s.id,case_name:d.salesData.case_name,address:d.salesData.address,price_wan:d.salesData.price_wan,updatedAt:d.updatedAt,revision:d.revision};});}
  async function get(uid,id){const snapshot=await ref(uid,id).get();if(!snapshot.exists)throw fail(404,'找不到這筆物調。');return {id:snapshot.id,...snapshot.data()};}
  async function seed(uid,initial){
    if(uid!==OWNER_UID||!Array.isArray(initial))return;
    const marker=db.collection('propertySurveys').doc(uid).collection('meta').doc('desktop-import-v1');
    if((await marker.get()).exists)return;
    for(const input of initial){const draft=validateDraft(input),target=ref(uid,caseId(draft.salesData.case_name));await db.runTransaction(async tx=>{if((await tx.get(target)).exists)return;const time=now();tx.set(target,{...draft,ownerUid:uid,revision:1,createdAt:time,updatedAt:time,importedFromDesktop:true});});}
    await marker.set({completedAt:now(),count:initial.length});
  }
  return {save,list,get,seed};
}
module.exports={createSurveyService,caseId,validateDraft,fail,OWNER_UID};
