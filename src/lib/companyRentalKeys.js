// Key references stay in the existing private rental document, never in customer shares.
export const RENTAL_KEY_ORIGIN = "https://leshan-key-ipad-test-20261025.po25862.chatgpt.site";
export const RENTAL_KEY_MESSAGE = "leshan:rental-key-selected:v1";
const PREFIX = "leshan-key:v1:";
export function normalizeRentalKey(value) {
  if (!value || typeof value !== "object" || typeof value.id !== "string" || !/^\d{1,30}$/.test(value.id || "")) return null;
  if (typeof value.name !== "string" || !value.name.trim() || value.name.length > 100 || typeof value.slot !== "string" || value.slot.length > 60) return null;
  if (!["in", "out", "warehouse"].includes(value.status)) return null;
  return { id: value.id, name: value.name.trim(), slot: value.slot.trim(), status: value.status };
}
export function parseRentalKey(info) {
  if (typeof info !== "string" || !info.startsWith(PREFIX)) return null;
  try { return normalizeRentalKey(JSON.parse(info.slice(PREFIX.length))); } catch { return null; }
}
export function encodeRentalKey(key) {
  const value = normalizeRentalKey(key);
  if (!value) throw new Error("鑰匙資料不完整，請重新選擇。");
  return PREFIX + JSON.stringify(value);
}
export function rentalKeyUrl(key) {
  const value = normalizeRentalKey(key);
  return value ? `${RENTAL_KEY_ORIGIN}/full?key=${encodeURIComponent(value.id)}` : "";
}
export function rentalViewingNotes(internal = {}) {
  const notes = String(internal.viewingInstructions || "").trim(), oldKey = String(internal.keyInfo || "").trim();
  return [notes, oldKey && !parseRentalKey(oldKey) ? `鑰匙／門禁：${oldKey}` : ""].filter(Boolean).join("\n");
}
export function rentalKeyStatus(key) {
  return { in: "在櫃", out: "已借出", warehouse: "倉庫暫存" }[key?.status] || "待確認";
}
export function rentalKeySelection(event, popup, nonce) {
  if (!popup || !nonce || event.origin !== RENTAL_KEY_ORIGIN || event.source !== popup || event.data?.type !== RENTAL_KEY_MESSAGE || event.data.nonce !== nonce) return null;
  return normalizeRentalKey(event.data.key);
}
