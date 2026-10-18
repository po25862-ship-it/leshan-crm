#!/usr/bin/env node

const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawn } = require("child_process");

const appDir = __dirname;
const configDir = path.join(os.homedir(), ".leshan-property-sync");
const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Taipei" }).format(new Date());

function loadConfig() {
  return JSON.parse(fs.readFileSync(path.join(configDir, "config.json"), "utf8"));
}

function archiveRun(localOutputDir) {
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
      cwd: appDir, env: process.env, stdio: "inherit",
    });
    child.on("close", (code) => code === 0 ? resolve() : reject(new Error(`${script} 結束代碼 ${code}`)));
    child.on("error", reject);
  });
}

async function main() {
  const localOutputDir = path.join(configDir, "runs", today);
  fs.mkdirSync(localOutputDir, { recursive: true });
  await run("sync.js", ["--apply-crm", "--output-dir", localOutputDir]);
  archiveRun(localOutputDir);
  try {
    await run("sheet-import.js", ["--apply"]);
  } catch (error) {
    console.error(`物件資料圖片匯入失敗，但 CRM 每日物件更新已完成：${error.message}`);
  }
}

main().catch((error) => { console.error(error.stack || error.message); process.exit(1); });
