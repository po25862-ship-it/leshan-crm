const { referenceQuery, readMarketReference } = require("../_lib/market-reference");
const { verifyCrmReferenceUser } = require("../_lib/crm-reference-auth");

module.exports = async function handler(req, res) {
  res.setHeader("Cache-Control", "private, no-store");
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "method_not_allowed" });
  }
  const authorization = String(req.headers.authorization || "");
  try {
    await verifyCrmReferenceUser(req);
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
    // The source additionally verifies the token; main API verification above
    // must always succeed first, including revocation and disabled accounts.
    const token = authorization.slice(7);
    return res.status(200).json(await readMarketReference(query, token));
  } catch (error) {
    if (error.upstreamStatus === 401) {
      console.warn("market_reference_auth_failed", { code: "source_rejected_identity" });
      return res.status(401).json({ error: "authentication_required" });
    }
    console.warn("market_reference_source_failed", { status: Number(error.upstreamStatus) || 0, type: error.name === "TimeoutError" ? "timeout" : "unavailable" });
    return res.status(503).json({ error: "market_reference_unavailable", message: "市場參考暫時無法更新，請確認 Mac 的市場開發程式與網路通道正在運作，再按更新參考。" });
  }
};
