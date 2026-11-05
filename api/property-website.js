const { verifyCrmReferenceUser } = require("./_lib/crm-reference-auth");
const { validListingNo, checkOfficialWebsite } = require("./_lib/property-website");

function createHandler({ verifyUser = verifyCrmReferenceUser, checkWebsite = checkOfficialWebsite } = {}) {
  return async function handler(req, res) {
    res.setHeader("Cache-Control", "private, no-store");
    if (req.method !== "POST") { res.setHeader("Allow", "POST"); return res.status(405).json({ error: "method_not_allowed" }); }
    try { await verifyUser(req); } catch { return res.status(401).json({ error: "authentication_required" }); }
    if (Number(req.headers["content-length"] || 0) > 2048) return res.status(413).json({ error: "request_too_large" });
    let body; try { body = typeof req.body === "string" ? JSON.parse(req.body) : req.body; } catch { body = null; }
    if (!validListingNo(body?.listingNo)) return res.status(400).json({ error: "unsupported_listing" });
    try { return res.status(200).json(await checkWebsite(body.listingNo)); }
    catch { return res.status(503).json({ error: "website_check_unavailable" }); }
  };
}
module.exports = createHandler();
module.exports.createHandler = createHandler;
