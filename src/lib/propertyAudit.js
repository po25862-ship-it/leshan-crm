import { propertyWebsiteStatus } from "./propertyWebsite";

export const AUDIT_STORE = "捷運樂善直營店";
export const AUDIT_FIELDS = [
  { key: "mandate", label: "委託書" },
  { key: "titleSeal", label: "產權封條" },
  { key: "website", label: "官網已核對" },
  { key: "countersign", label: "回簽" },
];
const text = value => String(value ?? "").normalize("NFKC").trim();
export const isAuditStore = row => [AUDIT_STORE, "捷運樂善店"].includes(text(row?.store).replace(/\s/g, ""));
export const auditPrice = value => { const n = Number(text(value).replace(/,/g, "")); return text(value) && Number.isFinite(n) && n > 0 ? n : null; };
export const auditMoney = row => auditPrice(row.totalPrice) === null ? "待補價格" : `${auditPrice(row.totalPrice).toLocaleString("zh-TW", { maximumFractionDigits: 2 })} 萬`;
export const auditStatusLabel = status => ({ active: "在售", onHold: "暫時不賣", sold: "已售出" }[status || "active"] || "其他狀態");
export const auditWebsiteLabel = row => ({ published: "已上架", unpublished: "未上架", unknown: "待確認" }[propertyWebsiteStatus(row)]);
export function auditWebsiteUrl(row) {
  try { const url = new URL(row.websiteUrl); return ["http:", "https:"].includes(url.protocol) ? url.href : ""; } catch { return ""; }
}
export function auditFingerprint(row, key) {
  if (!AUDIT_FIELDS.some(field => field.key === key)) throw new Error("核對欄位不正確。");
  const identity = [text(row.listingNo).toUpperCase(), text(row.address).replace(/\s/g, "")];
  if (key === "titleSeal") return JSON.stringify(identity);
  const values = [...identity, text(row.title), auditPrice(row.totalPrice)];
  if (key === "website") { const url = auditWebsiteUrl(row); values.push(propertyWebsiteStatus(row), url ? url.split(/[?#]/)[0] : ""); }
  return JSON.stringify(values);
}
export function auditCheckState(row, key) {
  const stored = row.auditChecklist?.checks?.[key];
  const stale = stored?.checked === true && stored.fingerprint !== auditFingerprint(row, key);
  return { checked: stored?.checked === true && !stale, stale, by: text(stored?.byName), at: stored?.at || null };
}
export function auditProgress(row) {
  const states = AUDIT_FIELDS.map(field => auditCheckState(row, field.key));
  return { done: states.filter(state => state.checked).length, complete: states.every(state => state.checked), stale: states.some(state => state.stale) };
}
export function duplicateAuditCodes(rows) {
  const counts = new Map();
  for (const row of rows.filter(isAuditStore)) { const code = text(row.listingNo).toUpperCase(); if (code) counts.set(code, (counts.get(code) || 0) + 1); }
  return new Map([...counts].filter(([, count]) => count > 1));
}
export function filterAuditRows(rows, { status = "active", query = "", review = "all" } = {}) {
  const words = text(query).toLowerCase().replace(/臺/g, "台").split(/\s+/).filter(Boolean);
  const duplicates = duplicateAuditCodes(rows);
  return rows.filter(isAuditStore).filter(row => {
    if (status !== "all" && (row.status || "active") !== status) return false;
    const haystack = [row.title, row.listingNo, row.address, row.agentInfo, row.auditChecklist?.note?.text].map(text).join(" ").replace(/臺/g, "台").toLowerCase();
    if (!words.every(word => haystack.includes(word))) return false;
    const state = auditProgress(row);
    return review === "all" || review === "pending" && !state.complete || review === "done" && state.complete || review === "stale" && state.stale || review === "notes" && !!text(row.auditChecklist?.note?.text) || review === "duplicates" && duplicates.has(text(row.listingNo).toUpperCase());
  }).sort((a, b) => text(a.listingNo).localeCompare(text(b.listingNo), "zh-Hant", { numeric: true }) || text(a.title).localeCompare(text(b.title), "zh-Hant"));
}
export function auditDate(value, short = false) {
  const date = value?.toDate?.() || (value?.seconds ? new Date(value.seconds * 1000) : new Date(value || NaN));
  if (!Number.isFinite(date.getTime())) return "";
  return new Intl.DateTimeFormat("zh-TW", { timeZone: "Asia/Taipei", ...(short ? {} : { year: "numeric" }), month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false }).format(date);
}
// Normal property edits must not send an old checklist back over colleagues' work.
export function withoutPropertyAudit(row) { const { auditChecklist, ...fields } = row; return fields; }
