import { reverseMatchProperty } from "./needsMatch";
import { propertyUnitPrice, missingUnitPriceFields, officialNetUnit, nonNegativeNumber } from "./propertyUnitPrice";
import { normalizeNeedRanges, toNum } from "./needsFields";

export function referenceLookup(property = {}) {
  return { address: String(property.address || "").trim(), communityName: String(property.communityName || "").trim(), district: "" };
}
export function referenceKey(property) { return JSON.stringify(referenceLookup(property)); }

function roomsOf(property) { return Number(String(property.layout || "").split("/")[0].match(/\d+/)?.[0]) || null; }
function sameType(property, deal) {
  const type = String(deal.type || "");
  const use = String(deal.use || "");
  switch (property.category) {
    case "電梯大樓": return /住宅大樓|華廈/.test(type) && !/辦公|商業|店舖|店面/.test(use);
    case "公寓": return /公寓/.test(type);
    case "套房": return /套房/.test(type) || (/住宅大樓|華廈|公寓/.test(type) && deal.rooms === 1);
    case "透天厝": case "別墅": return /透天/.test(type);
    case "店面": return /店|商業/.test(type + use);
    case "辦公": return /辦公|事務所/.test(type + use);
    default: return false;
  }
}

export function comparableDeals(property, reference, { tolerance = 0.2, sameRooms = true, now = Date.now() } = {}) {
  const area = nonNegativeNumber(property?.titlePing);
  const rooms = roomsOf(property || {});
  if (!(area > 0) || !reference?.community || (sameRooms && rooms === null)) return [];
  const today = new Date(now).toISOString().slice(0, 10);
  const percent = [0.1, 0.2, 0.3].includes(tolerance) ? tolerance : 0.2;
  const seen = new Set();
  return (reference.deals || []).filter((deal) => {
    if (deal.special !== false || !/^\d{4}-\d{2}-\d{2}$/.test(deal.date || "") || deal.date > today || !sameType(property, deal)) return false;
    const ping = nonNegativeNumber(deal.area);
    if (!(ping > 0) || ping < area * (1 - percent) || ping > area * (1 + percent)) return false;
    if (sameRooms && deal.rooms !== rooms) return false;
    if (!deal.id || seen.has(deal.id)) return false;
    seen.add(deal.id);
    return true;
  }).sort((a, b) => b.date.localeCompare(a.date));
}

function activeMatches(property, needs) {
  const results = reverseMatchProperty(property, (needs || []).filter((n) => (n.statusTag || "正在找") === "正在找"));
  const strict = results.filter((m) => {
    const range = normalizeNeedRanges(m.need);
    const minimum = toNum(range.budgetMin), maximum = toNum(range.budgetMax);
    const price = nonNegativeNumber(property.totalPrice);
    return m.percent === 100 && m.missedReasons.length === 0 && price > 0 &&
      (minimum === null || price >= minimum) && (maximum === null || price <= maximum);
  });
  const countUnique = (list) => new Set(list.map((m) => m.need.contactId || m.need.id).filter(Boolean)).size;
  return { strict: countUnique(strict), possible: countUnique(results.filter((m) => m.missedReasons.length === 0)) };
}

function time(value) {
  if (!value) return null;
  const date = typeof value.toDate === "function" ? value.toDate() : typeof value.seconds === "number" ? new Date(value.seconds * 1000) : new Date(value);
  return Number.isFinite(date.getTime()) ? date.getTime() : null;
}
function median(values) { const s = [...values].sort((a, b) => a - b); const i = Math.floor(s.length / 2); return s.length % 2 ? s[i] : (s[i - 1] + s[i]) / 2; }

export function assessPropertyPriority(property = {}, reference = null, needs = [], { now = Date.now(), error = "" } = {}) {
  const pending = (reason, next, extra = {}) => ({ status: "pending", label: "待補資料", reason, next, ...extra });
  if ((property.status || "active") !== "active") return { status: "inactive", label: "非在售", reason: "此案件目前非在售，不列為優先推案。", next: "確認案件狀態後再評估。" };
  if (error) return pending("市場參考暫時無法更新。", "確認市場開發程式在線後，重新更新參考。", { code: "source_unavailable" });
  if (reference?.fetchedAt && now - Number(reference.fetchedAt) > 86400000) return pending("上次讀取的市場參考已超過一天。", "更新成交參考後重新評估。", { code: "stale_reference" });
  const unit = propertyUnitPrice(property, "net");
  if (unit === null) {
    const missingFields = missingUnitPriceFields(property);
    const names = missingFields.map((field) => field.label).join("、") || "單價計算資料";
    return pending(`${names}尚未確認，無法計算扣車位單價。`, `請確認並填寫${names}；其餘已填資料可正常使用。`, {
      code: "missing_unit", missingFields, label: missingFields.length === 1 ? `待補${names}` : "待補單價資料",
    });
  }
  if (!reference) return pending(error || "尚未取得同社區成交參考。", "查看資料並更新成交參考。", { code: "missing_reference" });
  if (!reference.community) return pending("尚未配對到 A7／A8／A9 的唯一社區。", "核對完整門牌及社區名稱。", { code: "unmatched_community" });
  if (reference.matchMethod !== "exact-doorplate") return pending("目前只依社區名稱配對，完整門牌仍需核對。", "核對本件門牌是否屬於該社區。", { code: "unconfirmed_community" });
  const matches = comparableDeals(property, reference, { now });
  const cutoff = new Date(now - 365 * 86400000).toISOString().slice(0, 10);
  const samples = matches.slice(0, 5).filter((d) => d.date >= cutoff && officialNetUnit(d) !== null);
  if (samples.length < 3) return pending(`最近五筆中，近一年可比較的扣車成交僅 ${samples.length} 筆。`, "可調整坪數範圍或取消同房數查看參考；可比成交不足時，暫不判定為優先推案。", { code: "insufficient_comps", sampleCount: samples.length, label: "可比成交不足" });
  const referenceUnit = median(samples.map(officialNetUnit));
  const buyers = activeMatches(property, needs);
  const detail = { unit, referenceUnit, sampleCount: samples.length, matchedNeeds: buyers.strict, possibleNeeds: buyers.possible };
  if (unit > referenceUnit && buyers.possible > 0) return { ...detail, status: "negotiate", label: "議價追蹤", reason: `扣車開價 ${unit.toFixed(2)} 萬／坪，高於相近成交中位數 ${referenceUnit.toFixed(2)}；有 ${buyers.possible} 組可追蹤客需。`, next: "先向負責業務確認屋況與議價空間，再決定是否推薦。" };
  if (unit > referenceUnit) return pending("扣車開價高於相近成交中位數，且尚無適合的客需。", "確認價格彈性並配對現有買方需求。", detail);
  if (buyers.strict === 0) return pending("扣車開價不高於相近成交中位數，但目前沒有完全符合的現有客需。", "確認屋況、樓層差異，並配對買方需求。", detail);
  const confirmed = time(property.viewingConfirmedAt);
  const ready = property.viewingStatus === "available" && confirmed !== null && confirmed <= now && now - confirmed <= 30 * 86400000;
  if (!ready) return pending(`符合 ${buyers.strict} 組現有客需，尚待近期帶看確認。`, "向負責業務確認可帶看，並在編輯資料更新帶看狀態。", detail);
  return { ...detail, status: "priority", label: "優先推案", reason: `扣車開價不高於相近成交中位數，符合 ${buyers.strict} 組現有客需，且近 30 天已確認可帶看。`, next: "核對樓層、屋況與交易條件後，聯繫符合需求的買方安排帶看。" };
}
