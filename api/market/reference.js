const { referenceQuery, readMarketReference } = require("../_lib/market-reference");
const { verifyCrmReferenceUser } = require("../_lib/crm-reference-auth");

function createHandler({ verifyUser = verifyCrmReferenceUser, readReference = readMarketReference } = {}) {
  return async function handler(req, res) {
    res.setHeader("Cache-Control", "private, no-store");
    if (req.method !== "POST") {
      res.setHeader("Allow", "POST");
      return res.status(405).json({ error: "method_not_allowed" });
    }
    try {
      await verifyUser(req);
    } catch {
      console.warn("market_reference_auth_failed", { code: "firebase_identity_or_account_rejected" });
      return res.status(401).json({ error: "authentication_required" });
    }
    if (Number(req.headers["content-length"] || 0) > 4096) return res.status(413).json({ error: "request_too_large" });
    let body;
    try { body = typeof req.body === "string" ? JSON.parse(req.body) : req.body; } catch { body = null; }
    const query = referenceQuery(body);
    if (!query) return res.status(400).json({ error: "invalid_request" });
    try {
      // Verify every request, including revoked/disabled accounts, even when the
      // decoded snapshot is already warm in this server instance.
      return res.status(200).json(await readReference(query));
    } catch (error) {
      console.warn("market_reference_source_failed", { code: "cloud_snapshot_unavailable" });
      return res.status(503).json({ error: "market_reference_unavailable", message: "雲端行情資料暫時無法讀取，請稍後按「更新參考」重試。" });
    }
  };
}
module.exports = createHandler();
module.exports.createHandler = createHandler;
