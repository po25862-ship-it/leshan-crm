export const RENTAL_REMINDER_DAYS = 7;
export function rentalCheckTime(value) {
  const time = typeof value === "number" ? value : Date.parse(value || "");
  return Number.isFinite(time) && time >= 0 ? time : null;
}
export function validRentalDay(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value || "")) return false;
  const date = new Date(value + "T00:00:00Z");
  return Number.isFinite(+date) && date.toISOString().slice(0, 10) === value;
}
export function rentalToday(now = Date.now()) {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone: "Asia/Taipei", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date(now));
  const part = type => parts.find(item => item.type === type)?.value;
  return `${part("year")}-${part("month")}-${part("day")}`;
}
export function rentalWebsiteKey(value) {
  try {
    const url = new URL(value);
    if (!["http:", "https:"].includes(url.protocol) || url.username || url.password || url.href.length > 2000) return "";
    const id = url.hostname === "rent.591.com.tw" ? url.pathname.match(/^\/(\d{5,12})\/?$/)?.[1]
      : ["www.591.com.tw", "591.com.tw"].includes(url.hostname) ? url.pathname.match(/^\/rent-detail-(\d{5,12})\.html$/)?.[1] : "";
    if (id && !url.port) return `https://rent.591.com.tw/${id}`;
    url.searchParams.delete("agid"); url.hash = ""; return url.href;
  } catch { return ""; }
}
export const isRental591Url = value => /^https:\/\/rent\.591\.com\.tw\/\d+$/.test(rentalWebsiteKey(value));
export function rentalWebsiteState(rental, now = Date.now()) {
  const key = rentalWebsiteKey(rental.websiteUrl);
  const checked = key && rentalWebsiteKey(rental.websiteCheckedUrl) === key;
  const expiryApplies = rental.websiteExpirySource !== "591" || checked;
  const expired = !!key && expiryApplies && validRentalDay(rental.websiteExpiresOn) && rental.websiteExpiresOn < rentalToday(now);
  const unavailable = !key || rental.websiteUnavailable === true || expired || (checked && rental.websiteCheckStatus === "unlisted");
  return { available: !unavailable, expired, label: unavailable ? "目前無網站" : checked && rental.websiteCheckStatus === "live" ? "網站刊登中" : "網址待確認",
    reason: !key ? "尚未提供物件網址" : rental.websiteUnavailable ? "同事已標記網址失效" : expired ? "已超過刊登到期日" : checked && rental.websiteCheckStatus === "unlisted" ? "已確認網址下架或失效" : "" };
}
export function rentalExpiryReminders(rental, now = Date.now()) {
  if (rental.status !== "available") return [];
  const today = rentalToday(now), reminders = [];
  for (const [kind, date, title] of [["mandate", rental.mandateExpiresOn, "委託"], ["website", rental.websiteExpiresOn, isRental591Url(rental.websiteUrl) ? "591 刊登" : "網站刊登"]]) {
    if (!validRentalDay(date) || (kind === "website" && (!rentalWebsiteKey(rental.websiteUrl) || (rental.websiteExpirySource === "591" && rentalWebsiteKey(rental.websiteCheckedUrl) !== rentalWebsiteKey(rental.websiteUrl))))) continue;
    const days = Math.round((Date.parse(date + "T00:00:00Z") - Date.parse(today + "T00:00:00Z")) / 86400000);
    if (days > RENTAL_REMINDER_DAYS) continue;
    reminders.push({ kind, date, days, tone: days < 0 ? "danger" : "warning", label: days < 0 ? `${title}已到期 ${-days} 天` : days === 0 ? `${title}今天到期` : `${title}剩 ${days} 天到期` });
  }
  return reminders;
}
export function rentalWebsitePatch(rental, info, { overwriteExpiry = false } = {}) {
  if (!["live", "unlisted"].includes(info?.status) || !Number.isFinite(Date.parse(info?.checkedAt || "")) || rentalWebsiteKey(info.url) !== rentalWebsiteKey(rental.websiteUrl) || !rentalWebsiteKey(info.url)) return null;
  if (rentalWebsiteKey(rental.websiteCheckedUrl) === rentalWebsiteKey(info.url) && (rentalCheckTime(rental.websiteCheckedAt) || 0) > Date.parse(info.checkedAt)) return null;
  const patch = { websiteCheckStatus: info.status, websiteCheckedUrl: rentalWebsiteKey(info.url), websiteCheckedAt: Date.parse(info.checkedAt) };
  if (validRentalDay(info.expiresOn) && (overwriteExpiry || !rental.websiteExpiresOn || rental.websiteExpirySource === "591")) {
    patch.websiteExpiresOn = info.expiresOn; patch.websiteExpirySource = "591";
  }
  return patch;
}
