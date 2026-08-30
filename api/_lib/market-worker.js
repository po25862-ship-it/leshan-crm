function workerBaseUrl() {
  const raw = String(process.env.CRAWLER_WORKER_URL || "").replace(/\/$/, "");
  if (!raw) throw new Error("CRAWLER_WORKER_URL is not configured");
  const url = new URL(raw);
  const local = ["localhost", "127.0.0.1"].includes(url.hostname);
  if (url.protocol !== "https:" && !(process.env.NODE_ENV !== "production" && local)) {
    throw new Error("CRAWLER_WORKER_URL must use HTTPS");
  }
  return raw;
}

async function callWorker(path, options = {}) {
  const token = process.env.CRAWLER_INTERNAL_TOKEN;
  if (!token) throw new Error("CRAWLER_INTERNAL_TOKEN is not configured");
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), Number(options.timeoutMs || 280000));
  try {
    const response = await fetch(`${workerBaseUrl()}${path}`, {
      ...options,
      signal: controller.signal,
      headers: {
        "Content-Type": "application/json",
        "X-Leshan-Internal-Token": token,
        ...(options.headers || {}),
      },
    });
    return response;
  } finally {
    clearTimeout(timeout);
  }
}

module.exports = { callWorker };
