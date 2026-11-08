const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");
const os = require("os");
const { planRetention, applyRetention, canClean } = require("./report-retention");

const now = new Date("2026-11-09T08:00:00+08:00");
const success = { ok: true, running: false, phase: "complete", lastSuccessAt: "2026-11-09T07:40:00+08:00" };
function fixture(t) {
  const directory = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "leshan-retention-test-")));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const root = path.join(directory, "runs");
  const trashRoot = path.join(directory, "trash");
  fs.mkdirSync(root);
  const put = (name, content = "report") => {
    const file = path.join(root, name);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, content);
    return file;
  };
  return { directory, root, trashRoot, put, roots: [{ label: "本機", directory: root }] };
}

test("保留 30／90 天及一個曆年的邊界；只整理指定檔名", (t) => {
  const f = fixture(t);
  const removed = ["2026-10-09/raw-64/report.xls", "2026-08-10/CRM同步前備份_2026-08-10.json", "2025-11-08/物件總表_匯出_2025-11-08.xlsx"];
  const kept = ["2026-10-10/raw-64/report.xls", "2026-08-11/CRM同步前備份_2026-08-11.json", "2025-11-09/物件總表_匯出_2025-11-09.xlsx",
    "2026-10-09/物件總表_匯出_2026-10-09.xlsx", "2026-11-09/raw-details/today.html", "2026-11-10/raw-64/future.xls",
    "2025-11-08/照片/photo.jpg", "2025-11-08/格局圖/floor.jpg", "2025-11-08/人工備註.txt", "latest-snapshot.json",
    "2025-02-30/raw-64/invalid.xls", "2025-11-08/CRM同步前備份_2026-11-09.json"];
  [...removed, ...kept].forEach((name) => f.put(name));
  const plan = planRetention(f.roots, now);
  assert.equal(plan.entries.length, 3);
  assert.equal(plan.errors.length, 0);
  const result = applyRetention(plan, { state: success, now, trashRoot: f.trashRoot });
  assert.equal(result.movedCount, 3);
  for (const name of removed) assert.equal(fs.existsSync(path.join(f.root, name)), false);
  for (const name of kept) assert.equal(fs.existsSync(path.join(f.root, name)), true, name);
});

test("失敗、未完成、昨天成功或未來的成功時間，都不搬動檔案", (t) => {
  const f = fixture(t);
  const file = f.put("2026-10-01/raw-64/report.xls");
  const plan = planRetention(f.roots, now);
  for (const state of [{}, { ...success, ok: false }, { ...success, running: true }, { ...success, phase: "exporting" },
    { ...success, lastSuccessAt: "2026-11-08T08:00:00+08:00" }, { ...success, lastSuccessAt: "2026-11-10T08:00:00+08:00" }]) {
    assert.equal(canClean(state, now), false);
    assert.equal(applyRetention(plan, { state, now, trashRoot: f.trashRoot }).skipped, true);
    assert.equal(fs.existsSync(file), true);
    assert.equal(fs.existsSync(f.trashRoot), false);
  }
});

test("預覽不寫檔；搬移附原始位置與完整內容，可依清單還原；重跑不重複", (t) => {
  const f = fixture(t);
  const original = f.put("2026-09-01/raw-details/DE02500001.html", "complete original body");
  const plan = planRetention(f.roots, now);
  assert.equal(fs.existsSync(f.trashRoot), false);
  assert.equal(fs.readFileSync(original, "utf8"), "complete original body");
  const result = applyRetention(plan, { state: success, now, trashRoot: f.trashRoot });
  const manifest = JSON.parse(fs.readFileSync(path.join(result.trashDirectory, "還原清單.json")));
  assert.equal(manifest.entries[0].source, path.dirname(original));
  assert.equal(manifest.entries[0].status, "moved");
  assert.equal(fs.readFileSync(path.join(manifest.entries[0].target, path.basename(original)), "utf8"), "complete original body");
  assert.equal(planRetention(f.roots, now).entries.length, 0);
  fs.renameSync(manifest.entries[0].target, manifest.entries[0].source);
  assert.equal(fs.readFileSync(original, "utf8"), "complete original body");
});

test("本機與 Drive 分組、重複根目錄不重算，日期或目標連結不跟隨", (t) => {
  const f = fixture(t);
  f.put("2026-09-01/raw-64/report.xls");
  const drive = path.join(f.directory, "drive");
  fs.mkdirSync(path.join(drive, "2026-09-01", "raw-64"), { recursive: true });
  fs.writeFileSync(path.join(drive, "2026-09-01", "raw-64", "report.xls"), "drive report");
  const external = path.join(f.directory, "external");
  fs.mkdirSync(external);
  fs.writeFileSync(path.join(external, "keep.txt"), "untouched");
  fs.symlinkSync(external, path.join(f.root, "2026-09-02"));
  fs.mkdirSync(path.join(f.root, "2026-09-03"));
  fs.symlinkSync(external, path.join(f.root, "2026-09-03", "raw-details"));
  const plan = planRetention([...f.roots, { label: "重複", directory: f.root }, { label: "GoogleDrive", directory: drive }], now);
  assert.equal(plan.entries.length, 2);
  const result = applyRetention(plan, { state: success, now, trashRoot: f.trashRoot });
  assert.equal(result.movedCount, 2);
  assert.equal(fs.readFileSync(path.join(external, "keep.txt"), "utf8"), "untouched");
  assert.equal(fs.existsSync(path.join(result.trashDirectory, "本機", "2026-09-01", "raw-64", "report.xls")), true);
  assert.equal(fs.existsSync(path.join(result.trashDirectory, "GoogleDrive", "2026-09-01", "raw-64", "report.xls")), true);
});

test("預覽後被修改的檔案保留，錯誤寫入還原清單", (t) => {
  const f = fixture(t);
  const file = f.put("2026-08-01/CRM同步前備份_2026-08-01.json", "old");
  const plan = planRetention(f.roots, now);
  fs.utimesSync(file, new Date(), new Date("2027-01-01T00:00:00Z"));
  const result = applyRetention(plan, { state: success, now, trashRoot: f.trashRoot });
  assert.equal(result.movedCount, 0);
  assert.equal(result.errors.length, 1);
  assert.equal(fs.readFileSync(file, "utf8"), "old");
});

test("Drive 使用原生垃圾桶並記錄實際還原位置，不跨 File Provider 下載舊檔", (t) => {
  const f = fixture(t);
  f.put("2026-09-01/raw-64/report.xls", "cloud original");
  const nativeTarget = path.join(f.directory, "provider-trash", "raw-64");
  fs.mkdirSync(path.dirname(nativeTarget));
  const progress = [];
  const plan = planRetention([{ label: "GoogleDrive", directory: f.root }], now);
  let calls = 0;
  const result = applyRetention(plan, { state: success, now, trashRoot: f.trashRoot, useNativeTrash: true,
    onProgress: (status) => progress.push(status), moveNative: (source) => {
      calls += 1;
      fs.renameSync(source, nativeTarget);
      return { target: nativeTarget, nativeOutput: "native success" };
    } });
  assert.equal(calls, 1);
  assert.equal(result.movedCount, 1);
  const entry = JSON.parse(fs.readFileSync(path.join(result.trashDirectory, "還原清單.json"))).entries[0];
  assert.equal(entry.target, nativeTarget);
  assert.equal(entry.trashMethod, "native");
  assert.equal(entry.status, "moved");
  assert.equal(progress.at(-1).movedCount, 1);
  fs.renameSync(entry.target, entry.source);
  assert.equal(fs.readFileSync(path.join(entry.source, "report.xls"), "utf8"), "cloud original");
});
