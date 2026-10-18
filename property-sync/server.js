#!/usr/bin/env node

const http = require("http");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawn, execFileSync } = require("child_process");
const { credentialStatus, ensureBackendSession, sessionReady } = require("./backend-auth");

const HOST = "127.0.0.1";
const PORT = 8877;
const appDir = __dirname;
const configDir = path.join(os.homedir(), ".leshan-property-sync");
const configFile = path.join(configDir, "config.json");
const sheetStatusFile = path.join(configDir, "sheet-import-status.json");
let running = null;
let lastResult = null;
let sheetRunning = null;
let sheetLastResult = readJsonFile(sheetStatusFile, null);

function readJsonFile(file, fallback) {
  try { return JSON.parse(fs.readFileSync(file, "utf8")); }
  catch { return fallback; }
}

function appendLocalLog(file, chunk) {
  try {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.appendFileSync(file, chunk);
  } catch (error) {
    console.error(`本機紀錄寫入失敗：${error.message}`);
  }
}

function defaultOutputRoot() {
  try {
    const cloudRoot = path.join(os.homedir(), "Library", "CloudStorage");
    const googleDrive = fs.readdirSync(cloudRoot).find((name) => name.startsWith("GoogleDrive-"));
    if (googleDrive) return path.join(cloudRoot, googleDrive, "我的雲端硬碟", "下載資料", "後台物件", "每日同步");
  } catch { /* 沒有 Google Drive 時使用 Documents */ }
  return path.join(os.homedir(), "Documents", "樂善CRM每日同步");
}

function today() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Taipei" }).format(new Date());
}

function loadConfig() {
  try { return JSON.parse(fs.readFileSync(configFile, "utf8")); }
  catch { return { outputRoot: defaultOutputRoot() }; }
}

function keyExists(service, account) {
  try {
    execFileSync("security", ["find-generic-password", "-s", service, "-a", account, "-w"], { stdio: "ignore" });
    return true;
  } catch { return false; }
}

function credentialsReady() {
  if (!keyExists("leshan-property-sync-email", "crm") || !keyExists("leshan-property-sync-twhg", "user-id")) return false;
  try {
    const email = execFileSync("security", ["find-generic-password", "-s", "leshan-property-sync-email", "-a", "crm", "-w"], { encoding: "utf8" }).trim();
    return Boolean(email && keyExists("leshan-property-sync-password", email));
  } catch { return false; }
}

function escapeXml(value) {
  return String(value).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function plist(label, args, outputRoot, schedule = false) {
  const argumentsXml = args.map((arg) => `    <string>${escapeXml(arg)}</string>`).join("\n");
  const timing = schedule
    ? "<key>StartCalendarInterval</key><dict><key>Hour</key><integer>7</integer><key>Minute</key><integer>30</integer></dict>"
    : "<key>RunAtLoad</key><true/><key>KeepAlive</key><true/>";
  return `<?xml version="1.0" encoding="UTF-8"?>\n<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">\n<plist version="1.0"><dict>\n<key>Label</key><string>${label}</string>\n<key>ProgramArguments</key><array>\n${argumentsXml}\n</array>\n${timing}\n<key>WorkingDirectory</key><string>${escapeXml(appDir)}</string>\n<key>EnvironmentVariables</key><dict><key>LESHAN_SYNC_OUTPUT_ROOT</key><string>${escapeXml(outputRoot)}</string></dict>\n<key>StandardOutPath</key><string>${escapeXml(path.join(configDir, `${label}.log`))}</string>\n<key>StandardErrorPath</key><string>${escapeXml(path.join(configDir, `${label}.error.log`))}</string>\n</dict></plist>\n`;
}

function installLaunchAgents(outputRoot) {
  const launchDir = path.join(os.homedir(), "Library", "LaunchAgents");
  fs.mkdirSync(launchDir, { recursive: true });
  fs.mkdirSync(configDir, { recursive: true });
  fs.mkdirSync(outputRoot, { recursive: true });
  const serverLabel = "tw.com.leshan.property-sync-server";
  const dailyLabel = "tw.com.leshan.property-sync-daily";
  const serverFile = path.join(launchDir, `${serverLabel}.plist`);
  const dailyFile = path.join(launchDir, `${dailyLabel}.plist`);
  fs.writeFileSync(serverFile, plist(serverLabel, [process.execPath, path.join(appDir, "server.js")], outputRoot, false));
  fs.writeFileSync(dailyFile, plist(dailyLabel, [process.execPath, path.join(appDir, "daily.js")], outputRoot, true));
  const domain = `gui/${process.getuid()}`;
  for (const [label, file] of [[serverLabel, serverFile], [dailyLabel, dailyFile]]) {
    try { execFileSync("launchctl", ["bootout", `${domain}/${label}`], { stdio: "ignore" }); }
    catch { /* 尚未載入 */ }
    execFileSync("launchctl", ["bootstrap", domain, file], { stdio: "ignore" });
  }
  return { serverFile, dailyFile };
}

function runSync() {
  if (running) return false;
  const config = loadConfig();
  const runDate = today();
  const outputDir = path.join(configDir, "runs", runDate);
  const archiveDir = path.join(config.outputRoot, runDate);
  fs.mkdirSync(outputDir, { recursive: true });
  const logFile = path.join(outputDir, "同步紀錄.log");
  const child = spawn(process.execPath, [path.join(appDir, "sync.js"), "--apply-crm", "--output-dir", outputDir], {
    cwd: appDir, env: { ...process.env, LESHAN_SYNC_OUTPUT_ROOT: config.outputRoot }, stdio: ["ignore", "pipe", "pipe"],
  });
  running = { startedAt: new Date().toISOString(), pid: child.pid };
  child.stdout.on("data", (chunk) => appendLocalLog(logFile, chunk));
  child.stderr.on("data", (chunk) => appendLocalLog(logFile, chunk));
  child.on("close", (code) => {
    let archiveError = "";
    if (code === 0) {
      try {
        fs.mkdirSync(archiveDir, { recursive: true });
        fs.cpSync(outputDir, archiveDir, { recursive: true, force: true });
      } catch (error) {
        archiveError = error.message;
      }
    }
    lastResult = { finishedAt: new Date().toISOString(), ok: code === 0, code, outputDir, archiveDir, archiveError, logFile };
    running = null;
  });
  return true;
}

function runSheetImport() {
  if (sheetRunning) return false;
  const config = loadConfig();
  const logFile = path.join(configDir, "logs", "物件資料自動匯入.log");
  const archiveLogFile = path.join(config.outputRoot, "物件資料自動匯入.log");
  const child = spawn(process.execPath, [path.join(appDir, "sheet-import.js"), "--apply"], {
    cwd: appDir, env: process.env, stdio: ["ignore", "pipe", "pipe"],
  });
  sheetRunning = { startedAt: new Date().toISOString(), pid: child.pid };
  child.stdout.on("data", (chunk) => appendLocalLog(logFile, chunk));
  child.stderr.on("data", (chunk) => appendLocalLog(logFile, chunk));
  child.on("close", (code) => {
    let archiveError = "";
    try {
      fs.mkdirSync(path.dirname(archiveLogFile), { recursive: true });
      fs.copyFileSync(logFile, archiveLogFile);
    } catch (error) {
      archiveError = error.message;
    }
    sheetLastResult = { finishedAt: new Date().toISOString(), ok: code === 0, code, logFile, archiveLogFile, archiveError };
    try { fs.writeFileSync(sheetStatusFile, `${JSON.stringify(sheetLastResult, null, 2)}\n`, { mode: 0o600 }); }
    catch (error) { console.error(`掃描狀態保存失敗：${error.message}`); }
    sheetRunning = null;
  });
  return true;
}

function sendJson(response, status, data) {
  response.writeHead(status, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" });
  response.end(JSON.stringify(data));
}

function readJson(request) {
  return new Promise((resolve, reject) => {
    let body = "";
    request.on("data", (chunk) => {
      body += chunk;
      if (body.length > 20000) request.destroy();
    });
    request.on("end", () => { try { resolve(JSON.parse(body || "{}")); } catch (error) { reject(error); } });
    request.on("error", reject);
  });
}

const page = fs.readFileSync(path.join(appDir, "page.html"), "utf8");

if (process.argv.includes("--install-schedule")) {
  const config = loadConfig();
  installLaunchAgents(path.resolve(config.outputRoot));
  console.log("07:30 自動同步排程已重新安裝並載入。");
  process.exit(0);
}

http.createServer(async (request, response) => {
  try {
    if (request.method === "GET" && request.url === "/") {
      response.writeHead(200, { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" });
      response.end(page);
      return;
    }
    if (request.method === "GET" && request.url === "/api/status") {
      const config = loadConfig();
      sendJson(response, 200, { credentialsReady: credentialsReady(), backendSessionReady: sessionReady(), backend: credentialStatus(), outputRoot: config.outputRoot, running, lastResult, sheetRunning, sheetLastResult });
      return;
    }
    if (request.method === "POST" && request.url === "/api/sync") {
      if (!credentialsReady()) return sendJson(response, 400, { message: "請先完成安全設定。" });
      if (running) return sendJson(response, 409, { message: "同步已在執行中。" });
      const data = await readJson(request);
      try { ensureBackendSession(data, { required: true }); }
      catch (error) { return sendJson(response, 400, { message: error.message }); }
      const started = runSync();
      sendJson(response, started ? 202 : 409, { message: started ? "已開始同步，可留在此頁查看進度。" : "同步已在執行中。" });
      return;
    }
    if (request.method === "POST" && request.url === "/api/sheets/scan") {
      if (!credentialsReady()) return sendJson(response, 400, { message: "請先完成安全設定。" });
      const started = runSheetImport();
      sendJson(response, started ? 202 : 409, { message: started ? "已開始掃描物件資料，可留在此頁查看進度。" : "物件資料掃描已在執行中。" });
      return;
    }
    if (request.method === "POST" && request.url === "/api/backend-login") {
      const data = await readJson(request);
      try { ensureBackendSession(data, { required: true, forceLogin: true }); }
      catch (error) { return sendJson(response, 400, { message: error.message }); }
      sendJson(response, 200, { message: "公司後台已登入。帳號、密碼及本月驗證碼已存入這台 Mac 的鑰匙圈。" });
      return;
    }
    if (request.method === "POST" && request.url === "/api/setup") {
      const data = await readJson(request);
      if (!data.email || !data.password || !data.userId || !data.outputRoot) return sendJson(response, 400, { message: "四個欄位都要填寫。" });
      fs.mkdirSync(configDir, { recursive: true });
      fs.writeFileSync(configFile, `${JSON.stringify({ outputRoot: path.resolve(data.outputRoot) }, null, 2)}\n`, { mode: 0o600 });
      execFileSync("security", ["add-generic-password", "-U", "-s", "leshan-property-sync-email", "-a", "crm", "-w", data.email]);
      execFileSync("security", ["add-generic-password", "-U", "-s", "leshan-property-sync-password", "-a", data.email, "-w", data.password]);
      execFileSync("security", ["add-generic-password", "-U", "-s", "leshan-property-sync-twhg", "-a", "user-id", "-w", data.userId]);
      installLaunchAgents(path.resolve(data.outputRoot));
      sendJson(response, 200, { message: "安全設定已儲存，07:30 排程已安裝。" });
      return;
    }
    sendJson(response, 404, { message: "找不到頁面" });
  } catch (error) {
    console.error(error.message);
    sendJson(response, 500, { message: `處理失敗：${error.message}` });
  }
}).listen(PORT, HOST, () => console.log(`樂善 CRM 同步工具：http://${HOST}:${PORT}/`));
