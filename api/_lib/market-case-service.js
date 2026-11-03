const m=require('./market-case-model');
function createMarketCaseService({db,drive,source,now=()=>Date.now()}){
 const cases=db.collection('marketCases'),assets=db.collection('marketCaseAssets'),budget=db.doc('marketCaseSystem/storage');
 const ref=id=>{if(!m.CASE_ID.test(id||''))throw m.fail(404,'找不到案件。');return cases.doc(id);};
 const get=async id=>{const s=await ref(id).get();return s.exists?s.data():null;};
 async function storeAsset(bytes,type){
  const sha=m.hash(bytes),ar=assets.doc(sha),time=now(),lease=m.hash(String(time)+Math.random());
  const existing=await db.runTransaction(async tx=>{
   const [a,b]=await Promise.all([tx.get(ar),tx.get(budget)]);const value=a.exists?a.data():null,storage=b.exists?b.data():{};
   if(value?.status==='ready')return value;
   if(value?.status==='pending'&&value.expiresAt>time)throw m.fail(409,'同一張照片正在處理，請稍後再試。');
   const held=Math.max(0,(storage.reservedBytes||0)-(value?.status==='pending'?value.size:0));
   if((storage.usedBytes||0)+held+bytes.length>m.LIBRARY_BYTES)throw m.fail(413,'共享照片庫已達 250MB 保護上限，既有資料仍可查看。');
   tx.set(budget,{usedBytes:storage.usedBytes||0,reservedBytes:held+bytes.length,limit:m.LIBRARY_BYTES,updatedAt:time});
   tx.set(ar,{status:'pending',size:bytes.length,lease,expiresAt:time+15*60000});return null;
  });
  if(existing)return {...existing,id:sha};
  try{
   const file=await drive.uploadPrivate(bytes,type);
   await db.runTransaction(async tx=>{const [a,b]=await Promise.all([tx.get(ar),tx.get(budget)]);if(a.data()?.lease!==lease)throw m.fail(409,'檔案處理已更新，請重試。');const s=b.data()||{};tx.set(ar,{...file,status:'ready',createdAt:time});tx.set(budget,{...s,usedBytes:(s.usedBytes||0)+bytes.length,reservedBytes:Math.max(0,(s.reservedBytes||0)-bytes.length),updatedAt:now()});});
   return {...file,id:sha};
  }catch(error){
   await db.runTransaction(async tx=>{const [a,b]=await Promise.all([tx.get(ar),tx.get(budget)]);if(a.data()?.lease===lease){tx.set(ar,{status:'failed',size:bytes.length,at:now()});tx.set(budget,{...(b.data()||{}),reservedBytes:Math.max(0,(b.data()?.reservedBytes||0)-bytes.length),updatedAt:now()});}});throw error;
  }
 }
 async function preview(user,caseId,token){
  if(user.uid!==m.PUBLISHER_UID)throw m.fail(403,'只有案件分享人可以讀取私人開發來源。');
  if(!m.SOURCE_ID.test(caseId||''))throw m.fail(400,'來源編號不正確。');
  const snapshot=m.checkSource(await source.preview(caseId,token));
  const [sourceMap,keyMap]=await Promise.all([db.doc('marketCaseSystem/source-'+caseId).get(),db.doc('marketCaseSystem/case-'+m.hash(m.keyOf(snapshot))).get()]);
  const id=sourceMap.data()?.caseId||keyMap.data()?.caseId||m.hash(m.keyOf(snapshot)),old=await get(id);
  if(sourceMap.exists&&keyMap.exists&&sourceMap.data().caseId!==keyMap.data().caseId)throw m.fail(409,'這個建號已有其他分享案件，請先核對來源。');
  if(old&&old.sourceCaseId!==caseId)throw m.fail(409,'這個建號已有分享案件，請從原本的開發檔案更新，避免重複建立。');
  return {id,snapshot,existing:old?{id,...old}:null};
 }
 async function publish(user,body,token){
  const {snapshot,existing,id}=await preview(user,body.sourceCaseId,token),sel=m.selectionOf(body,snapshot);
  if((existing?.revision||null)!==body.expectedRevision)throw m.fail(409,'分享內容已被更新，請重新讀取。');
  const people=await db.collection('colleagues').get(),directory=new Map(people.docs.map(x=>[x.id,x.data()]));
  if(sel.sharedWith.some(uid=>uid!==m.PUBLISHER_UID&&!directory.has(uid)))throw m.fail(400,'有同仁帳號已不存在，請重新選擇。');
  const files={},photos=[];
  for(const photoId of sel.photoIds){
   const photo=snapshot.photos.find(p=>p.id===photoId),image=await source.asset(snapshot.sourceCaseId,photoId,snapshot.sourceRevision,token);
   if(!Buffer.isBuffer(image.bytes)||image.bytes.length>m.MAX_PHOTO_BYTES||image.bytes[0]!==255||image.bytes[1]!==216)throw m.fail(502,'照片格式不正確，尚未發布案件。');
   const file=await storeAsset(image.bytes,'image/jpeg');files[file.id]={assetId:file.id,private:false};
   if(!photos.some(p=>p.id===file.id))photos.push({id:file.id,name:m.text(photo.name,150),kind:photo.kind||'photo',size:file.size,width:image.width||null,height:image.height||null});
  }
  const owners=m.ownersOf(snapshot,sel.ownerKeys);let deedId='';
  if(sel.includeDeed){
   const bytes=Buffer.from(JSON.stringify({format:'leshan-shared-deed',version:1,summary:snapshot.deed?.summary||{},owners,sourceUpdatedAt:snapshot.sourceUpdatedAt}));
   if(bytes.length>700*1024)throw m.fail(413,'電傳整理內容過大，請先縮小分享範圍。');
   const file=await storeAsset(bytes,'application/json');deedId=file.id;files[file.id]={assetId:file.id,private:true};
  }
  const actorName=directory.get(user.uid)?.name||user.name||'案件分享人',time=now();
  await db.runTransaction(async tx=>{
   const sourceIndex=db.doc('marketCaseSystem/source-'+snapshot.sourceCaseId),keyIndex=db.doc('marketCaseSystem/case-'+m.hash(m.keyOf(snapshot)));
   const [current,sourceMap,keyMap]=await Promise.all([tx.get(ref(id)),tx.get(sourceIndex),tx.get(keyIndex)]),old=current.exists?current.data():null;
   if([sourceMap,keyMap].some(s=>s.exists&&s.data().caseId!==id))throw m.fail(409,'同一建號已建立分享，請重新讀取。');
   if((old?.revision||null)!==body.expectedRevision)throw m.fail(409,'案件已更新，請重新確認後再發布。');
   const record={...m.mergePublished(old,snapshot,sel,photos,actorName,time),assigneeName:sel.assigneeUid?(directory.get(sel.assigneeUid)?.name||'同仁'):''};
   tx.set(sourceIndex,{caseId:id});tx.set(keyIndex,{caseId:id});
   tx.set(ref(id),record);tx.set(ref(id).collection('private').doc('owners'),{owners,sourceRevision:snapshot.sourceRevision});
   tx.set(ref(id).collection('private').doc('files'),{files,deedId});
   tx.set(ref(id).collection('activities').doc(),{type:old?'同步來源':'分享案件',note:old?'已同步物件來源，原追蹤紀錄保留。':'已分享指定內容與同仁。',byUid:user.uid,byName:actorName,at:time});
  });
  return {id};
 }
 async function list(user,cursor){
  if(cursor&&!m.CASE_ID.test(cursor))throw m.fail(400,'分頁資料不正確。');
  let q=cases.where('sharedWith','array-contains',user.uid).orderBy('__name__').limit(101);if(cursor)q=q.startAfter(cursor);
  const result=await q.get(),rows=result.docs.slice(0,100).filter(s=>m.canRead(s.data(),user.uid)).map(s=>m.listRecord(s.id,s.data()));
  return {cases:rows,nextCursor:result.docs.length>100?rows[rows.length-1].id:null};
 }
 async function detail(user,id){
  const c=m.assertRead(await get(id),user.uid),privateOK=m.canPrivate(c,user.uid);
  const activities=await ref(id).collection('activities').orderBy('at','desc').limit(100).get();
  const privateData=privateOK?await Promise.all(['owners','files'].map(kind=>ref(id).collection('private').doc(kind).get())):[];
  return {...m.listRecord(id,c),...(user.uid===c.publisherUid?{sourceSelection:c.sourceSelection}:{}),canReadOwners:privateOK,
   owners:privateData[0]?.data()?.owners||[],deedId:privateData[1]?.data()?.deedId||'',activities:activities.docs.map(s=>({id:s.id,...s.data()}))};
 }
 async function media(user,id,mediaId){
  if(!m.HASH.test(mediaId||''))throw m.fail(404,'找不到檔案。');
  const c=m.assertRead(await get(id),user.uid),files=await ref(id).collection('private').doc('files').get(),entry=files.data()?.files?.[mediaId];
  if(!entry||(entry.private&&!m.canPrivate(c,user.uid)))throw m.fail(404,'檔案未分享給你。');
  const a=await assets.doc(entry.assetId).get();if(!a.exists||a.data().status!=='ready')throw m.fail(404,'檔案尚未完成保存。');
  return {bytes:await drive.downloadPrivate(a.data()),type:a.data().type};
 }
 async function update(user,body){
  const id=body.id,doc=ref(id),time=now(),profile=await db.collection('colleagues').doc(user.uid).get(),byName=profile.data()?.name||'同仁';
  await db.runTransaction(async tx=>{
   const s=await tx.get(doc),c=m.assertRead(s.exists?s.data():null,user.uid);
   if(c.revision!==body.expectedRevision)throw m.fail(409,'有同仁剛更新這筆案件，請重新整理。');
   let patch={},type='',note='';
   if(body.op==='claim'){
    if(c.assigneeUid&&c.assigneeUid!==user.uid)throw m.fail(409,'這間已有負責同仁，請先與他確認。');
    patch={assigneeUid:user.uid,assigneeName:byName,status:'追蹤中'};type='接手追蹤';note=byName+' 已接手這間案件。';
   }else if(body.op==='revoke'){
    if(c.publisherUid!==user.uid)throw m.fail(403,'只有分享人可以撤回。');
    patch={archived:true,sharedWith:[c.publisherUid],assigneeUid:'',assigneeName:''};type='撤回分享';note='已撤回分享，歷程保留。';
   }else if(body.op==='progress'){
    if(c.publisherUid!==user.uid&&c.assigneeUid!==user.uid)throw m.fail(403,'請先認領案件，再更新追案進度。');
    if(!m.STATES.includes(body.status))throw m.fail(400,'追蹤狀態不正確。');
    patch={status:body.status,nextFollowOn:m.cleanDate(body.nextFollowOn)};type='更新進度';note='進度：'+body.status;
   }else if(body.op==='note'){
    if(c.publisherUid!==user.uid&&c.assigneeUid!==user.uid)throw m.fail(403,'只有分享人或承辦人可以寫入追案紀錄。');
    note=m.text(body.note,3000);if(!note)throw m.fail(400,'請先填寫處理情況。');
    if(!['追蹤紀錄','聯繫紀錄','寄信紀錄'].includes(body.type))throw m.fail(400,'紀錄類型不正確。');
    type=body.type;patch={lastActivityAt:time,...(type==='聯繫紀錄'?{lastContactAt:time}:{})};
   }else throw m.fail(400,'操作不正確。');
   tx.update(doc,{...patch,updatedAt:time,revision:c.revision+1});
   tx.set(doc.collection('activities').doc(),{type,note,byUid:user.uid,byName,at:time});
  });return {id};
 }
 async function directory(user){
  if(user.uid!==m.PUBLISHER_UID)throw m.fail(403,'只有分享人可設定分享名單。');
  const r=await db.collection('colleagues').get(),storage=await budget.get();
  const driveStorage=await drive.quota();
  return {driveStorage,colleagues:r.docs.map(s=>({id:s.id,name:m.text(s.data().name||s.data().email||'同仁',100)})),storage:{usedBytes:storage.data()?.usedBytes||0,reservedBytes:storage.data()?.reservedBytes||0,limit:m.LIBRARY_BYTES}};
 }
 return {preview,publish,list,detail,media,update,directory};
}
module.exports={createMarketCaseService};
