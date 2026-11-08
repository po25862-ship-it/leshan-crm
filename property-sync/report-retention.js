#!/usr/bin/env node
const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawn } = require("child_process");
const { createStore, readJson, taipeiDay } = require("./sync-control");

const RULES = { rawDays: 30, backupDays: 90, summaryYears: 1 };
const RAW = new Set(["raw-64", "raw-details", "official-status-64", "road-keywords"]);
const SUMMARY = new Set(["snapshot.json", "road-keyword-summary.json", "同步紀錄.log"]);

function validDay(day) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return false;
  const date = new Date(`${day}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === day;
}

function cutoffDays(day, days) {
  const date = new Date(`${day}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() - days);
  return date.toISOString().slice(0, 10);
}

function cutoffYear(day) {
  const date = new Date(`${day}T00:00:00Z`);
  const month = date.getUTCMonth();
  date.setUTCFullYear(date.getUTCFullYear() - 1);
  if (date.getUTCMonth() !== month) date.setUTCDate(0);
  return date.toISOString().slice(0, 10);
}

function fileBytes(file) {
  const stat = fs.lstatSync(file);
  if (stat.isSymbolicLink()) return 0;
  if (stat.isFile()) return stat.size;
  return fs.readdirSync(file).reduce((total, name) => total + fileBytes(path.join(file, name)), 0);
}

function planRetention(roots, now = new Date()) {
  const today = taipeiDay(now);
  const cutoffs = { raw: cutoffDays(today, RULES.rawDays), backup: cutoffDays(today, RULES.backupDays), summary: cutoffYear(today) };
  const entries = [];
  const errors = [];
  const seen = new Set();
  for (const { label, directory } of roots) {
    try {
      if (!directory || !fs.existsSync(directory) || fs.lstatSync(directory).isSymbolicLink()) continue;
      const root = fs.realpathSync(directory);
      if (seen.has(root)) continue;
      seen.add(root);
      for (const folder of fs.readdirSync(root, { withFileTypes: true })) {
        const day = folder.name;
        if (!folder.isDirectory() || !validDay(day) || day >= today) continue;
        const dated = path.join(root, day);
        for (const item of fs.readdirSync(dated, { withFileTypes: true })) {
          if (item.isSymbolicLink()) continue;
          let category;
          if (item.isDirectory() && RAW.has(item.name)) category = "raw";
          else if (item.isFile() && item.name === `CRM同步前備份_${day}.json`) category = "backup";
          else if (item.isFile() && (SUMMARY.has(item.name) || item.name === `物件總表_匯出_${day}.xlsx`)) category = "summary";
          if (!category || day >= cutoffs[category]) continue;
          const source = path.join(dated, item.name);
          const stat = fs.lstatSync(source);
          entries.push({ source, label, day, name: item.name, category, bytes: fileBytes(source),
            device: stat.dev, inode: stat.ino, modified: stat.mtimeMs });
        }
      }
    } catch (error) { errors.push({ label, message: error.message }); }
  }
  return { rules: RULES, entries, errors, bytes: entries.reduce((total, item) => total + item.bytes, 0) };
}

function canClean(state, now = new Date()) {
  const success = new Date(state.lastSuccessAt);
  return state.ok === true && state.running === false && state.phase === "complete"
    && !Number.isNaN(success.getTime()) && success <= now && taipeiDay(success) === taipeiDay(now);
}

function atomicJson(file, value) {
  const temporary = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(temporary, `${JSON.stringify(value, null, 2)}\n`, { mode: 0o600 });
  fs.renameSync(temporary, file);
}

function applyRetention(plan, { state, now = new Date(), trashRoot = path.join(os.homedir(), ".Trash") } = {}) {
  if (!canClean(state || {}, now)) return { skipped: true, reason: "今日同步尚未成功，保留全部舊檔。", movedCount: 0, movedBytes: 0 };
  const result = { completedAt: now.toISOString(), rules: RULES, movedCount: 0, movedBytes: 0, errors: [...plan.errors] };
  if (!plan.entries.length) return result;
  fs.mkdirSync(trashRoot, { recursive: true, mode: 0o700 });
  const batch = fs.mkdtempSync(path.join(trashRoot, `樂善同步報表_${taipeiDay(now)}_`));
  const manifestFile = path.join(batch, "還原清單.json");
  const manifest = { createdAt: now.toISOString(), entries: plan.entries.map((entry) => ({
    ...entry, target: path.join(batch, entry.label, entry.day, entry.name), status: "planned",
  })) };
  // Save original locations before moving anything, including in case of an interrupted cleanup.
  atomicJson(manifestFile, manifest);
  fs.writeFileSync(path.join(batch, "還原說明.txt"), "這些是 CRM 自動整理的舊報表，沒有永久刪除。\n原始位置請看「還原清單.json」的 source；檔案依本機／GoogleDrive及日期整理。\n需要還原時，將檔案移回原位置；遇到同名檔案請先核對，不要覆蓋新檔。\n此工具不會清空垃圾桶；垃圾桶內的檔案仍會佔用空間。\n", { mode: 0o600 });
  for (const entry of manifest.entries) {
    try {
      const stat = fs.lstatSync(entry.source);
      if (stat.isSymbolicLink() || stat.dev !== entry.device || stat.ino !== entry.inode || stat.mtimeMs !== entry.modified) {
        throw new Error("檔案已變動，保留原檔。");
      }
      fs.mkdirSync(path.dirname(entry.target), { recursive: true, mode: 0o700 });
      // Rename only: never fall back to copy-then-delete across volumes.
      fs.renameSync(entry.source, entry.target);
      entry.status = "moved";
      result.movedCount += 1;
      result.movedBytes += entry.bytes;
    } catch (error) {
      entry.status = "kept";
      entry.error = error.message;
      result.errors.push({ source: entry.source, message: error.message });
    }
    atomicJson(manifestFile, manifest);
  }
  return { ...result, trashDirectory: batch };
}

function main() {
  const configDir = path.join(os.homedir(), ".leshan-property-sync");
  const apply = process.argv.includes("--apply");
  if (apply && !process.argv.includes("--retention-lock-held")) {
    const locked = createStore(configDir).lockedCommand(process.execPath, [__filename, "--apply", "--retention-lock-held"]);
    const child = spawn(locked.command, locked.args, { stdio: "inherit" });
    child.on("error", (error) => { console.error(error.message); process.exitCode = 1; });
    child.on("close", (code) => { process.exitCode = code ?? 1; });
    return;
  }
  const config = readJson(path.join(configDir, "config.json"));
  const plan = planRetention([{ label: "本機", directory: path.join(configDir, "runs") },
    { label: "GoogleDrive", directory: config.outputRoot }]);
  if (!apply) {
    console.log(JSON.stringify({ preview: true, ...plan }, null, 2));
    return;
  }
  const result = applyRetention(plan, { state: createStore(configDir).read() });
  atomicJson(path.join(configDir, "report-retention-status.json"), result);
  console.log(JSON.stringify(result, null, 2));
}

module.exports = { RULES, planRetention, applyRetention, canClean };
if (require.main === module) { try { main(); } catch (error) { console.error(`舊報表整理未完成，保留未搬移檔案：${error.message}`); process.exitCode = 1; } }
