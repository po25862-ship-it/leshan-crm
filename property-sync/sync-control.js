const fs = require("fs");
const path = require("path");
const { spawn, execFileSync } = require("child_process");
const { DownloadError } = require("./download");

function readJson(file, fallback = {}) {
  try { return JSON.parse(fs.readFileSync(file, "utf8")); }
  catch { return fallback; }
}

function createStore(directory) {
  const file = path.join(directory, "sync-status.json");
  const lock = path.join(directory, "sync.run.lock");
  const lockedCommand = (command, args = []) => {
    fs.mkdirSync(directory, { recursive: true });
    // Keep the inode: the kernel lock, not the file's existence, excludes other runs.
    return { command: "/usr/bin/lockf", args: ["-k", "-s", "-t", "0", lock, command, ...args] };
  };
  return {
    read: () => readJson(file),
    write: (state) => {
      fs.mkdirSync(directory, { recursive: true });
      const temporary = `${file}.${process.pid}.tmp`;
      fs.writeFileSync(temporary, `${JSON.stringify(state, null, 2)}\n`, { mode: 0o600 });
      fs.renameSync(temporary, file);
    },
    lockedCommand,
    busy: () => {
      const probe = lockedCommand("/usr/bin/true");
      try { execFileSync(probe.command, probe.args, { stdio: "ignore" }); return false; }
      catch (error) { if (error.status === 75) return true; throw error; }
    },
  };
}

function taipeiDay(date = new Date()) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Taipei" }).format(date);
}

function scheduleDecision({ now = new Date(), state = {}, busy = false, snapshotAt } = {}) {
  const cutoff = Date.parse(`${taipeiDay(now)}T07:30:00+08:00`);
  if (now.getTime() < cutoff) return { run: false, reason: "尚未到今天 07:30" };
  if (busy) return { run: false, reason: "同步已在執行中" };
  const success = Date.parse(state.lastSuccessStartedAt || state.lastSuccessAt || snapshotAt || "");
  if (success >= cutoff) return { run: false, reason: "今日物件已更新" };
  // Never automatically replay a possibly partial CRM write in the same day.
  if (Date.parse(state.startedAt || "") >= cutoff && state.ok !== true && state.retryable === false) {
    return { run: false, reason: "這次失敗需要確認，請查看同步工具" };
  }
  return { run: true, reason: state.startedAt ? "補跑今日同步" : "開始今日同步" };
}

async function managedSync(task, { store, now = () => new Date(), keepAwake = true, trigger = "manual", onError = console.error }) {
  const previous = store.read();
  let state = {
    startedAt: now().toISOString(), pid: process.pid, trigger, running: true, ok: null,
    phase: "downloading", retryable: true, message: "正在下載最新物件",
    lastSuccessAt: previous.lastSuccessAt, lastSuccessStartedAt: previous.lastSuccessStartedAt,
  };
  let awake;
  const update = (patch) => { state = { ...state, ...patch }; store.write(state); };
  try {
    update({});
    if (keepAwake) {
      awake = spawn("/usr/bin/caffeinate", ["-i", "-w", String(process.pid)], { stdio: "ignore" });
      awake.on("error", () => {});
    }
    await task(update);
    update({ running: false, ok: true, phase: "complete", retryable: false,
      finishedAt: now().toISOString(), lastSuccessAt: now().toISOString(),
      lastSuccessStartedAt: state.startedAt, message: "物件同步成功" });
    return 0;
  } catch (error) {
    const retryable = state.phase === "downloading" && error instanceof DownloadError && error.retryable;
    update({ running: false, ok: false, retryable, finishedAt: now().toISOString(),
      message: retryable ? "下載暫時失敗，將每 15 分鐘檢查補跑；尚未寫入 CRM。"
        : state.phase === "exporting" ? "CRM 已更新，報表輸出失敗，請查看同步紀錄。"
          : "同步失敗，請查看紀錄或確認登入資料後再試。" });
    onError(error.stack || error.message);
    return retryable ? 75 : 1;
  } finally {
    if (awake) awake.kill();
  }
}

module.exports = { createStore, readJson, taipeiDay, scheduleDecision, managedSync };
