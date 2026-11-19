const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {createSheetFileReader,copySheetBackup,retryable,sheetScanResult,reconcileSheetStatus}=require('./sheet-file-reader');
function fixture(){const root=fs.mkdtempSync(path.join(os.tmpdir(),'leshan-sheet-test-')),source=path.join(root,'照片.jpg');fs.writeFileSync(source,'original bytes');return {root,source,close:()=>fs.rmSync(root,{recursive:true,force:true})};}
test('cloud files retry transient failures and subsequent consumers reuse the same local bytes',async()=>{
 const f=fixture(),progress=[];let calls=0;const reader=createSheetFileReader({root:f.root,wait:async()=>{},onProgress:p=>progress.push(p),copy:async(s,d)=>{if(++calls===1)throw Object.assign(new Error('cloud busy'),{errno:-11});fs.copyFileSync(s,d);}});
 try {const local=await reader.prepare(f.source);assert.equal(fs.readFileSync(local,'utf8'),'original bytes');assert.equal(await reader.prepare(f.source),local);assert.equal(calls,2);assert.equal(progress[1].phase,'retrying');assert.equal(fs.readFileSync(f.source,'utf8'),'original bytes');reader.close();assert.equal(fs.existsSync(local),false);}finally{f.close();}
});
test('timeouts are bounded and permission failures do not loop or remove the original',async()=>{
 for(const code of ['ETIMEDOUT','EACCES']){const f=fixture();let calls=0;const reader=createSheetFileReader({root:f.root,wait:async()=>{},copy:async()=>{calls++;throw Object.assign(new Error('failed'),{code});}});try{await assert.rejects(reader.prepare(f.source),/照片/);assert.equal(calls,code==='ETIMEDOUT'?3:1);assert.equal(fs.readFileSync(f.source,'utf8'),'original bytes');}finally{reader.close();f.close();}}
});
test('incomplete native copies are rejected and retried rather than uploaded',async()=>{
 const f=fixture();let calls=0;const reader=createSheetFileReader({root:f.root,wait:async()=>{},copy:async(s,d)=>{calls++;fs.writeFileSync(d,'partial');}});try{await assert.rejects(reader.prepare(f.source),/雲端照片/);assert.equal(calls,3);assert.equal(reader.localPath(f.source),null);}finally{reader.close();f.close();}
});
test('native copy stderr remains retryable after wrapping so offline scan protection can stop a batch',async()=>{
 const f=fixture();const reader=createSheetFileReader({root:f.root,attempts:1,copy:async()=>{throw Object.assign(new Error('cp exited 1'),{code:1,detail:'Resource deadlock avoided'});}});
 try{await assert.rejects(reader.prepare(f.source),error=>retryable(error));assert.equal(fs.readFileSync(f.source,'utf8'),'original bytes');}finally{reader.close();f.close();}
});
test('a source updated during cloud retrieval is retried against its new stable metadata',async()=>{
 const f=fixture();let calls=0;const reader=createSheetFileReader({root:f.root,wait:async()=>{},copy:async(s,d)=>{if(++calls===1)fs.writeFileSync(s,'the fully downloaded image');fs.copyFileSync(s,d);}});
 try{const local=await reader.prepare(f.source);assert.equal(calls,2);assert.equal(fs.readFileSync(local,'utf8'),'the fully downloaded image');}finally{reader.close();f.close();}
});
test('partial scan failures cannot be reported as success while ambiguous matches remain normal review work',()=>{
 assert.equal(sheetScanResult({total:332,matched:141,errors:169,actions:{failed:0}}).ok,false);
 assert.equal(sheetScanResult({errors:0,actions:{failed:1}}).ok,false);
 assert.equal(sheetScanResult({errors:0,reviewQueue:{copyFailed:2}}).ok,false);
 assert.equal(sheetScanResult({errors:0,rentalBackfill:{ok:false}}).ok,false);
 const reviewed=sheetScanResult({total:332,matched:310,review:18,unmatched:4,errors:0});assert.equal(reviewed.ok,true);assert.match(reviewed.message,/22 張待確認/);
});
test('two concurrent downloads cannot overwrite each other\'s staged bytes',async()=>{
 const f=fixture(),other=path.join(f.root,'另一張照片.jpg');fs.writeFileSync(other,'second image bytes');
 const reader=createSheetFileReader({root:f.root,copy:async(s,d)=>{await new Promise(resolve=>setImmediate(resolve));fs.copyFileSync(s,d);}});
 try{const [a,b]=await Promise.all([reader.prepare(f.source),reader.prepare(other)]);assert.notEqual(a,b);assert.equal(fs.readFileSync(a,'utf8'),'original bytes');assert.equal(fs.readFileSync(b,'utf8'),'second image bytes');}finally{reader.close();f.close();}
});
test('legacy successful process exits are corrected when the matching report has failed photos',()=>{
 const status={ok:true,finishedAt:'2026-11-19T01:56:39.503Z'},report={generatedAt:'2026-11-19T01:56:39.483Z',summary:{total:332,errors:169}};
 const corrected=reconcileSheetStatus(status,report);assert.equal(corrected.ok,false);assert.equal(corrected.summary.errors,169);assert.match(corrected.message,/169 張/);
 assert.deepEqual(reconcileSheetStatus(status,{...report,generatedAt:'2026-11-18T01:00:00Z'}),status);
 const failedBackup={...status,ok:false,partial:true,message:'掃描紀錄備份未完成，本機紀錄已保留。'};
 assert.equal(reconcileSheetStatus(failedBackup,{...report,summary:{total:332,errors:0}}).message,failedBackup.message);
});
test('cloud backups preserve the previous file on failure and replace it after a complete retry',async()=>{
 const f=fixture(),destination=path.join(f.root,'舊備份.csv');fs.writeFileSync(destination,'previous backup');let calls=0;
 try{
  await assert.rejects(copySheetBackup(f.source,destination,{attempts:1,copy:async(s,d)=>{fs.writeFileSync(d,'partial');throw Object.assign(new Error('busy'),{code:'EAGAIN'});}}));
  assert.equal(fs.readFileSync(destination,'utf8'),'previous backup');assert.equal(fs.readdirSync(f.root).some(n=>n.includes('.partial-')),false);
  await copySheetBackup(f.source,destination,{wait:async()=>{},copy:async(s,d)=>{if(++calls===1)throw Object.assign(new Error('busy'),{code:'EAGAIN'});fs.copyFileSync(s,d);}});
  assert.equal(calls,2);assert.equal(fs.readFileSync(destination,'utf8'),'original bytes');assert.equal(fs.readFileSync(f.source,'utf8'),'original bytes');
 }finally{f.close();}
});
