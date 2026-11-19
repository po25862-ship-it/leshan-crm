const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {execFile} = require('node:child_process');

const MAX_IMAGE_BYTES = 30 * 1024 * 1024;
let backupSequence=0;
function nativeCopy(source, destination, timeoutMs) {
  return new Promise((resolve, reject) => execFile('/bin/cp', ['-f', source, destination],
    {timeout: timeoutMs, killSignal: 'SIGKILL', maxBuffer: 64 * 1024}, (error, stdout, stderr) => {
      if (!error) return resolve();
      if (error.killed || error.signal === 'SIGKILL') error.code = 'ETIMEDOUT';
      error.detail = String(stderr || '').trim();reject(error);
    }));
}
function retryable(error) {
  return ['EAGAIN','EDEADLK','EBUSY','ETIMEDOUT','EIO'].includes(error.code)
    || [-11,-35].includes(error.errno)
    || /temporarily unavailable|deadlock|resource busy|timed? out|operation timed out/i.test(error.detail || error.message || '')
    || Boolean(error.cause&&error.cause!==error&&retryable(error.cause));
}

// Stage beside the cloud destination, then replace only after a complete copy.
// Writing directly over an evicted Drive file can fail with EAGAIN.
async function copySheetBackup(source,destination,{copy=nativeCopy,wait=ms=>new Promise(resolve=>setTimeout(resolve,ms)),timeoutMs=20000,attempts=3}={}){
  const temporary=`${destination}.partial-${process.pid}-${backupSequence++}`;
  for(let attempt=1;attempt<=attempts;attempt++){
    try{
      const before=fs.statSync(source);
      await copy(source,temporary,timeoutMs);
      const after=fs.statSync(source);
      if(fs.statSync(temporary).size!==before.size||after.size!==before.size||after.mtimeMs!==before.mtimeMs)throw Object.assign(new Error('備份尚未完整複製。'),{code:'EAGAIN'});
      fs.renameSync(temporary,destination);return;
    }catch(error){
      if(!retryable(error)||attempt===attempts)throw error;
      await wait(attempt*1000);
    }finally{try{fs.unlinkSync(temporary);}catch{}}
  }
}

// Copy through the macOS file provider first. Hashing, OCR and upload then use
// exactly the same local bytes, never an iCloud placeholder that can be evicted.
function createSheetFileReader({root = os.tmpdir(), copy = nativeCopy, wait = ms => new Promise(resolve => setTimeout(resolve,ms)), timeoutMs = 20000, attempts = 3, onProgress = () => {}} = {}) {
  fs.mkdirSync(root,{recursive:true});
  const directory = fs.mkdtempSync(path.join(root,'leshan-sheet-scan-'));
  const files = new Map();let sequence=0;
  async function prepare(source) {
    if (files.has(source)) return files.get(source);
    let last;const fileId=sequence++;
    for (let attempt = 1; attempt <= attempts; attempt++) {
      const destination = path.join(directory,`${fileId}-${attempt}${path.extname(source).toLowerCase()}`);
      onProgress({file:path.basename(source),attempt,phase:attempt===1?'preparing':'retrying'});
      try {
        // File Provider may update metadata during the first download. Retry
        // against a fresh snapshot so a now-stable file can be accepted.
        const stat = fs.statSync(source);
        if (!stat.isFile() || !stat.size || stat.size > MAX_IMAGE_BYTES) throw new Error('照片為空、不是一般檔案或超過 30MB，請確認原始照片。');
        await copy(source,destination,timeoutMs);
        const staged = fs.statSync(destination), after = fs.statSync(source);
        if (staged.size !== stat.size || after.size !== stat.size || after.mtimeMs !== stat.mtimeMs) throw Object.assign(new Error('照片仍在更新或下載中。'),{code:'EAGAIN'});
        const bytes = fs.readFileSync(destination);
        if (!bytes.length || bytes.length > MAX_IMAGE_BYTES) throw new Error('照片大小不正確。');
        files.set(source,destination);return destination;
      } catch (error) {
        last = error;try { fs.unlinkSync(destination); } catch {}
        if (!retryable(error) || attempt === attempts) break;
        await wait(attempt * 1000);
      }
    }
    const reason = retryable(last)?'雲端照片尚未完整取回或取回逾時':'照片無法讀取';
    throw Object.assign(new Error(`${reason}：${path.basename(source)}。請確認網路或將照片下載到本機後重試。`),{code:last?.code || 'SHEET_READ_FAILED',cause:last});
  }
  return {prepare,localPath:source=>files.get(source)||null,close:()=>fs.rmSync(directory,{recursive:true,force:true})};
}

function sheetScanResult(summary={}) {
  const unreadable = Number(summary.errors)||0, uploadFailed = Number(summary.actions?.failed)||0;
  const copyFailed = Number(summary.reviewQueue?.copyFailed)||0, duplicateFailed = Number(summary.duplicateCleanup?.failed)||0;
  const auxiliaryFailed = summary.rentalBackfill?.ok===false || summary.reviewQueue?.driveSynced===false;
  const ok = !unreadable && !uploadFailed && !copyFailed && !duplicateFailed && !auxiliaryFailed;
  const review = (Number(summary.review)||0)+(Number(summary.unmatched)||0);
  return {ok,partial:!ok,message:ok?`掃描完成：${summary.total||0} 張，成功配對 ${summary.matched||0} 張${review?`，另 ${review} 張待確認`:''}。`:`掃描未完整完成：${unreadable} 張讀取或辨識失敗、${uploadFailed} 張匯入失敗${copyFailed?`、${copyFailed} 張待確認照片複製失敗`:''}${auxiliaryFailed?'；備份或租金租期補入尚未完成':''}。原始檔案保留，可重新掃描。`};
}
function reconcileSheetStatus(status,report){
  if(!status||!report?.summary)return status;
  const difference=Math.abs(Date.parse(status.finishedAt)-Date.parse(report.generatedAt));
  if(!Number.isFinite(difference)||difference>120000)return status;
  const outcome=sheetScanResult(report.summary);
  return {...status,...(status.ok===false&&outcome.ok?{}:outcome),ok:status.ok!==false&&outcome.ok,summary:compactSheetSummary(report.summary)};
}
function compactSheetSummary(summary={}){return {total:summary.total||0,matched:summary.matched||0,review:summary.review||0,unmatched:summary.unmatched||0,errors:summary.errors||0,uploaded:summary.actions?.firebaseUploaded||0,alreadyProcessed:summary.actions?.alreadyProcessed||0};}
module.exports = {createSheetFileReader,copySheetBackup,nativeCopy,retryable,sheetScanResult,reconcileSheetStatus,compactSheetSummary,MAX_IMAGE_BYTES};
