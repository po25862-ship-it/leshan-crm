const fs = require("fs");
const os = require("os");
const path = require("path");
const { execFileSync } = require("child_process");

const configDir = path.join(os.homedir(), ".leshan-property-sync");
const cookieFile = path.join(configDir, "nh3-session-cookies.txt");
const verifiedFile = path.join(configDir, "nh3-session-verified.json");
const codeMonthFile = path.join(configDir, "nh3-code-month.json");
const keychainService = "leshan-property-sync-backend";

function taiwanMonth(date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Taipei", year: "numeric", month: "2-digit",
  }).formatToParts(date);
  return `${parts.find((item) => item.type === "year").value}-${parts.find((item) => item.type === "month").value}`;
}

function readSecret(account) {
  try {
    return execFileSync("security", ["find-generic-password", "-s", keychainService, "-a", account, "-w"], {
      encoding: "utf8", stdio: ["ignore", "pipe", "ignore"],
    }).replace(/\r?\n$/, "");
  } catch { return ""; }
}

function saveSecret(account, value) {
  execFileSync("security", ["add-generic-password", "-U", "-s", keychainService, "-a", account, "-w", value], {
    stdio: "ignore",
  });
}

function savedCodeMonth() {
  try { return JSON.parse(fs.readFileSync(codeMonthFile, "utf8")).month || ""; }
  catch { return ""; }
}

function credentialStatus() {
  const account = readSecret("account");
  const hasPassword = Boolean(readSecret("password"));
  const hasCode = Boolean(readSecret("code"));
  const codeMonth = savedCodeMonth();
  return {
    account, hasPassword, hasCode, codeMonth,
    codeCurrent: hasCode && codeMonth === taiwanMonth(),
    currentMonth: taiwanMonth(),
  };
}

function sessionReady() {
  try {
    const cookie = fs.statSync(cookieFile);
    const verified = JSON.parse(fs.readFileSync(verifiedFile, "utf8"));
    const age = Date.now() - Date.parse(verified.verifiedAt);
    return cookie.size > 50 && age >= 0 && age < 12 * 60 * 60 * 1000;
  } catch { return false; }
}

function decodeBig5(buffer) {
  try { return new TextDecoder("big5").decode(buffer); }
  catch { return buffer.toString("latin1"); }
}

function loginBackend({ account, password, verificationCode }) {
  fs.mkdirSync(configDir, { recursive: true });
  // An old cookie must never make an incorrect new code look successful.
  for (const file of [verifiedFile, cookieFile]) {
    try { fs.unlinkSync(file); } catch { /* No previous session. */ }
  }
  let response;
  try {
    const common = ["--location", "--fail", "--silent", "--show-error", "--max-time", "40",
      "--cookie", cookieFile, "--cookie-jar", cookieFile];
    execFileSync("curl", [...common, "--output", "/dev/null", "http://nh3.twhg.com.tw/index.php"]);
    execFileSync("curl", [...common,
      "--data-urlencode", `user_id1=${account}`,
      "--data-urlencode", `user_pass1=${password}`,
      "--data-urlencode", `id1=${verificationCode}`,
      "--data-urlencode", "save_code=on", "--output", "/dev/null",
      "http://nh3.twhg.com.tw/lib/loginchk.php",
    ]);
    response = execFileSync("curl", [...common, "http://nh3.twhg.com.tw/report/objdetail.php"], {
      encoding: "buffer", maxBuffer: 4 * 1024 * 1024,
    });
  } catch {
    throw new Error("公司後台連線或登入失敗，請稍後重試，並確認帳號、密碼與驗證碼。");
  }
  const html = decodeBig5(response);
  if (/meta\s+http-equiv=['"]?refresh[^>]+index\.php|form_login|user_pass1/i.test(html)) {
    throw new Error("公司後台登入未成功，請確認帳號、密碼與驗證碼。");
  }
  fs.chmodSync(cookieFile, 0o600);
  fs.writeFileSync(verifiedFile, `${JSON.stringify({ verifiedAt: new Date().toISOString() })}\n`, { mode: 0o600 });
}

function ensureBackendSession(input = {}, { required = false, forceLogin = false } = {}) {
  const enteredAccount = String(input.account || "").trim();
  const enteredPassword = String(input.password || "");
  const enteredCode = String(input.verificationCode || "").trim();
  const account = enteredAccount || readSecret("account");
  const password = enteredPassword || readSecret("password");
  const verificationCode = enteredCode || readSecret("code");
  const codeCurrent = Boolean(enteredCode) || savedCodeMonth() === taiwanMonth();

  if (!account || !password || !verificationCode) {
    if (!required) return { ready: false, reason: "請在物件立即同步頁填寫公司後台帳號、密碼與本月驗證碼。" };
    throw new Error("請填寫公司後台帳號、密碼與本月驗證碼。");
  }
  if (!codeCurrent) {
    if (!required) return { ready: false, reason: "本月驗證碼尚未更新，請在物件立即同步頁輸入新驗證碼。" };
    throw new Error("本月驗證碼尚未更新，請輸入新驗證碼。");
  }

  const changed = Boolean(enteredAccount || enteredPassword || enteredCode);
  if (!forceLogin && !changed && sessionReady()) return { ready: true, reused: true };
  loginBackend({ account, password, verificationCode });
  try {
    saveSecret("account", account);
    saveSecret("password", password);
    saveSecret("code", verificationCode);
  } catch {
    throw new Error("公司後台已登入，但無法寫入這台 Mac 的鑰匙圈。請檢查鑰匙圈權限後重試。");
  }
  if (enteredCode || savedCodeMonth() !== taiwanMonth()) {
    fs.writeFileSync(codeMonthFile, `${JSON.stringify({ month: taiwanMonth() })}\n`, { mode: 0o600 });
  }
  return { ready: true, reused: false };
}

module.exports = { credentialStatus, ensureBackendSession, sessionReady, taiwanMonth };
