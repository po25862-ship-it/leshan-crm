#!/usr/bin/env node

const fs = require("fs");
const os = require("os");
const path = require("path");
const crypto = require("crypto");
const { execFileSync } = require("child_process");

const appDir = __dirname;
const configDir = path.join(os.homedir(), ".leshan-property-sync");
const sourceDirFlag = process.argv.includes("--source-dir") ? process.argv[process.argv.indexOf("--source-dir") + 1] : "";
const legacySourceDir = process.argv.slice(2).find((arg, index, all) => !arg.startsWith("--") && all[index - 1] !== "--only-file") || "";
const sourceDir = path.resolve(sourceDirFlag || legacySourceDir || process.env.LESHAN_SHEET_SOURCE || path.join(appDir, "..", "物件資料"));
const reportFile = path.join(configDir, "物件資料配對報告.json");
const ocrCacheDir = path.join(configDir, "sheet-ocr-cache");
const ocrSource = path.join(appDir, "ocr.m");
const ocrBinary = path.join(configDir, "leshan-sheet-ocr");
const applyMode = process.argv.includes("--apply");
const onlyFile = process.argv.includes("--only-file") ? process.argv[process.argv.indexOf("--only-file") + 1] : "";
const manifestFile = path.join(configDir, "sheet-import-manifest.json");

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
  const result = JSON.parse(execFileSync(ocrBinary, [file], { encoding: "utf8", maxBuffer: 8 * 1024 * 1024 }));
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

async function applyMatched(results, context) {
  const manifest = loadManifest();
  const driveRoot = archiveRoot();
  fs.mkdirSync(driveRoot, { recursive: true });
  const byId = new Map(context.properties.map((item) => [item.id, item]));
  const counts = { firebaseUploaded: 0, driveArchived: 0, alreadyProcessed: 0, failed: 0 };

  for (const result of results.filter((item) => item.status === "matched" && (!onlyFile || item.file === onlyFile))) {
    const property = byId.get(result.propertyId);
    if (!property) continue;
    if (manifest.files[result.hash]?.propertyId === property.id) {
      result.action = "alreadyProcessed";
      counts.alreadyProcessed += 1;
      continue;
    }
    const source = path.join(sourceDir, result.file);
    try {
      if (result.websitePublished) {
        const objectPath = `properties/${property.id}/sheets/${result.hash.slice(0, 16)}_${safeName(result.file)}`;
        const storageRef = context.storageModule.ref(context.storage, objectPath);
        await context.storageModule.uploadBytes(storageRef, new Uint8Array(fs.readFileSync(source)), {
          contentType: mimeType(result.file), customMetadata: { sha256: result.hash, listingNo: property.listingNo || "" },
        });
        const url = await context.storageModule.getDownloadURL(storageRef);
        const sheetFiles = [...(property.sheetFiles || [])];
        if (!sheetFiles.some((item) => item.sha256 === result.hash)) {
          sheetFiles.push({ url, name: result.file, type: mimeType(result.file), sha256: result.hash, storageKind: "firebase" });
          await context.firestore.updateDoc(context.firestore.doc(context.db, "properties", property.id), { sheetFiles });
          property.sheetFiles = sheetFiles;
        }
        result.action = "firebaseUploaded";
        counts.firebaseUploaded += 1;
        manifest.files[result.hash] = { propertyId: property.id, listingNo: property.listingNo, destination: "firebase", objectPath, processedAt: new Date().toISOString() };
      } else {
        const propertyDir = path.join(driveRoot, property.listingNo || property.id);
        fs.mkdirSync(propertyDir, { recursive: true });
        const destination = path.join(propertyDir, safeName(result.file));
        if (!fs.existsSync(destination) || hashFile(destination) !== result.hash) fs.copyFileSync(source, destination);
        const relativePath = path.relative(driveRoot, destination);
        const archivedSheetFiles = [...(property.archivedSheetFiles || [])];
        if (!archivedSheetFiles.some((item) => item.sha256 === result.hash)) {
          archivedSheetFiles.push({ name: result.file, type: mimeType(result.file), sha256: result.hash, storageKind: "googleDrive", relativePath, archivedAt: new Date().toISOString() });
          await context.firestore.updateDoc(context.firestore.doc(context.db, "properties", property.id), { archivedSheetFiles });
          property.archivedSheetFiles = archivedSheetFiles;
        }
        result.action = "driveArchived";
        counts.driveArchived += 1;
        manifest.files[result.hash] = { propertyId: property.id, listingNo: property.listingNo, destination: "googleDrive", relativePath, processedAt: new Date().toISOString() };
      }
      fs.writeFileSync(manifestFile, `${JSON.stringify(manifest, null, 2)}\n`, { mode: 0o600 });
    } catch (error) {
      result.action = "failed";
      result.actionError = error.message;
      counts.failed += 1;
    }
  }
  return counts;
}

async function main() {
  if (!fs.existsSync(sourceDir)) throw new Error(`找不到物件資料夾：${sourceDir}`);
  ensureOcrBinary();
  const files = fs.readdirSync(sourceDir).filter((name) => /\.(?:jpe?g|png|heic)$/i.test(name)).sort();
  const context = await loadProperties();
  const properties = context.properties;
  const results = [];
  let cursor = 0;
  const worker = async () => {
    while (cursor < files.length) {
      const index = cursor++;
      const name = files[index];
      const file = path.join(sourceDir, name);
      try {
        const hash = hashFile(file);
        const fields = extractFields(recognize(file, hash));
        results[index] = { file: name, hash, recognized: fields, ...matchProperty(fields, properties) };
      } catch (error) {
        results[index] = { file: name, status: "error", error: error.message };
      }
      const done = results.filter(Boolean).length;
      if (done % 10 === 0 || done === files.length) console.log(`辨識 ${done}/${files.length}`);
    }
  };
  await Promise.all([worker(), worker()]);
  const summary = {
    total: results.length,
    matched: results.filter((item) => item.status === "matched").length,
    review: results.filter((item) => item.status === "review").length,
    unmatched: results.filter((item) => item.status === "unmatched").length,
    errors: results.filter((item) => item.status === "error").length,
  };
  if (applyMode) summary.actions = await applyMatched(results, context);
  await context.close?.();
  const report = { generatedAt: new Date().toISOString(), sourceDir, applyMode, summary, results };
  fs.writeFileSync(reportFile, `${JSON.stringify(report, null, 2)}\n`);
  console.log(JSON.stringify({ reportFile, summary }, null, 2));
}

main().catch((error) => { console.error(error.stack || error.message); process.exit(1); });
