let cachedToken = null;
let tokenExpiresAt = 0;

async function googleAccessToken() {
  if (cachedToken && Date.now() < tokenExpiresAt - 60_000) return cachedToken;
  const required = ["GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET", "GOOGLE_REFRESH_TOKEN"];
  const missing = required.filter((name) => !process.env[name]);
  if (missing.length) throw new Error(`Missing Google Drive secrets: ${missing.join(", ")}`);

  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: process.env.GOOGLE_CLIENT_ID,
      client_secret: process.env.GOOGLE_CLIENT_SECRET,
      refresh_token: process.env.GOOGLE_REFRESH_TOKEN,
      grant_type: "refresh_token",
    }),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || !payload.access_token) throw new Error("Unable to refresh Google Drive access token");
  cachedToken = payload.access_token;
  tokenExpiresAt = Date.now() + Number(payload.expires_in || 3600) * 1000;
  return cachedToken;
}

async function downloadDriveFile(fileId) {
  return fetch(`https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}?alt=media`, {
    headers: { Authorization: `Bearer ${await googleAccessToken()}`, Accept: "image/*" },
  });
}

module.exports = { downloadDriveFile };
