const { requireFirebaseUser } = require("../_lib/market-auth");
const { referenceQuery, readMarketReference } = require("../_lib/market-reference");

module.exports = async function handler(req, res) {
  res.setHeader("Cache-Control", "private, no-store");
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "method_not_allowed" });
  }
  try {
    await requireFirebaseUser(req);
  } catch (error) {
    const code = /^(?:auth|app)\/[a-z-]+$/.test(String(error.code || "")) ? error.code : "auth_initialization_failed";
    console.warn("market_reference_auth_failed", { code });
    return res.status(error.statusCode || 401).json({ error: "authentication_required" });
  }
  if (Number(req.headers["content-length"] || 0) > 4096) return res.status(413).json({ error: "request_too_large" });
  let body;
  try { body = typeof req.body === "string" ? JSON.parse(req.body) : req.body; } catch { body = null; }
  const query = referenceQuery(body);
  if (!query) return res.status(400).json({ error: "invalid_request" });
  try {
    const token = String(req.headers.authorization).slice(7);
    return res.status(200).json(await readMarketReference(query, token, { refresh: body.refresh === true }));
  } catch (error) {
    console.warn("market_reference_source_failed", { status: Number(error.upstreamStatus) || 0, type: error.name === "TimeoutError" ? "timeout" : "unavailable" });
    return res.status(503).json({ error: "market_reference_unavailable", message: "市場參考暫時無法更新，請確認 Mac 的市場開發程式與網路通道正在運作，再按更新參考。" });
  }
};
