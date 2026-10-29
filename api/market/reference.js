const { referenceQuery, readMarketReference } = require("../_lib/market-reference");

module.exports = async function handler(req, res) {
  res.setHeader("Cache-Control", "private, no-store");
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "method_not_allowed" });
  }
  const authorization = String(req.headers.authorization || "");
  if (!authorization.startsWith("Bearer ") || authorization.length < 20 || authorization.length > 9000) {
    return res.status(401).json({ error: "authentication_required" });
  }
  if (Number(req.headers["content-length"] || 0) > 4096) return res.status(413).json({ error: "request_too_large" });
  let body;
  try { body = typeof req.body === "string" ? JSON.parse(req.body) : req.body; } catch { body = null; }
  const query = referenceQuery(body);
  if (!query) return res.status(400).json({ error: "invalid_request" });
  try {
    // The source verifies Google's signature, audience, issuer, subject and
    // expiry for this existing CRM login on every request. No admin key needed.
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
