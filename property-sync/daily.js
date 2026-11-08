#!/usr/bin/env node

const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawn } = require("child_process");
const { createStore, readJson, taipeiDay, scheduleDecision } = require("./sync-control");

const appDir = __dirname;
const configDir = path.join(os.homedir(), ".leshan-property-sync");

function loadConfig() {
  return JSON.parse(fs.readFileSync(path.join(configDir, "config.json"), "utf8"));
}

function archiveRun(localOutputDir, today) {
  const { outputRoot } = loadConfig();
  const driveOutputDir = path.join(outputRoot, today);
  try {
    fs.mkdirSync(driveOutputDir, { recursive: true });
    fs.cpSync(localOutputDir, driveOutputDir, { recursive: true, force: true });
    console.log(`同步報表已備份到 Google Drive：${driveOutputDir}`);
  } catch (error) {
    console.error(`Google Drive 報表備份失敗（不影響 CRM 更新）：${error.message}`);
  }
}

function run(script, args = []) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [path.join(appDir, script), ...args], {
      cwd: appDir, env: { ...process.env, LESHAN_SYNC_TRIGGER: "scheduled" }, stdio: "inherit",
    });
    child.on("close", (code) => {
      if (code === 0) return resolve();
      const error = new Error(`${script} 結束代碼 ${code}`);
      error.exitCode = code;
      reject(error);
    });
    child.on("error", reject);
  });
}

async function main() {
  const store = createStore(configDir);
  const state = store.read();
  const decision = scheduleDecision({ state, busy: store.busy(),
    snapshotAt: state.lastSuccessAt ? undefined : readJson(path.join(configDir, "latest-snapshot.json")).generatedAt });
  if (process.argv.includes("--check-only")) {
    console.log(JSON.stringify(decision));
    return;
  }
  if (!decision.run) return;
  console.log(`${new Date().toISOString()} ${decision.reason}`);
  const today = taipeiDay();
  const localOutputDir = path.join(configDir, "runs", today);
  fs.mkdirSync(localOutputDir, { recursive: true });
  try { await run("sync.js", ["--apply-crm", "--output-dir", localOutputDir]); }
  catch (error) { if (store.busy()) return; throw error; }
  archiveRun(localOutputDir, today);
  try { await run("report-retention.js", ["--apply"]); }
  catch (error) { console.error(`舊報表整理未完成（不影響本次同步）：${error.message}`); }
  try {
    await run("sheet-import.js", ["--apply"]);
  } catch (error) {
    console.error(`物件資料圖片匯入失敗，但 CRM 每日物件更新已完成：${error.message}`);
  }
}

if (require.main === module) main().catch((error) => { console.error(error.stack || error.message); process.exit(1); });
