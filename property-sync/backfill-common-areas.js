#!/usr/bin/env node
const fs = require("fs");
const os = require("os");
const path = require("path");
const { parseDetail, withAuthenticatedCrm } = require("./sync");
const { EXCLUDING_PARKING } = require("./common-area");
const FIELDS = ["commonAreaPing", "commonAreaGrossPing", "commonAreaBasis"];

function correction(existing, source) {
  if (existing.commonAreaBasis === EXCLUDING_PARKING || source.commonAreaBasis !== EXCLUDING_PARKING || !(source.parkingPing > 0)) return null;
  // Only change values that still match the raw company figures, preserving edits.
  if (existing.commonAreaPing == null || existing.parkingPing == null ||
      String(existing.commonAreaPing).trim() === "" || String(existing.parkingPing).trim() === "" ||
      Math.abs(Number(existing.commonAreaPing) - source.commonAreaGrossPing) > 0.0001 ||
      Math.abs(Number(existing.parkingPing) - source.parkingPing) > 0.0001 ||
      !Number.isFinite(Number(existing.commonAreaPing)) || !Number.isFinite(Number(existing.parkingPing))) return null;
  return Object.fromEntries(FIELDS.map((field) => [field, source[field]]));
}

function scanReports(root) {
  const records = new Map();
  let parserErrors = 0;
  for (const run of fs.readdirSync(root).filter((name) => /^\d{4}-\d{2}-\d{2}$/.test(name)).sort().reverse()) {
    const directory = path.join(root, run, "raw-details");
    if (!fs.existsSync(directory)) continue;
    for (const file of fs.readdirSync(directory)) {
      if (!/^[A-Z0-9]+\.html$/.test(file)) continue;
      const listingNo = file.slice(0, -5);
      if (records.has(listingNo)) continue;
      records.set(listingNo, null);
      try { records.set(listingNo, { ...parseDetail(fs.readFileSync(path.join(directory, file)), listingNo), listingNo, sourceDate: run }); }
      catch { parserErrors++; }
    }
  }
  return { records: [...records.values()].filter(Boolean), parserErrors };
}

async function backfill(records, apply) {
  const sources = new Map(records.map((record) => [record.listingNo, record]));
  return withAuthenticatedCrm(async (db, firestore) => {
    const { collection, getDocs, getDoc, doc, writeBatch } = firestore;
    const snapshot = await getDocs(collection(db, "properties"));
    const plan = [];
    for (const document of snapshot.docs) {
      const data = document.data();
      const source = sources.get(String(data.listingNo || "").trim().toUpperCase());
      const after = source && correction(data, source);
      if (!after) continue;
      const before = Object.fromEntries(FIELDS.map((field) => [field, { present: Object.prototype.hasOwnProperty.call(data, field), value: data[field] ?? null }]));
      plan.push({ id: document.id, listingNo: source.listingNo, sourceDate: source.sourceDate, before, after });
    }
    const summary = { existingProperties: snapshot.size, planned: plan.length, applied: 0,
      example: plan.find((item) => item.listingNo === "DD02404972") || null };
    if (!apply || !plan.length) return summary;
    const backupDir = path.join(os.homedir(), ".leshan-property-sync", "common-area-backups");
    fs.mkdirSync(backupDir, { recursive: true, mode: 0o700 });
    const backupPath = path.join(backupDir, `backfill-${new Date().toISOString().replace(/[:.]/g, "-")}.json`);
    fs.writeFileSync(backupPath, JSON.stringify({ generatedAt: new Date().toISOString(), plan }, null, 2), { mode: 0o600, flag: "wx" });
    for (let start = 0; start < plan.length; start += 400) {
      const batch = writeBatch(db);
      const chunk = plan.slice(start, start + 400);
      chunk.forEach((item) => batch.update(doc(db, "properties", item.id), item.after));
      await batch.commit();
      summary.applied += chunk.length;
    }
    const samples = [...new Map([plan[0], plan.find((item) => item.listingNo === "DD02404972"), plan[plan.length - 1]].filter(Boolean).map((item) => [item.id, item])).values()];
    for (const sample of samples) {
      const current = (await getDoc(doc(db, "properties", sample.id))).data();
      if (FIELDS.some((field) => current[field] !== sample.after[field])) throw new Error(`Area verification failed for ${sample.listingNo}`);
    }
    return { ...summary, backupPath, verifiedSamples: samples.length };
  });
}

async function main() {
  const scanned = scanReports(path.join(os.homedir(), ".leshan-property-sync", "runs"));
  const basic = { reports: scanned.records.length, parserErrors: scanned.parserErrors,
    reportsWithIncludedParking: scanned.records.filter((record) => record.commonAreaBasis === EXCLUDING_PARKING).length };
  console.log(JSON.stringify(process.argv.includes("--scan-only") ? basic : { ...basic, ...await backfill(scanned.records, process.argv.includes("--apply")) }, null, 2));
}
module.exports = { correction, scanReports, backfill };
if (require.main === module) main().catch((error) => { console.error(error.message); process.exitCode = 1; });
