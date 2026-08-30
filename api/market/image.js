const { requireFirebaseUser } = require("../_lib/market-auth");
const { downloadDriveFile } = require("../_lib/google-drive");

const DRIVE_FILE_ID = /^[A-Za-z0-9_-]{10,200}$/;

module.exports = async function handler(req, res) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ error: "method_not_allowed" });
  }
  try {
    await requireFirebaseUser(req);
    const fileId = String(req.query.file_id || "");
    if (!DRIVE_FILE_ID.test(fileId)) return res.status(400).json({ error: "invalid_file_id" });
    const response = await downloadDriveFile(fileId);
    if (!response.ok) return res.status(response.status === 404 ? 404 : 502).json({ error: "image_unavailable" });
    const bytes = Buffer.from(await response.arrayBuffer());
    res.setHeader("Content-Type", response.headers.get("content-type") || "application/octet-stream");
    res.setHeader("Cache-Control", "private, max-age=300");
    return res.status(200).send(bytes);
  } catch (error) {
    const status = error.statusCode || 500;
    return res.status(status).json({ error: status === 401 ? "unauthorized" : "image_proxy_failed" });
  }
};
