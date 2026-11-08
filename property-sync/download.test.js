const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const os = require("os");
const path = require("path");
const http = require("http");
const { download, DownloadError } = require("./download");

function temporary(t) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "leshan-download-test-"));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  return directory;
}

test("真實 HTTP 503 自動重試，成功前不覆蓋原檔，成功後只保留完整檔案", async (t) => {
  const directory = temporary(t);
  const output = path.join(directory, "report.xls");
  fs.writeFileSync(output, "previous");
  let calls = 0;
  const server = http.createServer((req, res) => {
    calls += 1;
    res.writeHead(calls < 3 ? 503 : 200);
    res.end(calls < 3 ? "partial error body" : "complete report");
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  t.after(() => server.close());
  const retries = [];
  await download(["--fail-with-body", "--silent", "--output", output, `http://127.0.0.1:${server.address().port}/report`], {
    delays: [0], onRetry: (message) => retries.push(message),
    wait: async () => { assert.equal(fs.readFileSync(output, "utf8"), "previous"); },
  });
  assert.equal(calls, 3);
  assert.equal(retries.length, 2);
  assert.equal(fs.readFileSync(output, "utf8"), "complete report");
  assert.deepEqual(fs.readdirSync(directory), ["report.xls"]);
});

test("每次下載各自計時：卡住後可重開下載，三次失敗才交給排程補跑", async (t) => {
  const directory = temporary(t);
  const fixture = path.join(directory, "curl-fixture.cjs");
  const counter = path.join(directory, "counter");
  const output = path.join(directory, "report.xls");
  fs.writeFileSync(fixture, `
    const fs = require('fs');
    const counter = process.argv[2];
    const limit = Number(process.argv[3]);
    const count = Number(fs.existsSync(counter) ? fs.readFileSync(counter, 'utf8') : 0) + 1;
    fs.writeFileSync(counter, String(count));
    fs.writeFileSync(process.argv[process.argv.indexOf('--output') + 1], count < limit ? 'partial' : 'complete');
    if (count < limit) setTimeout(() => {}, 30000);
    else process.stdout.write('200');
  `);
  const options = { command: process.execPath, commandPrefix: [fixture, counter, "3"], timeoutMs: 250,
    delays: [0], onRetry: () => {} };
  await download(["--output", output], options);
  assert.equal(fs.readFileSync(counter, "utf8"), "3");
  assert.equal(fs.readFileSync(output, "utf8"), "complete");
  fs.writeFileSync(counter, "0");
  await assert.rejects(download(["--output", output], {
    ...options, attempts: 2, commandPrefix: [fixture, counter, "99"],
  }), (error) => error instanceof DownloadError && error.retryable);
  assert.equal(fs.readFileSync(counter, "utf8"), "2");
  assert.equal(fs.readFileSync(output, "utf8"), "complete");
  assert.equal(fs.readdirSync(directory).some((name) => name.includes(".download-")), false);
});

test("404 與內容驗證失敗不無限重試，也不把錯誤網頁當報表", async (t) => {
  const directory = temporary(t);
  const output = path.join(directory, "report.xls");
  let calls = 0;
  const server = http.createServer((req, res) => {
    calls += 1;
    res.writeHead(req.url === "/missing" ? 404 : 200);
    res.end("not a report");
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  t.after(() => server.close());
  const args = ["--fail", "--silent", "--output", output];
  await assert.rejects(download([...args, `http://127.0.0.1:${server.address().port}/missing`]),
    (error) => error instanceof DownloadError && !error.retryable);
  assert.equal(calls, 1);
  await assert.rejects(download([...args, `http://127.0.0.1:${server.address().port}/login`], {
    validate: () => { throw new Error("bad report"); },
  }), /bad report/);
  assert.equal(calls, 2);
  assert.deepEqual(fs.readdirSync(directory), []);
});
