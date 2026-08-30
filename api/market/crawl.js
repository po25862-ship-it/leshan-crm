const crypto = require("crypto");
const { FieldValue } = require("firebase-admin/firestore");
const { ensureFirebaseAdmin, requireFirebaseUser } = require("../_lib/market-auth");

const PROPERTY_ID = /^[A-Za-z0-9_-]{1,128}$/;
const ALLOWED_HOSTS = new Set(["twhg.com.tw", "www.twhg.com.tw"]);

function validateSourceUrl(value) {
  try {
    const url = new URL(value);
    return url.protocol === "https:" && ALLOWED_HOSTS.has(url.hostname.toLowerCase()) && url.pathname.startsWith("/buy/");
  } catch {
    return false;
  }
}

async function dispatchGithubAction(inputs) {
  const token = process.env.GITHUB_ACTIONS_TOKEN;
  const repository = process.env.GITHUB_ACTIONS_REPOSITORY || "po25862-ship-it/leshan-crm";
  if (!token) throw new Error("GITHUB_ACTIONS_TOKEN is not configured");
  if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repository)) throw new Error("Invalid GitHub repository setting");
  const response = await fetch(`https://api.github.com/repos/${repository}/actions/workflows/market-crawl.yml/dispatches`, {
    method: "POST",
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${token}`,
      "X-GitHub-Api-Version": "2022-11-28",
      "User-Agent": "leshan-crm-market-crawler",
    },
    body: JSON.stringify({ ref: "main", inputs }),
  });
  if (response.status !== 204) {
    const detail = await response.text();
    throw new Error(`GitHub Actions dispatch failed (${response.status}): ${detail.slice(0, 200)}`);
  }
}

function encryptJobPayload(value) {
  const key = Buffer.from(process.env.MARKET_JOB_ENCRYPTION_KEY || "", "base64");
  if (key.length !== 32) throw new Error("MARKET_JOB_ENCRYPTION_KEY must be a base64-encoded 32-byte key");
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const ciphertext = Buffer.concat([cipher.update(JSON.stringify(value), "utf8"), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), ciphertext]).toString("base64url");
}

module.exports = async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ success: false, error: { code: "METHOD_NOT_ALLOWED" } });
  }

  let propertyRef;
  let requestId;
  try {
    const user = await requireFirebaseUser(req);
    const crmPropertyId = String(req.body?.crm_property_id || "");
    const url = String(req.body?.url || "");
    if (!PROPERTY_ID.test(crmPropertyId) || url.length > 2048 || !validateSourceUrl(url)) {
      return res.status(400).json({ success: false, error: { code: "INVALID_REQUEST" } });
    }

    const { firestore } = ensureFirebaseAdmin();
    propertyRef = firestore.collection("properties").doc(crmPropertyId);
    const propertySnapshot = await propertyRef.get();
    if (!propertySnapshot.exists) {
      return res.status(404).json({ success: false, error: { code: "CRM_PROPERTY_NOT_FOUND" } });
    }
    const currentJob = propertySnapshot.data()?.marketCrawl;
    const requestedAt = currentJob?.requestedAt?.toMillis?.() || 0;
    const currentJobTimeout = currentJob?.status === "queued" ? 5 * 60 * 1000 : 45 * 60 * 1000;
    const currentJobIsFresh = Date.now() - requestedAt < currentJobTimeout;
    if (["queued", "running"].includes(currentJob?.status) && currentJobIsFresh) {
      return res.status(409).json({
        success: false,
        error: { code: "CRAWL_ALREADY_RUNNING", message: "這個物件已有掃描工作執行中。" },
      });
    }

    requestId = crypto.randomUUID();
    await propertyRef.update({
      marketCrawl: {
        requestId,
        status: "queued",
        sourceUrl: url,
        requestedByUid: user.uid,
        requestedAt: FieldValue.serverTimestamp(),
      },
    });

    const payload = encryptJobPayload({
      url,
      crm_property_id: crmPropertyId,
      requested_by_uid: user.uid,
      request_id: requestId,
    });
    await dispatchGithubAction({ payload });

    return res.status(202).json({ success: true, queued: true, request_id: requestId });
  } catch (error) {
    console.error("market crawl dispatch failed", error);
    if (propertyRef && requestId) {
      await propertyRef.update({
        "marketCrawl.status": "failed",
        "marketCrawl.error": "無法啟動免費掃描工作，請檢查 GitHub Actions 設定。",
        "marketCrawl.finishedAt": FieldValue.serverTimestamp(),
      }).catch(() => {});
    }
    const status = error.statusCode || 500;
    return res.status(status).json({
      success: false,
      error: { code: status === 401 ? "UNAUTHORIZED" : "ACTION_DISPATCH_FAILED", message: error.message },
    });
  }
};
