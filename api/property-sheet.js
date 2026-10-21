const { Readable } = require("stream");
const { pipeline } = require("stream/promises");
const { requireFirebaseUser } = require("./_lib/market-auth");
const { validatePropertySheetUrl } = require("./_lib/property-sheet-url");

module.exports = async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "method_not_allowed" });
  }
  try {
    await requireFirebaseUser(req);
    const url = validatePropertySheetUrl(req.body?.url);
    if (!url) return res.status(400).json({ error: "invalid_property_sheet_url" });

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 30000);
    try {
      const upstream = await fetch(url, { signal: controller.signal });
      if (!upstream.ok || !upstream.body) {
        return res.status(upstream.status === 404 ? 404 : 502).json({ error: "property_sheet_unavailable" });
      }
      res.setHeader("Content-Type", upstream.headers.get("content-type") || "application/octet-stream");
      res.setHeader("Cache-Control", "private, no-store");
      res.setHeader("X-Content-Type-Options", "nosniff");
      await pipeline(Readable.fromWeb(upstream.body), res);
      return undefined;
    } finally {
      clearTimeout(timeout);
    }
  } catch (error) {
    if (res.headersSent) {
      res.destroy(error);
      return undefined;
    }
    const status = error.statusCode || 502;
    return res.status(status).json({ error: status === 401 ? "unauthorized" : "property_sheet_unavailable" });
  }
};
