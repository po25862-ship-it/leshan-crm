#!/usr/bin/env node

const fs = require("fs");
const path = require("path");
const os = require("os");
const { spawn } = require("child_process");
const XLSX = require("xlsx");
const iconv = require("iconv-lite");
const ExcelJS = require("exceljs");
const { decode } = require("html-entities");
const { execFileSync } = require("child_process");

const STORES = [
  { code: "D5", name: "長庚直營店" },
  { code: "DA", name: "長庚捷運直營店" },
  { code: "DD", name: "文青捷運直營店" },
  { code: "DE", name: "捷運樂善直營店" },
];
const CATEGORIES = [
  { code: "1", name: "公寓" }, { code: "2", name: "電梯大樓" },
  { code: "3", name: "套房" }, { code: "4", name: "別墅" },
  { code: "5", name: "透天厝" }, { code: "6", name: "建地" },
  { code: "7", name: "車位" }, { code: "8", name: "店面" },
  { code: "9", name: "工廠" }, { code: "10", name: "辦公" },
  { code: "11", name: "建物類其他" }, { code: "13", name: "工業地" },
  { code: "14", name: "農地" }, { code: "15", name: "農舍" },
  { code: "16", name: "廠辦" }, { code: "22", name: "土地類其他" },
];
const HEADER = ["店名", "委託書編號", "案名", "地址", "地坪", "權狀坪", "樓別", "座向", "屋齡", "格局", "車位", "總價(萬)", "空／自", "巷寬", "開發姓名", "官網點閱網址", "詳細資料表", "備註"];

function argValue(name, fallback = "") {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : fallback;
}
const assumeOrdered = process.argv.includes("--assume-ordered");
const sourceDirArg = argValue("--source-dir");
const officialStatusDirArg = argValue("--official-status-dir");
const backendCookieFile = process.env.LESHAN_BACKEND_COOKIE_FILE || path.join(os.homedir(), ".leshan-property-sync", "nh3-session-cookies.txt");
const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Taipei" }).format(new Date());
const defaultOutputDir = process.env.LESHAN_SYNC_OUTPUT_ROOT
  ? path.join(process.env.LESHAN_SYNC_OUTPUT_ROOT, today)
  : path.join(process.cwd(), "output", today);
const outputDir = path.resolve(argValue("--output-dir", defaultOutputDir));
const reportDir = path.join(outputDir, "raw-64");
const snapshotFile = path.join(outputDir, "snapshot.json");
const previousFile = argValue("--previous", path.join(path.dirname(outputDir), "latest-snapshot.json"));
const applyCrm = process.argv.includes("--apply-crm");

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

function syncCredentials() {
  const email = process.env.LESHAN_CRM_EMAIL || keychainPassword("leshan-property-sync-email", "crm");
  const password = process.env.LESHAN_CRM_PASSWORD || keychainPassword("leshan-property-sync-password", email);
  return { email, password };
}

function internalUserId() {
  return process.env.TWHG_USER_ID || keychainPassword("leshan-property-sync-twhg", "user-id");
}

function jsonSafe(value) {
  if (value === null || value === undefined) return value;
  if (Array.isArray(value)) return value.map(jsonSafe);
  if (typeof value?.toDate === "function") return value.toDate().toISOString();
  if (typeof value === "object") return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, jsonSafe(item)]));
  return value;
}

function preserve(existing, incoming, field) {
  const oldValue = existing?.[field];
  return oldValue !== undefined && oldValue !== null && String(oldValue).trim() !== "" ? oldValue : incoming?.[field] ?? "";
}

function crmRecord(existing, incoming) {
  const detailFields = ["address", "mainBuildingPing", "auxiliaryBuildingPing", "commonAreaPing", "parkingPing", "parkingDescription"];
  const record = { ...incoming };
  for (const field of detailFields) {
    record[field] = incoming.detailEnriched && incoming[field] !== null && incoming[field] !== ""
      ? incoming[field]
      : preserve(existing, incoming, field);
  }
  record.notes = preserve(existing, incoming, "notes");
  return record;
}

async function applyToCrm(incomingRecords) {
  const [{ initializeApp, deleteApp }, { getAuth, signInWithEmailAndPassword }, firestore] = await Promise.all([
    import("firebase/app"), import("firebase/auth"), import("firebase/firestore"),
  ]);
  const { getFirestore, collection, getDocs, doc, writeBatch, serverTimestamp } = firestore;
  const app = initializeApp(FIREBASE_CONFIG, `property-sync-${Date.now()}`);
  try {
    const { email, password } = syncCredentials();
    await signInWithEmailAndPassword(getAuth(app), email, password);
    const db = getFirestore(app);
    const propertySnapshot = await getDocs(collection(db, "properties"));
    const existing = propertySnapshot.docs.map((item) => ({ id: item.id, ...item.data() }));
    const backupPath = path.join(outputDir, `CRM同步前備份_${today}.json`);
    fs.writeFileSync(backupPath, `${JSON.stringify({ generatedAt: new Date().toISOString(), records: jsonSafe(existing) }, null, 2)}\n`);

    const byListingNo = new Map(existing.filter((item) => item.listingNo).map((item) => [String(item.listingNo).trim(), item]));
    const incomingByNo = new Map(incomingRecords.map((item) => [item.listingNo, item]));
    const operations = [];
    const mergedRecords = [];
    const counts = { added: 0, updated: 0, priceChanged: 0, firstMissing: 0, paused: 0, reactivated: 0 };
    const nowIso = new Date().toISOString();

    for (const incoming of incomingRecords) {
      const old = byListingNo.get(incoming.listingNo);
      if (!old) {
        const ref = doc(collection(db, "properties"));
        const data = {
          ...incoming, status: "active", statusChangedAt: today, missingSyncCount: 0,
          autoMissingOnHold: false, lastSeenAt: nowIso, updatedAt: today,
          lastPriceChange: null, customFields: [], createdAt: serverTimestamp(),
        };
        operations.push({ ref, data, merge: false });
        operations.push({
          ref: doc(collection(db, `properties/${ref.id}/statusLogs`)),
          data: { status: "active", date: today, note: "每日同步自動新增", createdAt: serverTimestamp() }, merge: false,
        });
        mergedRecords.push({ ...data, id: ref.id, createdAt: nowIso });
        counts.added += 1;
        continue;
      }

      const merged = crmRecord(old, incoming);
      const updates = { ...merged, missingSyncCount: 0, lastSeenAt: nowIso, updatedAt: today };
      const oldPrice = old.totalPrice;
      const priceChanged = incoming.totalPrice !== null && incoming.totalPrice !== "" && String(oldPrice ?? "") !== String(incoming.totalPrice);
      if (priceChanged) {
        updates.lastPriceChange = { oldPrice: oldPrice ?? "", newPrice: incoming.totalPrice, date: today };
        operations.push({
          ref: doc(collection(db, `properties/${old.id}/priceLogs`)),
          data: { oldPrice: oldPrice ?? "", newPrice: incoming.totalPrice, date: today, note: "每日同步偵測", createdAt: serverTimestamp() }, merge: false,
        });
        counts.priceChanged += 1;
      }
      if (old.status === "onHold" && old.autoMissingOnHold === true) {
        updates.status = "active";
        updates.statusChangedAt = today;
        updates.autoMissingOnHold = false;
        operations.push({
          ref: doc(collection(db, `properties/${old.id}/statusLogs`)),
          data: { status: "active", date: today, note: "每日報表重新出現，系統自動恢復在售", createdAt: serverTimestamp() }, merge: false,
        });
        counts.reactivated += 1;
      }
      operations.push({ ref: doc(db, "properties", old.id), data: updates, merge: true });
      mergedRecords.push({ ...old, ...updates });
      counts.updated += 1;
    }

    for (const old of existing) {
      if (!old.listingNo || incomingByNo.has(String(old.listingNo).trim()) || (old.status || "active") !== "active") continue;
      const missingSyncCount = Number(old.missingSyncCount || 0) + 1;
      const updates = { missingSyncCount, lastMissingAt: nowIso, updatedAt: today };
      if (missingSyncCount >= 2) {
        updates.status = "onHold";
        updates.statusChangedAt = today;
        updates.autoMissingOnHold = true;
        operations.push({
          ref: doc(collection(db, `properties/${old.id}/statusLogs`)),
          data: { status: "onHold", date: today, note: "連續兩次完整同步未出現，系統自動標記", createdAt: serverTimestamp() }, merge: false,
        });
        counts.paused += 1;
      } else {
        counts.firstMissing += 1;
      }
      operations.push({ ref: doc(db, "properties", old.id), data: updates, merge: true });
    }

    for (let index = 0; index < operations.length; index += 450) {
      const batch = writeBatch(db);
      for (const operation of operations.slice(index, index + 450)) {
        if (operation.merge) batch.set(operation.ref, operation.data, { merge: true });
        else batch.set(operation.ref, operation.data);
      }
      await batch.commit();
    }

    const runRef = doc(collection(db, "propertySyncRuns"));
    const runBatch = writeBatch(db);
    runBatch.set(runRef, {
      date: today, completedAt: serverTimestamp(), sourceFileCount: 64,
      incomingCount: incomingRecords.length, ...counts, successful: true,
    });
    await runBatch.commit();
    return { records: mergedRecords, counts, backupPath };
  } finally {
    await deleteApp(app).catch(() => {});
  }
}

function decodeBig5(value) {
  if (typeof value !== "string") return value;
  return iconv.decode(Buffer.from(value, "latin1"), "big5").trim();
}

function runCurl(args) {
  return new Promise((resolve, reject) => {
    const child = spawn("curl", args, { stdio: ["ignore", "ignore", "pipe"] });
    let error = "";
    child.stderr.on("data", (chunk) => { error += chunk.toString(); });
    child.on("close", (code) => code === 0 ? resolve() : reject(new Error(error.trim() || `curl ${code}`)));
  });
}

function numberOrNull(value) {
  if (value === "" || value === null || value === undefined) return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function detailLines(buffer) {
  const html = iconv.decode(buffer, "big5");
  return decode(html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, "\n"))
    .replace(/\u00a0/g, " ").replace(/\r/g, "").split("\n")
    .map((line) => line.replace(/\s+/g, " ").trim()).filter(Boolean);
}

function lineMatch(lines, regex) {
  for (const line of lines) {
    const match = line.match(regex);
    if (match) return match[1]?.trim() || "";
  }
  return "";
}

function parseDetail(buffer, listingNo) {
  const lines = detailLines(buffer);
  const pageListingNo = lineMatch(lines, /\bNo:\s*([A-Z0-9]+)/i);
  if (pageListingNo && pageListingNo !== listingNo) throw new Error(`${listingNo} 詳細頁編號不一致`);
  const parkingDescription = lineMatch(lines, /^有無車位[：:]\s*(.*)$/);
  const parkingMatch = parkingDescription.match(/^(\d+)個/);
  return {
    address: lineMatch(lines, /^座落[：:]\s*(.+)$/),
    mainBuildingPing: numberOrNull(lineMatch(lines, /主建物[：:]\s*([\d.]+)/)),
    auxiliaryBuildingPing: numberOrNull(lineMatch(lines, /附屬建物[：:]\s*([\d.]+)/)),
    commonAreaPing: numberOrNull(lineMatch(lines, /公設[：:]\s*([\d.]+)/)),
    parkingPing: numberOrNull(lineMatch(lines, /含車位\s*([\d.]+)\s*坪/)),
    registeredTotalPing: numberOrNull(lineMatch(lines, /◎?總坪\s*([\d.]+)/)),
    detailLandPing: numberOrNull(lineMatch(lines, /權狀地坪[：:]\s*([\d.]+)/)),
    parkingDescription,
    detailParkingCount: parkingMatch ? Number(parkingMatch[1]) : (parkingDescription === "無" ? 0 : null),
  };
}

async function enrichRecords(records, userId) {
  const detailDir = path.join(outputDir, "raw-details");
  fs.mkdirSync(detailDir, { recursive: true });
  let cursor = 0;
  let success = 0;
  let failed = 0;
  const enriched = records.map((record) => ({ ...record }));
  const worker = async () => {
    while (cursor < enriched.length) {
      const index = cursor++;
      const record = enriched[index];
      const file = path.join(detailDir, `${record.listingNo}.html`);
      const url = new URL("https://extra.twhg.com.tw/nhapp/arh/arhrp10out.php");
      url.searchParams.set("txtNOTE_NO", record.listingNo);
      url.searchParams.set("user_id", userId);
      url.searchParams.set(`t${record.listingNo}`, record.notes || "");
      try {
        await runCurl([
          "--location", "--fail", "--silent", "--show-error", "--retry", "2", "--max-time", "35",
          "--user-agent", "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/140 Safari/537.36",
          "--referer", "http://nh3.twhg.com.tw/report/objreport.php", "--output", file, url.toString(),
        ]);
        if (fs.statSync(file).size < 500) throw new Error("詳細頁內容過小");
        const detail = parseDetail(fs.readFileSync(file), record.listingNo);
        enriched[index] = {
          ...record, ...detail,
          detailEnriched: true,
          address: detail.address || record.address,
          landPing: detail.detailLandPing ?? record.landPing,
          titlePing: detail.registeredTotalPing ?? record.titlePing,
          parkingCount: detail.detailParkingCount ?? record.parkingCount,
        };
        success += 1;
      } catch (error) {
        failed += 1;
        console.error(`詳細資料失敗 ${record.listingNo}: ${error.message}`);
      }
      if ((success + failed) % 25 === 0 || success + failed === enriched.length) {
        console.log(`詳細資料 ${success + failed}/${enriched.length}，成功 ${success}，失敗 ${failed}`);
      }
    }
  };
  await Promise.all(Array.from({ length: 5 }, () => worker()));
  return { records: enriched, success, failed };
}

async function downloadReports(userId) {
  fs.mkdirSync(reportDir, { recursive: true });
  let completed = 0;
  for (const store of STORES) {
    for (const category of CATEGORIES) {
      const file = path.join(reportDir, `${store.code}_${category.code}.xls`);
      await runCurl([
        "--fail-with-body", "--silent", "--show-error", "--retry", "2", "--max-time", "40",
        "--output", file,
        "--data-urlencode", `user_id=${userId}`,
        "--data-urlencode", `txtDEPID=${store.code}`,
        "--data-urlencode", `txtOBJTYPE=${category.code}`,
        "--data-urlencode", "txtAREA=", "--data-urlencode", "tno=", "--data-urlencode", "tnof=",
        "--data-urlencode", "tsort=1", "--data-urlencode", "tQRC=Y", "--data-urlencode", "sendpok=",
        "http://nh3.twhg.com.tw/report/objexcel.php",
      ]);
      if (fs.statSync(file).size < 4096) throw new Error(`${store.name}／${category.name} 下載檔案異常`);
      completed += 1;
      console.log(`下載 ${completed}/64 ${store.name}／${category.name}`);
    }
  }
  return reportDir;
}

async function downloadOfficialStatusReports(userId) {
  if (!fs.existsSync(backendCookieFile)) return "";
  const statusDir = path.join(outputDir, "official-status-64");
  fs.mkdirSync(statusDir, { recursive: true });
  let completed = 0;
  for (const store of STORES) {
    for (const category of CATEGORIES) {
      const setupFile = path.join(statusDir, `${store.code}_${category.code}.setup.html`);
      const reportFile = path.join(statusDir, `${store.code}_${category.code}.html`);
      const common = [
        "--location", "--fail", "--silent", "--show-error", "--max-time", "40",
        "--cookie", backendCookieFile, "--cookie-jar", backendCookieFile,
        "--data-urlencode", `user_id=${userId}`,
        "--data-urlencode", `txtDEPID=${store.code}`,
        "--data-urlencode", `txtOBJTYPE=${category.code}`,
        "--data-urlencode", "txtAREA=", "--data-urlencode", "tno=", "--data-urlencode", "tnof=",
        "--data-urlencode", "tsort=1", "--data-urlencode", "tQRC=Y", "--data-urlencode", "sendpok=",
      ];
      try {
        await runCurl([...common, "--output", setupFile, "http://nh3.twhg.com.tw/report/objdetail.php"]);
        await runCurl([
          "--location", "--fail", "--silent", "--show-error", "--max-time", "40",
          "--cookie", backendCookieFile, "--cookie-jar", backendCookieFile,
          "--output", reportFile, "http://nh3.twhg.com.tw/report/objreport.php",
        ]);
        const reportText = iconv.decode(fs.readFileSync(reportFile), "big5");
        const setupText = iconv.decode(fs.readFileSync(setupFile), "big5");
        if (!reportText.includes("官網點閱") && setupText.includes("官網點閱")) fs.copyFileSync(setupFile, reportFile);
      } catch (error) {
        console.error(`官網狀態失敗 ${store.name}／${category.name}: ${error.message}`);
      }
      completed += 1;
      if (completed % 16 === 0) console.log(`官網狀態 ${completed}/64`);
    }
  }
  return statusDir;
}

function sourceFiles(dir) {
  return fs.readdirSync(dir)
    .filter((name) => !name.startsWith(".") && name !== "__MACOSX")
    .sort()
    .map((name, index) => {
      if (assumeOrdered) return { file: path.join(dir, name), store: STORES[Math.floor(index / 16)], category: CATEGORIES[index % 16] };
      const match = name.match(/^(D5|DA|DD|DE)_([0-9]+)\.xls$/i);
      if (!match) return null;
      return { file: path.join(dir, name), store: STORES.find((item) => item.code === match[1].toUpperCase()), category: CATEGORIES.find((item) => item.code === match[2]) };
    })
    .filter((item) => item?.store && item?.category);
}

function parseReports(dir) {
  const files = sourceFiles(dir);
  if (files.length !== 64) throw new Error(`必須有64份報表，目前只有${files.length}份`);
  const records = [];
  for (const item of files) {
    const workbook = XLSX.readFile(item.file);
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "" }).map((row) => row.map(decodeBig5));
    if (rows[0]?.[1] !== "委託書編號") throw new Error(`${path.basename(item.file)} 欄位或編碼不正確`);
    const officialColumn = rows[0].findIndex((header) => String(header).includes("官網點閱"));
    for (let rowIndex = 1; rowIndex < rows.length; rowIndex += 1) {
      const row = rows[rowIndex];
      if (!row[1]) continue;
      const listingNo = String(row[1]).trim();
      const officialCell = officialColumn >= 0 ? sheet[XLSX.utils.encode_cell({ r: rowIndex, c: officialColumn })] : null;
      const officialLink = officialCell?.l?.Target || "";
      const record = {
        store: item.store.name, category: item.category.name, listingNo,
        title: String(row[2] || "").trim(), address: String(row[3] || "").trim(),
        landPing: row[4] === "" ? null : Number(row[4]), titlePing: row[5] === "" ? null : Number(row[5]),
        floor: String(row[6] || "").trim(), orientation: String(row[7] || "").trim(), age: String(row[8] || "").trim(),
        layout: String(row[9] || "").trim(), parkingCount: row[10] === "" ? null : Number(row[10]),
        totalPrice: row[11] === "" ? null : Number(row[11]), occupancy: String(row[12] || "").trim(),
        laneWidth: String(row[13] || "").trim(), agentInfo: String(row[14] || "").trim(),
        websiteUrl: /\/buy\//i.test(officialLink) ? officialLink : `https://www.twhg.com.tw/buy/${listingNo}`,
        notes: String(row[16] || "").trim(),
      };
      if (officialColumn >= 0) {
        record.websitePublished = Boolean(officialLink);
        record.officialViewCount = numberOrNull(row[officialColumn]);
        record.officialStatusCheckedAt = new Date().toISOString();
      }
      records.push(record);
    }
  }
  const unique = new Map();
  for (const record of records) if (!unique.has(record.listingNo)) unique.set(record.listingNo, record);
  return { fileCount: files.length, rowCount: records.length, records: [...unique.values()] };
}

function parseOfficialStatusDirectory(dir, records) {
  if (!dir) return { records, checked: 0, published: 0, unpublished: 0 };
  const files = fs.readdirSync(dir)
    .filter((name) => !name.startsWith(".") && fs.statSync(path.join(dir, name)).isFile());
  const statuses = new Map();

  for (const name of files) {
    const buffer = fs.readFileSync(path.join(dir, name));
    const latinPreview = buffer.subarray(0, 1000).toString("latin1").toLowerCase();
    const html = /charset\s*=\s*["']?(?:big5|big-5)/i.test(latinPreview)
      ? iconv.decode(buffer, "big5")
      : buffer.toString("utf8");
    if (/url\s*=\s*\.\.\/index\.php|name=["']user_pass1["']/i.test(html)) continue;

    for (const rowHtml of html.match(/<tr\b[\s\S]*?<\/tr>/gi) || []) {
      const plain = decode(rowHtml.replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ");
      const listingMatch = plain.match(/\b([A-Z]{1,3}\d{7,10})\b/);
      if (!listingMatch) continue;
      let viewCount = null;
      for (const anchor of rowHtml.match(/<a\b[\s\S]*?<\/a>/gi) || []) {
        const anchorText = decode(anchor.replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim();
        if (/^\d+$/.test(anchorText)) {
          viewCount = Number(anchorText);
          break;
        }
      }
      statuses.set(listingMatch[1], {
        websitePublished: viewCount !== null,
        officialViewCount: viewCount,
        officialStatusCheckedAt: new Date().toISOString(),
      });
    }
  }

  const coverage = records.length ? statuses.size / records.length : 1;
  if (records.length && coverage < 0.9) {
    console.error(`官網狀態頁只涵蓋 ${statuses.size}/${records.length} 筆，可能登入失效；本次不更新官網狀態`);
    return { records, checked: 0, published: 0, unpublished: 0, ignored: statuses.size };
  }
  const merged = records.map((record) => statuses.has(record.listingNo) ? { ...record, ...statuses.get(record.listingNo) } : record);
  const published = [...statuses.values()].filter((item) => item.websitePublished).length;
  return { records: merged, checked: statuses.size, published, unpublished: statuses.size - published };
}

function loadPrevious() {
  if (!fs.existsSync(previousFile)) return [];
  return JSON.parse(fs.readFileSync(previousFile, "utf8")).records || [];
}

function makeDiff(previous, current) {
  const oldMap = new Map(previous.map((item) => [item.listingNo, item]));
  const newMap = new Map(current.map((item) => [item.listingNo, item]));
  return {
    added: current.filter((item) => !oldMap.has(item.listingNo)),
    removed: previous.filter((item) => !newMap.has(item.listingNo)),
    changed: current.map((item) => ({ before: oldMap.get(item.listingNo), after: item }))
      .filter((item) => item.before && String(item.before.totalPrice) !== String(item.after.totalPrice)),
  };
}

function styleHeader(row) {
  row.font = { bold: true, color: { argb: "FFFFFFFF" } };
  row.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF4472C4" } };
  row.alignment = { vertical: "middle", horizontal: "center" };
  row.eachCell((cell) => { cell.border = { top: { style: "thin", color: { argb: "FFCCCCCC" } }, left: { style: "thin", color: { argb: "FFCCCCCC" } }, bottom: { style: "thin", color: { argb: "FFCCCCCC" } }, right: { style: "thin", color: { argb: "FFCCCCCC" } } }; });
}

async function createWorkbook(records, diff, previousDate) {
  const workbook = new ExcelJS.Workbook();
  const index = workbook.addWorksheet("索引總覽", { views: [{ state: "frozen", ySplit: 3 }] });
  index.addRow(["物件查詢總表 - 索引"]).font = { bold: true, size: 14 };
  index.addRow([]); styleHeader(index.addRow(["類別", "筆數", "涵蓋店別"]));
  for (const category of CATEGORIES) {
    const rows = records.filter((item) => item.category === category.name);
    index.addRow([category.name, rows.length, [...new Set(rows.map((item) => item.store))].join("、")]);
  }
  index.addRow([]); index.addRow(["總計", records.length]).font = { bold: true };
  index.columns = [{ width: 18 }, { width: 10 }, { width: 60 }];

  const compare = workbook.addWorksheet(`與上次比對`);
  compare.addRow([`本次與上次(${previousDate || "首次"})比對結果`]).font = { bold: true, size: 14 };
  const addSection = (title, header, rows, color) => {
    compare.addRow([]); compare.addRow([`${title}（共${rows.length}筆）`]).font = { bold: true, size: 12 };
    styleHeader(compare.addRow(header));
    for (const values of rows) { const row = compare.addRow(values); row.fill = { type: "pattern", pattern: "solid", fgColor: { argb: color } }; }
  };
  addSection("新增", ["委託書編號", "店名", "類別", "案名", "總價(萬)"], diff.added.map((p) => [p.listingNo, p.store, p.category, p.title, p.totalPrice]), "FFC6EFCE");
  addSection("下架候選", ["委託書編號", "店名", "類別", "案名", "總價(萬)"], diff.removed.map((p) => [p.listingNo, p.store, p.category, p.title, p.totalPrice]), "FFFFC7CE");
  addSection("異動", ["委託書編號", "店名", "案名", "舊總價", "新總價"], diff.changed.map(({ before, after }) => [after.listingNo, after.store, after.title, before.totalPrice, after.totalPrice]), "FFFFEB9C");
  compare.columns = [{ width: 18 }, { width: 20 }, { width: 18 }, { width: 42 }, { width: 14 }];

  for (const category of CATEGORIES) {
    const sheet = workbook.addWorksheet(category.name, { views: [{ state: "frozen", ySplit: 1 }], properties: { defaultRowHeight: 18 } });
    styleHeader(sheet.addRow(HEADER));
    for (const p of records.filter((item) => item.category === category.name)) sheet.addRow([p.store, p.listingNo, p.title, p.address, p.landPing, p.titlePing, p.floor, p.orientation, p.age, p.layout, p.parkingCount, p.totalPrice, p.occupancy, p.laneWidth, p.agentInfo, p.websiteUrl, "", p.notes]);
    sheet.autoFilter = { from: "A1", to: "R1" };
    const widths = [20, 18, 38, 36, 10, 10, 10, 18, 14, 12, 9, 12, 11, 9, 28, 42, 15, 60];
    sheet.columns.forEach((column, index2) => { column.width = widths[index2]; });
  }
  const workbookPath = path.join(outputDir, `物件總表_匯出_${today}.xlsx`);
  await workbook.xlsx.writeFile(workbookPath);
  return workbookPath;
}

async function main() {
  fs.mkdirSync(outputDir, { recursive: true });
  let sourceDir = sourceDirArg;
  let userId = "";
  if (!sourceDir) {
    userId = internalUserId();
    sourceDir = await downloadReports(userId);
  }
  const snapshot = parseReports(sourceDir);
  let officialStatusDir = officialStatusDirArg ? path.resolve(officialStatusDirArg) : "";
  if (!sourceDirArg && !officialStatusDir) officialStatusDir = await downloadOfficialStatusReports(userId);
  if (officialStatusDir) {
    const official = parseOfficialStatusDirectory(officialStatusDir, snapshot.records);
    snapshot.records = official.records;
    snapshot.officialWebsiteStatus = {
      checked: official.checked, published: official.published,
      unpublished: official.unpublished, ignored: official.ignored || 0,
    };
  }
  if (userId || process.argv.includes("--fetch-details")) {
    userId = userId || internalUserId();
    const details = await enrichRecords(snapshot.records, userId);
    snapshot.records = details.records;
    snapshot.details = { success: details.success, failed: details.failed };
  }
  const previous = loadPrevious();
  const diff = makeDiff(previous, snapshot.records);
  let outputRecords = snapshot.records;
  let crm = null;
  if (applyCrm) {
    crm = await applyToCrm(snapshot.records);
    outputRecords = crm.records;
  }
  const workbookPath = await createWorkbook(outputRecords, diff, previous.length ? "上次同步" : "首次");
  const payload = { generatedAt: new Date().toISOString(), ...snapshot, diff: { added: diff.added.length, removed: diff.removed.length, changed: diff.changed.length } };
  fs.writeFileSync(snapshotFile, `${JSON.stringify(payload, null, 2)}\n`);
  fs.copyFileSync(snapshotFile, path.join(path.dirname(outputDir), "latest-snapshot.json"));
  const crmSummary = crm ? { counts: crm.counts, backupPath: crm.backupPath } : null;
  console.log(JSON.stringify({ workbookPath, snapshotFile, fileCount: snapshot.fileCount, rows: snapshot.rowCount, unique: snapshot.records.length, diff: payload.diff, crm: crmSummary }, null, 2));
}

main().catch((error) => { console.error(error.stack || error.message); process.exit(1); });
