const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");
const os = require("os");
const { spawn, spawnSync } = require("child_process");
const { DownloadError } = require("./download");
const { createStore, scheduleDecision, managedSync } = require("./sync-control");

const morning = new Date("2026-11-09T07:30:00+08:00");
function temporary(t) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "leshan-sync-test-"));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  return directory;
}

test("07:30 前不跑；錯過排程、失敗或下載中斷後補跑；成功與忙碌時不重複", () => {
  assert.equal(scheduleDecision({ now: new Date("2026-11-09T07:29:59+08:00") }).run, false);
  assert.equal(scheduleDecision({ now: morning }).run, true);
  assert.equal(scheduleDecision({ now: morning, snapshotAt: "2026-11-09T00:12:00+08:00" }).run, true);
  assert.equal(scheduleDecision({ now: morning, busy: true }).run, false);
  const failed = { startedAt: morning.toISOString(), retryable: true, ok: false };
  assert.equal(scheduleDecision({ now: morning, state: failed }).run, true);
  assert.equal(scheduleDecision({ now: morning, state: { ...failed, running: true } }).run, true);
  assert.equal(scheduleDecision({ now: morning, state: { lastSuccessAt: morning.toISOString() } }).run, false);
  // A run started before 07:30 does not replace the morning refresh.
  assert.equal(scheduleDecision({ now: morning, state: {
    lastSuccessStartedAt: "2026-11-09T06:00:00+08:00", lastSuccessAt: "2026-11-09T07:30:00+08:00",
  } }).run, true);
  assert.equal(scheduleDecision({ now: new Date("2026-11-10T08:00:00+08:00"),
    state: { lastSuccessAt: morning.toISOString() } }).run, true);
});

test("下載逾時不進入 CRM；狀態重開後保留；下次成功只寫入一次", async (t) => {
  const directory = temporary(t);
  const store = createStore(directory);
  const options = { store, now: () => morning, keepAwake: false, onError: () => {} };
  let writes = 0;
  assert.equal(await managedSync(async () => { throw new DownloadError("timeout", true); }, options), 75);
  const recovered = createStore(directory);
  assert.equal(recovered.read().retryable, true);
  assert.equal(recovered.busy(), false);
  assert.equal(scheduleDecision({ now: morning, state: recovered.read() }).run, true);
  assert.equal(await managedSync(async (update) => {
    update({ phase: "applying", retryable: false });
    writes += 1;
  }, options), 0);
  assert.equal(writes, 1);
  assert.equal(scheduleDecision({ now: morning, state: recovered.read() }).run, false);
});

test("開始寫 CRM 後發生錯誤，不自動重播可能已部分寫入的批次", async (t) => {
  const store = createStore(temporary(t));
  const code = await managedSync(async (update) => {
    update({ phase: "applying", retryable: false });
    throw new DownloadError("not safe to replay", true);
  }, { store, now: () => morning, keepAwake: false, onError: () => {} });
  assert.equal(code, 1);
  assert.equal(store.read().retryable, false);
  assert.equal(scheduleDecision({ now: morning, state: store.read() }).run, false);
});

test("CRM 寫完但輸出 Excel 失敗，當天不重寫 CRM", async (t) => {
  const store = createStore(temporary(t));
  await managedSync(async (update) => {
    update({ phase: "exporting", retryable: false, lastSuccessAt: morning.toISOString(), lastSuccessStartedAt: morning.toISOString() });
    throw new Error("disk full");
  }, { store, now: () => morning, keepAwake: false, onError: () => {} });
  assert.equal(scheduleDecision({ now: morning, state: store.read() }).run, false);
  assert.match(store.read().message, /CRM 已更新/);
});

test("手動與排程跨程序共用鎖；程序中斷後保留鎖檔仍可恢復", async (t) => {
  const directory = temporary(t);
  const store = createStore(directory);
  const locked = store.lockedCommand(process.execPath, ["-e", "console.log(process.pid);setTimeout(()=>{},30000)"]);
  const holder = spawn(locked.command, locked.args);
  let pid;
  t.after(() => { if (pid) { try { process.kill(pid, "SIGKILL"); } catch {} } });
  const closed = new Promise((resolve) => holder.once("close", resolve));
  pid = await new Promise((resolve) => holder.stdout.once("data", (data) => resolve(Number(String(data).trim()))));
  assert.equal(store.busy(), true);
  const contender = store.lockedCommand(process.execPath, ["-e", "process.exit(99)"]);
  assert.equal(spawnSync(contender.command, contender.args).status, 75);
  process.kill(pid, "SIGKILL");
  await closed;
  pid = undefined;
  assert.equal(fs.existsSync(path.join(directory, "sync.run.lock")), true);
  assert.equal(store.busy(), false);
  const recovered = store.lockedCommand(process.execPath, ["-e", "process.exit(0)"]);
  assert.equal(spawnSync(recovered.command, recovered.args).status, 0);
});
