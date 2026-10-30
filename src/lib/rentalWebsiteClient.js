import { getIdToken } from "firebase/auth";
import { isRental591Url, rentalWebsiteKey, rentalCheckTime } from "./companyRentalWebsite";

const cache = new Map();
export const RENTAL_WEBSITE_CHECK_INTERVAL = 24 * 60 * 60 * 1000;
export function needsRentalWebsiteCheck(rental, now = Date.now()) {
  const checkedAt = rentalCheckTime(rental.websiteCheckedAt);
  return isRental591Url(rental.websiteUrl) && (rentalWebsiteKey(rental.websiteCheckedUrl) !== rentalWebsiteKey(rental.websiteUrl) || !checkedAt || checkedAt > now || now - checkedAt >= RENTAL_WEBSITE_CHECK_INTERVAL);
}
export async function loadRentalWebsiteInfo(user, url, force = false) {
  const normalized = rentalWebsiteKey(url), key = `${user.uid}:${normalized}`;
  if (!isRental591Url(normalized)) throw new Error("目前只支援自動讀取 591 租屋網址。");
  const cached = cache.get(key);
  if (!force && cached && Date.now() - cached.at < cached.ttl) return cached.promise;
  const entry = { at: Date.now(), ttl: RENTAL_WEBSITE_CHECK_INTERVAL };
  entry.promise = (async () => {
    const token = await getIdToken(user);
    const controller = new AbortController(), timer = setTimeout(() => controller.abort(), 20000);
    try {
      const response = await fetch("/api/rental-website", { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` }, body: JSON.stringify({ url: normalized }), signal: controller.signal });
      if (!response.ok) throw new Error("暫時無法檢查 591 網址，請稍後再試。");
      const info = await response.json();
      if (rentalWebsiteKey(info.url) !== normalized || !["live", "unlisted", "unknown"].includes(info.status) || !Number.isFinite(Date.parse(info.checkedAt || ""))) throw new Error("591 回傳資料暫時無法確認。");
      if (info.status === "unknown") entry.ttl = 60 * 60 * 1000;
      return info;
    } finally { clearTimeout(timer); }
  })();
  if (cache.size > 256) cache.clear();
  cache.set(key, entry);
  try { return await entry.promise; } catch (error) { if (cache.get(key) === entry) cache.delete(key); throw error; }
}
