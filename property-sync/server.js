#!/usr/bin/env node

const http = require("http");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawn, execFileSync } = require("child_process");

const HOST = "127.0.0.1";
const PORT = 8877;
const appDir = __dirname;
const configDir = path.join(os.homedir(), ".leshan-property-sync");
const configFile = path.join(configDir, "config.json");
const backendCookieFile = path.join(configDir, "nh3-session-cookies.txt");
let running = null;
let lastResult = null;

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

function backendSessionReady() {
  try { return fs.statSync(backendCookieFile).size > 50; }
  catch { return false; }
}

function loginBackend({ account, password, verificationCode }) {
  fs.mkdirSync(configDir, { recursive: true });
  const response = execFileSync("curl", [
    "--location", "--fail", "--silent", "--show-error", "--max-time", "40",
    "--cookie", backendCookieFile, "--cookie-jar", backendCookieFile,
    "--data-urlencode", `user_id1=${account}`,
    "--data-urlencode", `user_pass1=${password}`,
    "--data-urlencode", `id1=${verificationCode}`,
    "--data-urlencode", "save_code=on",
    "http://nh3.twhg.com.tw/lib/loginchk.php",
  ], { encoding: "buffer", maxBuffer: 4 * 1024 * 1024 });
  fs.chmodSync(backendCookieFile, 0o600);
  const text = iconvBig5(response);
  if (/密碼錯誤|驗證碼錯誤|登入失敗|user_pass1/i.test(text)) throw new Error("公司後台登入未成功，請確認帳號、密碼與驗證碼");
  return true;
}

function iconvBig5(buffer) {
  try { return new TextDecoder("big5").decode(buffer); }
  catch { return buffer.toString("latin1"); }
}

function escapeXml(value) {
  return String(value).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function plist(label, args, outputRoot, schedule = false) {
  const argumentsXml = args.map((arg) => `    <string>${escapeXml(arg)}</string>`).join("\n");
  const timing = schedule
    ? "<key>StartCalendarInterval</key><dict><key>Hour</key><integer>7</integer><key>Minute</key><integer>30</integer></dict>"
    : "<key>RunAtLoad</key><true/><key>KeepAlive</key><true/>";
  return `<?xml version="1.0" encoding="UTF-8"?>\n<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">\n<plist version="1.0"><dict>\n<key>Label</key><string>${label}</string>\n<key>ProgramArguments</key><array>\n${argumentsXml}\n</array>\n${timing}\n<key>WorkingDirectory</key><string>${escapeXml(appDir)}</string>\n<key>EnvironmentVariables</key><dict><key>LESHAN_SYNC_OUTPUT_ROOT</key><string>${escapeXml(outputRoot)}</string></dict>\n<key>StandardOutPath</key><string>${escapeXml(path.join(outputRoot, `${label}.log`))}</string>\n<key>StandardErrorPath</key><string>${escapeXml(path.join(outputRoot, `${label}.error.log`))}</string>\n</dict></plist>\n`;
}

function installLaunchAgents(outputRoot) {
  const launchDir = path.join(os.homedir(), "Library", "LaunchAgents");
  fs.mkdirSync(launchDir, { recursive: true });
  fs.mkdirSync(outputRoot, { recursive: true });
  const serverLabel = "tw.com.leshan.property-sync-server";
  const dailyLabel = "tw.com.leshan.property-sync-daily";
  const serverFile = path.join(launchDir, `${serverLabel}.plist`);
  const dailyFile = path.join(launchDir, `${dailyLabel}.plist`);
  fs.writeFileSync(serverFile, plist(serverLabel, [process.execPath, path.join(appDir, "server.js")], outputRoot, false));
  fs.writeFileSync(dailyFile, plist(dailyLabel, [process.execPath, path.join(appDir, "sync.js"), "--apply-crm"], outputRoot, true));
  const domain = `gui/${process.getuid()}`;
  for (const file of [serverFile, dailyFile]) {
    try { execFileSync("launchctl", ["bootstrap", domain, file], { stdio: "ignore" }); }
    catch { /* 已載入時保留既有服務，重新登入後會套用最新 plist */ }
  }
  return { serverFile, dailyFile };
}

function runSync() {
  if (running) return false;
  const config = loadConfig();
  const outputDir = path.join(config.outputRoot, today());
  fs.mkdirSync(outputDir, { recursive: true });
  const logFile = path.join(outputDir, "同步紀錄.log");
  const child = spawn(process.execPath, [path.join(appDir, "sync.js"), "--apply-crm", "--output-dir", outputDir], {
    cwd: appDir, env: { ...process.env, LESHAN_SYNC_OUTPUT_ROOT: config.outputRoot }, stdio: ["ignore", "pipe", "pipe"],
  });
  running = { startedAt: new Date().toISOString(), pid: child.pid };
  const append = (chunk) => fs.appendFileSync(logFile, chunk);
  child.stdout.on("data", append);
  child.stderr.on("data", append);
  child.on("close", (code) => {
    lastResult = { finishedAt: new Date().toISOString(), ok: code === 0, code, outputDir, logFile };
    running = null;
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

const page = `<!doctype html><html lang="zh-Hant"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>樂善 CRM 物件同步</title><style>body{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;background:#f6f4ef;color:#292723;margin:0}.wrap{max-width:720px;margin:48px auto;padding:0 20px}.card{background:#fff;border:1px solid #ddd8cf;border-radius:16px;padding:28px;box-shadow:0 10px 30px #0000000d}h1{font-size:24px;margin:0 0 8px}p{color:#68635b;line-height:1.6}.status{background:#f2f5f0;border-radius:10px;padding:14px;margin:20px 0;white-space:pre-line}button{border:0;border-radius:9px;padding:11px 18px;background:#1f6f4a;color:white;font-weight:700;cursor:pointer;margin-top:12px}button:disabled{opacity:.5}details{margin-top:24px;border-top:1px solid #eee;padding-top:18px}label{display:block;font-size:13px;font-weight:700;margin-top:12px}input{box-sizing:border-box;width:100%;padding:10px;border:1px solid #ccc;border-radius:8px;margin-top:5px}.minor{font-size:12px}</style></head><body><div class="wrap"><div class="card"><h1>樂善 CRM 物件同步</h1><p>每天 07:30 會自動下載 64 份報表、補地址與面積、備份後更新 CRM，並產出 Excel。</p><div id="status" class="status">讀取狀態中…</div><button id="sync" onclick="startSync()">立即同步</button><details><summary>公司後台登入（官網點閱狀態）</summary><label>後台帳號<input id="backendAccount" autocomplete="username"></label><label>後台密碼<input id="backendPassword" type="password" autocomplete="current-password"></label><label>後台驗證碼<input id="backendCode" type="password" autocomplete="one-time-code"></label><p class="minor">密碼與驗證碼不會保存；只保留這台 Mac 的登入工作階段。過期時再登入一次即可。</p><button onclick="backendLogin()">登入公司後台</button></details><details><summary>首次安全設定／重新安裝排程</summary><label>CRM 登入 Email<input id="email" type="email" autocomplete="username"></label><label>CRM 密碼<input id="password" type="password" autocomplete="current-password"></label><label>內部系統使用者編號<input id="userId" autocomplete="off"></label><label>輸出資料夾<input id="outputRoot" value=""></label><p class="minor">密碼與內部編號只會存入這台 Mac 的「鑰匙圈」，不會寫入專案或上傳 GitHub。</p><button onclick="setup()">儲存安全設定並安裝 07:30 排程</button></details></div></div><script>async function refresh(){const s=await fetch('/api/status').then(r=>r.json());document.querySelector('#outputRoot').value=document.querySelector('#outputRoot').value||s.outputRoot;document.querySelector('#sync').disabled=s.running||!s.credentialsReady;document.querySelector('#status').textContent=(s.credentialsReady?'安全設定：完成':'安全設定：尚未完成')+'\\n後台官網狀態：'+(s.backendSessionReady?'已登入':'尚未登入')+'\\n'+(s.running?'正在同步，開始時間：'+s.running.startedAt:s.lastResult?(s.lastResult.ok?'上次同步成功：':'上次同步失敗：')+s.lastResult.finishedAt:'尚無本次啟動後的同步紀錄')+'\\n輸出位置：'+s.outputRoot}async function startSync(){const r=await fetch('/api/sync',{method:'POST'}).then(r=>r.json());alert(r.message);refresh()}async function setup(){const data={email:email.value,password:password.value,userId:userId.value,outputRoot:outputRoot.value};const r=await fetch('/api/setup',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(data)}).then(r=>r.json());password.value='';alert(r.message);refresh()}async function backendLogin(){const data={account:backendAccount.value,password:backendPassword.value,verificationCode:backendCode.value};const r=await fetch('/api/backend-login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(data)}).then(r=>r.json());backendPassword.value='';backendCode.value='';alert(r.message);refresh()}refresh();setInterval(refresh,3000)</script></body></html>`;

http.createServer(async (request, response) => {
  try {
    if (request.method === "GET" && request.url === "/") {
      response.writeHead(200, { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" });
      response.end(page);
      return;
    }
    if (request.method === "GET" && request.url === "/api/status") {
      const config = loadConfig();
      sendJson(response, 200, { credentialsReady: credentialsReady(), backendSessionReady: backendSessionReady(), outputRoot: config.outputRoot, running, lastResult });
      return;
    }
    if (request.method === "POST" && request.url === "/api/sync") {
      if (!credentialsReady()) return sendJson(response, 400, { message: "請先完成安全設定。" });
      const started = runSync();
      sendJson(response, started ? 202 : 409, { message: started ? "已開始同步，可留在此頁查看進度。" : "同步已在執行中。" });
      return;
    }
    if (request.method === "POST" && request.url === "/api/backend-login") {
      const data = await readJson(request);
      if (!data.account || !data.password || !data.verificationCode) return sendJson(response, 400, { message: "後台帳號、密碼與驗證碼都要填寫。" });
      loginBackend(data);
      sendJson(response, 200, { message: "公司後台登入工作階段已儲存。" });
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
