const fs = require("fs");
const path = require("path");
const { spawn } = require("child_process");
const { randomUUID } = require("crypto");
const { setTimeout: sleep } = require("timers/promises");

class DownloadError extends Error {
  constructor(message, retryable = false) {
    super(message);
    this.name = "DownloadError";
    this.retryable = retryable;
  }
}

function transientFailure(code, httpStatus) {
  if (httpStatus >= 400) return [408, 425, 429].includes(httpStatus) || httpStatus >= 500;
  return [5, 6, 7, 18, 28, 35, 52, 55, 56, 92].includes(code);
}

function curlAttempt(args, timeoutMs, { command = "curl", commandPrefix = [] } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, [...commandPrefix, ...args, "--write-out", "%{http_code}"], {
      stdio: ["ignore", "pipe", "pipe"],
    });
    let output = "";
    let timedOut = false;
    // Bound each attempt separately. Curl's own timeout is the first line of defence.
    const timer = setTimeout(() => { timedOut = true; child.kill("SIGKILL"); }, timeoutMs);
    child.stdout.on("data", (chunk) => { output = (output + chunk).slice(-16); });
    // Do not put request arguments, credentials or response bodies in errors/logs.
    child.stderr.resume();
    child.once("error", () => { clearTimeout(timer); reject(new DownloadError("無法啟動下載工具")); });
    child.once("close", (code) => {
      clearTimeout(timer);
      const status = Number(output.trim());
      if (code === 0 && !timedOut) return resolve();
      const retryable = timedOut || transientFailure(code, status);
      const reason = timedOut || code === 28 ? "下載逾時" : status >= 400 ? `網站回應 ${status}` : `下載連線失敗（${code}）`;
      reject(new DownloadError(reason, retryable));
    });
  });
}

async function download(args, {
  attempts = 4, delays = [5000, 15000, 30000], wait = sleep,
  onRetry = console.warn, validate, timeoutMs, command, commandPrefix,
} = {}) {
  const cleaned = [];
  for (let i = 0; i < args.length; i += 1) {
    if (args[i] === "--retry") { i += 1; continue; }
    cleaned.push(args[i]);
  }
  const outputIndex = cleaned.indexOf("--output") + 1;
  if (!outputIndex || !cleaned[outputIndex]) throw new DownloadError("下載缺少輸出檔案");
  const destination = cleaned[outputIndex];
  const maxTimeIndex = cleaned.indexOf("--max-time") + 1;
  const maxTime = maxTimeIndex ? Number(cleaned[maxTimeIndex]) : 40;
  if (!maxTimeIndex) cleaned.push("--max-time", "40");
  if (!cleaned.includes("--connect-timeout")) cleaned.push("--connect-timeout", "10");
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    const temporary = `${destination}.download-${process.pid}-${randomUUID()}`;
    const request = [...cleaned];
    request[outputIndex] = temporary;
    try {
      await curlAttempt(request, timeoutMs ?? (maxTime * 1000 + 5000), { command, commandPrefix });
      if (validate) validate(temporary);
      fs.renameSync(temporary, destination);
      return;
    } catch (error) {
      if (!(error instanceof DownloadError) || !error.retryable || attempt === attempts) throw error;
      const delay = delays[Math.min(attempt - 1, delays.length - 1)] ?? 0;
      onRetry(`${path.basename(destination)}：${error.message}，${delay / 1000} 秒後重試（${attempt}/${attempts - 1}）`);
      await wait(delay);
    } finally {
      fs.rmSync(temporary, { force: true });
    }
  }
}

module.exports = { download, DownloadError, transientFailure };
