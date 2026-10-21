const STORAGE_HOST = "firebasestorage.googleapis.com";
const BUCKET = "leshan-crm.firebasestorage.app";

function validatePropertySheetUrl(value) {
  let url;
  try {
    url = new URL(value);
  } catch {
    return null;
  }
  if (url.protocol !== "https:" || url.hostname !== STORAGE_HOST || url.port || url.username || url.password || url.hash) return null;
  let path;
  try {
    path = decodeURIComponent(url.pathname);
  } catch {
    return null;
  }
  const prefix = `/v0/b/${BUCKET}/o/properties/`;
  if (!path.startsWith(prefix)) return null;
  const objectPath = path.slice(prefix.length);
  if (!/^[A-Za-z0-9_-]+\/sheets\/[^/]+$/.test(objectPath)) return null;
  if (url.searchParams.get("alt") !== "media" || !/^[A-Za-z0-9-]{10,200}$/.test(url.searchParams.get("token") || "")) return null;
  return url.toString();
}

module.exports = { validatePropertySheetUrl };
