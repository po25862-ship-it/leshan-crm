#!/usr/bin/env node

const fs = require("fs");
const os = require("os");
const path = require("path");
const crypto = require("crypto");
const { execFileSync } = require("child_process");

const { cachedPropertySheetPrice } = require(fs.existsSync(path.join(__dirname,"property-sheet-price.cjs")) ? "./property-sheet-price.cjs" : "../scripts/property-sheet-price.cjs");
const { validPriceMark } = require(fs.existsSync(path.join(__dirname,"propertySheetPrice.js")) ? "./propertySheetPrice.js" : "../src/lib/propertySheetPrice.js");
const {createSheetFileReader,copySheetBackup,sheetScanResult,retryable}=require("./sheet-file-reader");

const appDir = __dirname;
const configDir = path.join(os.homedir(), ".leshan-property-sync");
const sourceDirFlag = process.argv.includes("--source-dir") ? process.argv[process.argv.indexOf("--source-dir") + 1] : "";
const legacySourceDir = process.argv.slice(2).find((arg, index, all) => !arg.startsWith("--") && all[index - 1] !== "--only-file") || "";
const sourceCandidates = [
  sourceDirFlag,
  legacySourceDir,
  process.env.LESHAN_SHEET_SOURCE,
  path.join(appDir, "..", "物件資料"),
  path.join(os.homedir(), "Desktop", "liu ai", "客戶管理", "物件資料"),
].filter(Boolean).map((item) => path.resolve(item));
const sourceDir = sourceCandidates.find((item) => fs.existsSync(item)) || sourceCandidates[0];
const reportFile = process.argv.includes("--report-file") ? path.resolve(process.argv[process.argv.indexOf("--report-file")+1]) : path.join(configDir, "物件資料配對報告.json");
const ocrCacheDir = path.join(configDir, "sheet-ocr-cache");
const ocrSource = path.join(appDir, "ocr.m");
const ocrBinary = path.join(configDir, "leshan-sheet-ocr");
const applyMode = process.argv.includes("--apply");
const onlyFile = process.argv.includes("--only-file") ? process.argv[process.argv.indexOf("--only-file") + 1] : "";
const manifestFile = path.join(configDir, "sheet-import-manifest.json");
let reader=null;
const progressFile=path.join(configDir,"sheet-scan-progress.json");
let progress={pid:process.pid,startedAt:new Date().toISOString(),processed:0,total:0,phase:"preparing"};
function writeProgress(patch){progress={...progress,...patch,updatedAt:new Date().toISOString()};const temporary=progressFile+".tmp-"+process.pid;fs.writeFileSync(temporary,JSON.stringify(progress),{mode:0o600});fs.renameSync(temporary,progressFile);}
const imagePath=name=>reader?.localPath(path.join(sourceDir,name))||path.join(sourceDir,name);


const FIREBASE_CONFIG = {
  apiKey: "AIzaSyDiGtIemWS0C4Pb-fNFBjDnoa2Z6ETwics",
  authDomain: "leshan-crm.firebaseapp.com",
  projectId: "leshan-crm",
  storageBucket: "leshan-crm.firebasestorage.app",
  messagingSenderId: "67951666720",
  appId: "1:67951666720:web:8c1fe1efd8579f155a3e45",
};

function keychainPassword(service, account) {
  return execFileSync("security", ["find-generic-password", "-s", service, "-a", account, "-w"], { encoding: "utf8" }).trim();
}

function ensureOcrBinary() {
  fs.mkdirSync(configDir, { recursive: true });
  const needsBuild = !fs.existsSync(ocrBinary) || fs.statSync(ocrSource).mtimeMs > fs.statSync(ocrBinary).mtimeMs;
  if (!needsBuild) return;
  const cache = path.join(configDir, "clang-module-cache");
  fs.mkdirSync(cache, { recursive: true });
  execFileSync("xcrun", ["clang", "-fobjc-arc", "-framework", "Foundation", "-framework", "AppKit", "-framework", "Vision", ocrSource, "-o", ocrBinary], {
    stdio: "inherit", env: { ...process.env, CLANG_MODULE_CACHE_PATH: cache },
  });
  fs.chmodSync(ocrBinary, 0o700);
}

function hashFile(file) {
  return crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");
}

function recognize(file, hash) {
  fs.mkdirSync(ocrCacheDir, { recursive: true });
  const cacheFile = path.join(ocrCacheDir, `${hash}.json`);
  if (fs.existsSync(cacheFile)) return JSON.parse(fs.readFileSync(cacheFile, "utf8"));
  const result = JSON.parse(execFileSync(ocrBinary, [file], { encoding: "utf8", timeout: 45000, maxBuffer: 8 * 1024 * 1024 }));
  fs.writeFileSync(cacheFile, `${JSON.stringify(result)}\n`, { mode: 0o600 });
  return result;
}

function compact(value) {
  return String(value || "").toUpperCase().replace(/[^A-Z0-9\u4e00-\u9fff]/g, "");
}

function codeParts(value) {
  const normalized = compact(value);
  const match = normalized.match(/^([A-Z]{0,3})(\d{6,10})$/);
  return match ? { prefix: match[1], digits: match[2] } : null;
}

function extractFields(lines) {
  const texts = lines.map((item) => item.text.trim()).filter(Boolean);
  const joined = texts.join("\n");
  const codeMatch = joined.match(/(?:編號|NO)\s*[:：]?\s*([A-Z]{0,3}\s*\d{6,10})/i);
  const titleLine = texts.find((text) => /案名\s*[:：]/.test(text)) || "";
  const addressLine = texts.find((text) => /地址\s*[:：]/.test(text)) || "";
  return {
    code: compact(codeMatch?.[1] || ""),
    title: titleLine.replace(/^.*?案名\s*[:：]\s*/, "").replace(/編號\s*[:：].*$/, "").trim(),
    address: addressLine.replace(/^.*?地址\s*[:：]\s*/, "").replace(/電話\s*[:：].*$/, "").trim(),
  };
}

function scoreProperty(fields, property) {
  const found = codeParts(fields.code);
  const actual = codeParts(property.listingNo);
  let score = 0;
  const reasons = [];
  if (found && actual) {
    if (found.prefix && found.prefix === actual.prefix && found.digits === actual.digits) {
      score = 100; reasons.push("完整編號");
    } else if (found.prefix && found.prefix === actual.prefix && found.digits.replace(/^0+/, "") === actual.digits.replace(/^0+/, "")) {
      score = 98; reasons.push("編號補零");
    } else if ((!found.prefix || found.prefix === actual.prefix) && actual.digits.replace(/^0+/, "").endsWith(found.digits.replace(/^0+/, ""))) {
      score = 88; reasons.push("編號尾碼");
    }
  }
  const imageTitle = compact(fields.title);
  const propertyTitle = compact(property.title);
  if (imageTitle && propertyTitle && (imageTitle.includes(propertyTitle) || propertyTitle.includes(imageTitle))) {
    score += score ? 8 : 78; reasons.push("案名");
  }
  const imageAddress = compact(fields.address);
  const propertyAddress = compact(property.address);
  if (imageAddress && propertyAddress && (imageAddress.includes(propertyAddress) || propertyAddress.includes(imageAddress))) {
    score += score ? 4 : 65; reasons.push("地址");
  }
  return { score: Math.min(score, 100), reasons };
}

function matchProperty(fields, properties) {
  const ranked = properties.map((property) => ({ property, ...scoreProperty(fields, property) }))
    .filter((item) => item.score > 0).sort((a, b) => b.score - a.score);
  const best = ranked[0];
  const second = ranked[1];
  if (!best) return { status: "unmatched", score: 0 };
  const safe = best.score >= 90 || (best.score >= 78 && best.score - (second?.score || 0) >= 20);
  return {
    status: safe ? "matched" : "review",
    score: best.score,
    reasons: best.reasons,
    propertyId: best.property.id,
    listingNo: best.property.listingNo,
    propertyTitle: best.property.title,
    websitePublished: best.property.websitePublished === true,
    secondScore: second?.score || 0,
  };
}

async function loadProperties() {
  const [{ initializeApp, deleteApp }, { getAuth, signInWithEmailAndPassword }, firestore, storageModule] = await Promise.all([
    import("firebase/app"), import("firebase/auth"), import("firebase/firestore"),
    import("firebase/storage"),
  ]);
  const app = initializeApp(FIREBASE_CONFIG, `sheet-import-${Date.now()}`);
  try {
    const email = keychainPassword("leshan-property-sync-email", "crm");
    const password = keychainPassword("leshan-property-sync-password", email);
    await signInWithEmailAndPassword(getAuth(app), email, password);
    const db = firestore.getFirestore(app);
    const snapshot = await firestore.getDocs(firestore.collection(db, "properties"));
    return {
      app, db, firestore, storageModule,
      storage: storageModule.getStorage(app),
      properties: snapshot.docs.map((item) => ({ id: item.id, ...item.data() })),
      close: () => deleteApp(app).catch(() => {}),
    };
  } finally {
    if (!applyMode) await deleteApp(app).catch(() => {});
  }
}

function loadManifest() {
  try { return JSON.parse(fs.readFileSync(manifestFile, "utf8")); }
  catch { return { version: 1, files: {} }; }
}

function archiveRoot() {
  if (process.env.LESHAN_SHEET_ARCHIVE) return path.resolve(process.env.LESHAN_SHEET_ARCHIVE);
  const config = JSON.parse(fs.readFileSync(path.join(configDir, "config.json"), "utf8"));
  return path.join(path.dirname(config.outputRoot), "物件資料封存");
}

function mimeType(name) {
  if (/\.png$/i.test(name)) return "image/png";
  if (/\.heic$/i.test(name)) return "image/heic";
  return "image/jpeg";
}

function safeName(name) {
  return name.replace(/[^\w.\-\u4e00-\u9fff]/g, "_");
}

function duplicateTrashPath(name) {
  const trashDir = path.join(os.homedir(), ".Trash");
  fs.mkdirSync(trashDir, { recursive: true });
  const extension = path.extname(name);
  const stem = path.basename(name, extension);
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  let destination = path.join(trashDir, `${stem}（樂善重複-${timestamp}）${extension}`);
  let suffix = 2;
  while (fs.existsSync(destination)) {
    destination = path.join(trashDir, `${stem}（樂善重複-${timestamp}-${suffix}）${extension}`);
    suffix += 1;
  }
  return destination;
}

function cleanupDuplicateSourceFiles(results) {
  const groups = new Map();
  for (const result of results) {
    if (!result.hash || !result.file) continue;
    const files = groups.get(result.hash) || [];
    files.push(result.file);
    groups.set(result.hash, files);
  }

  const summary = { duplicateGroups: 0, movedToTrash: 0, failed: 0 };
  for (const files of groups.values()) {
    if (files.length < 2) continue;
    summary.duplicateGroups += 1;
    // 優先保留檔名最短的原始檔，例如保留 photo.jpg、清掉 photo (1).jpg。
    files.sort((left, right) => left.length - right.length || left.localeCompare(right, "zh-Hant"));
    for (const name of files.slice(1)) {
      const source = path.join(sourceDir, name);
      if (!fs.existsSync(source)) continue;
      try {
        fs.renameSync(source, duplicateTrashPath(name));
        summary.movedToTrash += 1;
      } catch (error) {
        summary.failed += 1;
        console.error(`重複照片移至垃圾桶失敗（${name}）：${error.message}`);
      }
    }
  }
  return summary;
}

async function saveExistingPriceMark(property, hash, priceMark, context) {
  if (!priceMark || !(property.sheetFiles || []).some((file) => file.sha256 === hash && !validPriceMark(file.priceMark))) return;
  const reference = context.firestore.doc(context.db, "properties", property.id);
  await context.firestore.runTransaction(context.db, async (transaction) => {
    const snapshot = await transaction.get(reference);
    if (!snapshot.exists()) return;
    const files = snapshot.data().sheetFiles || [];
    const next = files.map((file) => file.sha256 === hash && !validPriceMark(file.priceMark) ? { ...file, priceMark } : file);
    transaction.update(reference, { sheetFiles: next });
    property.sheetFiles = next;
  });
}

async function applyMatched(results, context) {
  const manifest = loadManifest();
  const byId = new Map(context.properties.map((item) => [item.id, item]));
  const counts = { firebaseUploaded: 0, driveArchived: 0, alreadyProcessed: 0, failed: 0 };

  for (const result of results.filter((item) => item.status === "matched" && (!onlyFile || item.file === onlyFile))) {
    const property = byId.get(result.propertyId);
    if (!property) continue;
    const knownFile = (property.sheetFiles || []).find((file) => file.sha256 === result.hash);
    let priceMark = validPriceMark(knownFile?.priceMark);
    if (!priceMark) {
      try { priceMark = cachedPropertySheetPrice(imagePath(result.file), recognize(imagePath(result.file), result.hash), result.hash, path.join(configDir, "sheet-price-cache")); }
      catch { /* Unrecognized sources use a separate latest-price header. */ }
    }
    const existing = manifest.files[result.hash];
    if (existing?.propertyId === property.id && (existing.destination === "firebase" || (existing.destination === "googleDrive" && !onlyFile))) {
      try { await saveExistingPriceMark(property, result.hash, priceMark, context); }
      catch { /* Optional position metadata must not interrupt the regular sync. */ }
      result.action = "alreadyProcessed";
      counts.alreadyProcessed += 1;
      continue;
    }
    const source = imagePath(result.file);
    try {
      const objectPath = `properties/${property.id}/sheets/${result.hash.slice(0, 16)}_${safeName(result.file)}`;
      const storageRef = context.storageModule.ref(context.storage, objectPath);
      await context.storageModule.uploadBytes(storageRef, new Uint8Array(fs.readFileSync(source)), {
        contentType: mimeType(result.file), customMetadata: { sha256: result.hash, listingNo: property.listingNo || "" },
      });
      const url = await context.storageModule.getDownloadURL(storageRef);
      const sheetFiles = [...(property.sheetFiles || [])];
      if (!sheetFiles.some((item) => item.sha256 === result.hash)) {
        sheetFiles.push({ url, name: result.file, type: mimeType(result.file), sha256: result.hash, storageKind: "firebase", ...(priceMark ? { priceMark } : {}) });
        await context.firestore.updateDoc(context.firestore.doc(context.db, "properties", property.id), { sheetFiles });
        property.sheetFiles = sheetFiles;
      }
      result.action = "firebaseUploaded";
      counts.firebaseUploaded += 1;
      manifest.files[result.hash] = { propertyId: property.id, listingNo: property.listingNo, destination: "firebase", objectPath, processedAt: new Date().toISOString() };
      fs.writeFileSync(manifestFile, `${JSON.stringify(manifest, null, 2)}\n`, { mode: 0o600 });
    } catch (error) {
      result.action = "failed";
      result.actionError = error.message;
      counts.failed += 1;
    }
  }
  return counts;
}

function csvCell(value) {
  const text = String(value ?? "");
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function copyCloudFile(source, destination) {
  const temporary = `${destination}.partial-${process.pid}`;
  try {
    try {
      fs.copyFileSync(source, temporary);
    } catch {
      // macOS 的雲端占位檔有時會讓 Node 回傳 EAGAIN；系統 cp 會觸發檔案下載並等待完成。
      execFileSync("/bin/cp", ["-f", source, temporary], { stdio: "ignore", timeout: 90_000 });
    }
    fs.renameSync(temporary, destination);
  } finally {
    try { fs.unlinkSync(temporary); } catch { /* 沒有殘留檔案 */ }
  }
}

async function writeReviewQueue(results) {
  const pending = results.filter((item) => item.status !== "matched");
  const queueDir = path.join(configDir, "待確認");
  const driveQueueDir = path.join(archiveRoot(), "待確認");
  const copyErrors = [];
  let copiedFiles = 0;
  fs.mkdirSync(queueDir, { recursive: true });
  for (const item of pending) {
    const source = reader?.localPath(path.join(sourceDir,item.file));
    if(!source){item.queueCopyError="照片尚未取回，原檔保留待重試。";continue;}
    const destination = path.join(queueDir, safeName(item.file));
    if (!fs.existsSync(source) || fs.existsSync(destination)) continue;
    try {
      copyCloudFile(source, destination);
      copiedFiles += 1;
    } catch (error) {
      item.queueCopyError = error.message;
      copyErrors.push({ file: item.file, error: error.message });
      console.error(`待確認照片暫時無法取回（${item.file}）：${error.message}`);
    }
  }
  const header = ["狀態", "檔名", "辨識編號", "辨識案名", "建議物件編號", "建議物件案名", "配對分數"];
  const rows = pending.map((item) => [item.status, item.file, item.recognized?.code, item.recognized?.title, item.listingNo, item.propertyTitle, item.score]);
  const csv = [header, ...rows].map((row) => row.map(csvCell).join(",")).join("\n");
  const localCsv = path.join(queueDir, "待確認清單.csv");
  fs.writeFileSync(localCsv, `\uFEFF${csv}\n`);
  try {
    fs.mkdirSync(driveQueueDir, { recursive: true });
    await copySheetBackup(localCsv, path.join(driveQueueDir, "待確認清單.csv"));
    return { files: pending.length, copiedFiles, copyFailed: copyErrors.length, copyErrors, queueDir, driveQueueDir, driveSynced: true };
  } catch (error) {
    console.error(`Google Drive 待確認清單備份失敗（本機清單已保留）：${error.message}`);
    return { files: pending.length, copiedFiles, copyFailed: copyErrors.length, copyErrors, queueDir, driveQueueDir, driveSynced: false, driveError: error.message };
  }
}

async function main() {
  if (!fs.existsSync(sourceDir)) throw new Error(`找不到物件資料夾：${sourceDir}`);
  if(onlyFile&&path.basename(onlyFile)!==onlyFile)throw new Error("請選擇資料夾內的單一照片檔名。");
  ensureOcrBinary();
  const files = fs.readdirSync(sourceDir).filter(name => /\.(?:jpe?g|png|heic)$/i.test(name)&&(!onlyFile||name===onlyFile)).sort();
  if(!files.length)throw new Error("找不到可掃描的照片；請確認資料夾或檔名。");
  writeProgress({total:files.length});
  reader=createSheetFileReader({onProgress:update=>writeProgress(update)});
  let context;
  try {
    context = await loadProperties();
    const properties = context.properties,results=[];
    let cursor=0,consecutiveReadFailures=0;
    const worker=async()=>{
      while(cursor<files.length){
        const index=cursor++,name=files[index];
        try{
          if(consecutiveReadFailures>=3)throw new Error("雲端照片連續取回失敗，本次保留待重試。請確認網路後重新掃描。");
          let file;
          try{file=await reader.prepare(path.join(sourceDir,name));consecutiveReadFailures=0;}catch(error){consecutiveReadFailures=retryable(error)?consecutiveReadFailures+1:0;throw error;}
          writeProgress({phase:"ocr",file:name});
          const hash=hashFile(file),fields=extractFields(recognize(file,hash));
          results[index]={file:name,hash,recognized:fields,...matchProperty(fields,properties)};
        }catch(error){results[index]={file:name,status:"error",error:error.message};}
        const done=results.filter(Boolean).length;
        writeProgress({processed:done});
        if(done%10===0||done===files.length)console.log(`辨識 ${done}/${files.length}`);
      }
    };
    await Promise.all([worker(),worker()]);
    const summary={total:results.length,matched:results.filter(i=>i.status==="matched").length,review:results.filter(i=>i.status==="review").length,unmatched:results.filter(i=>i.status==="unmatched").length,errors:results.filter(i=>i.status==="error").length};
    if(applyMode){
      writeProgress({phase:"uploading",file:""});
      summary.actions=await applyMatched(results,context);
      summary.reviewQueue=await writeReviewQueue(results);
      summary.duplicateCleanup=summary.errors||onlyFile||process.argv.includes("--skip-duplicate-cleanup")?{duplicateGroups:0,movedToTrash:0,failed:0,skipped:true}:cleanupDuplicateSourceFiles(results);
      if(!summary.errors){
        try{
          await new Promise((resolve,reject)=>{
            const child=require("child_process").spawn(process.execPath,[path.join(appDir,"rental-backfill.js"),"--apply"],{cwd:appDir,env:process.env,stdio:"inherit"});
            child.on("error",reject);child.on("close",code=>code===0?resolve():reject(new Error(`租金租期辨識結束代碼 ${code}`)));
          });summary.rentalBackfill={ok:true};
        }catch(error){summary.rentalBackfill={ok:false,error:error.message};console.error(`租金租期補入尚未完成：${error.message}`);}
      }else summary.rentalBackfill={ok:false,error:"照片尚未完整取回，保留下次補入。"};
    }
    const outcome=sheetScanResult(summary),report={runPid:process.pid,generatedAt:new Date().toISOString(),sourceDir,applyMode,summary,results};
    fs.writeFileSync(reportFile,JSON.stringify(report,null,2)+"\n",{mode:0o600});
    writeProgress({phase:outcome.ok?"done":"partial",message:outcome.message});
    console.log(JSON.stringify({reportFile,summary},null,2));console.log(outcome.message);
    if(!outcome.ok)process.exitCode=2;
  }finally{await context?.close?.();reader.close();}
}

main().catch(error=>{try{writeProgress({phase:"failed",message:error.message});}catch{}console.error(error.stack||error.message);process.exitCode=1;});
