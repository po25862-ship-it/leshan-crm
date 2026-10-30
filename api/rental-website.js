const { verifyCrmReferenceUser } = require("./_lib/crm-reference-auth");
const { rental591Url, checkRentalWebsite } = require("./_lib/rental-website");

function createHandler({ verifyUser = verifyCrmReferenceUser, checkWebsite = checkRentalWebsite } = {}) {
  return async function handler(req, res) {
    res.setHeader("Cache-Control", "private, no-store");
    if (req.method !== "POST") { res.setHeader("Allow", "POST"); return res.status(405).json({ error: "method_not_allowed" }); }
    try { await verifyUser(req); } catch { return res.status(401).json({ error: "authentication_required" }); }
    if (Number(req.headers["content-length"] || 0) > 4096) return res.status(413).json({ error: "request_too_large" });
    let body; try { body = typeof req.body === "string" ? JSON.parse(req.body) : req.body; } catch { body = null; }
    const url = typeof body?.url === "string" && body.url.length <= 2000 ? rental591Url(body.url) : "";
    if (!url) return res.status(400).json({ error: "unsupported_url" });
    try { return res.status(200).json(await checkWebsite(url)); }
    catch { console.warn("rental_website_check_failed", { code: "source_unavailable" }); return res.status(503).json({ error: "website_check_unavailable" }); }
  };
}
module.exports = createHandler();
module.exports.createHandler = createHandler;
