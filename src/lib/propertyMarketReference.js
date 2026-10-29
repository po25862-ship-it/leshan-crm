import { reverseMatchProperty } from "./needsMatch";
import { propertyUnitPrice, missingUnitPriceFields, officialNetUnit, nonNegativeNumber, parkingPricePresetNote } from "./propertyUnitPrice";
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

export function comparableDeals(property, reference, { tolerance = 0.2, sameRooms = false, now = Date.now() } = {}) {
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
  const parkingNote = parkingPricePresetNote(property);
  const pending = (reason, next, extra = {}) => ({ status: "pending", label: ["missing_reference", "source_unavailable", "stale_reference"].includes(extra.code) ? "還沒查過附近成交" : "先把資料補齊", reason: reason + parkingNote, next, ...extra });
  if ((property.status || "active") !== "active") return { status: "inactive", label: "非在售", reason: "此案件目前非在售，不列為優先推案。", next: "確認案件狀態後再評估。" };
  const unit = propertyUnitPrice(property, "net");
  if (unit === null) {
    const missingFields = missingUnitPriceFields(property);
    const names = missingFields.map((field) => field.label).join("、") || "單價計算資料";
    const fieldValues = { "總價": property.totalPrice, "權狀坪數": property.titlePing, "車位價格": property.parkingPrice, "車位坪數": property.parkingPing, "車位狀況": property.parkingDescription };
    const empty = missingFields.every((field) => fieldValues[field.label] === "" || fieldValues[field.label] == null);
    return pending(`${empty ? `這間還沒填${names}` : `這間的${names}還沒確認好`}，暫時沒辦法比較房子的每坪價格。`, `確認${names}後填進去，系統就會重新判斷。`, {
      code: "missing_unit", missingFields,
    });
  }
  if (error) return pending("雲端行情資料暫時無法讀取。", "確認網路連線後，重新更新參考。", { code: "source_unavailable" });
  if (reference?.fetchedAt && now - Number(reference.fetchedAt) > 86400000) return pending("上次讀取的市場參考已超過一天。", "更新成交參考後重新評估。", { code: "stale_reference" });
  if (!reference) return pending("這間還沒查過附近成交。", "按一下更新案件判斷，就會查同社區、大小差不多的房子最近賣多少。", { code: "missing_reference" });
  if (!reference.community) return pending("尚未配對到 A7／A8／A9 的唯一社區。", "核對完整門牌及社區名稱。", { code: "unmatched_community" });
  if (reference.matchMethod !== "exact-doorplate") return pending("目前只依社區名稱配對，完整門牌仍需核對。", "核對本件門牌是否屬於該社區。", { code: "unconfirmed_community" });
  const matches = comparableDeals(property, reference, { now, sameRooms: false });
  const cutoff = new Date(now - 365 * 86400000).toISOString().slice(0, 10);
  const samples = matches.slice(0, 5).filter((d) => d.date >= cutoff && officialNetUnit(d) !== null);
  if (samples.length < 3) return pending(`找到的相近成交太少，還不能判斷。最近五筆中，近一年能把車位分開算的成交只有 ${samples.length} 筆，需要至少 3 筆。`, "可以調整坪數範圍，多看幾筆參考。資料還不夠時，系統先不判斷是否優先推薦。", { code: "insufficient_comps", sampleCount: samples.length, label: "找到的相近成交太少，還不能判斷" });
  const referenceUnit = median(samples.map(officialNetUnit));
  const buyers = activeMatches(property, needs);
  const detail = { unit, referenceUnit, sampleCount: samples.length, matchedNeeds: buyers.strict, possibleNeeds: buyers.possible };
  if (unit > referenceUnit) return { ...detail, status: "negotiate", label: "議價追蹤", reason: `扣車開價 ${unit.toFixed(2)} 萬／坪，高於相近成交中位數 ${referenceUnit.toFixed(2)}；${buyers.possible > 0 ? `有 ${buyers.possible} 組客人的需求可能適合` : "目前還沒找到合適的客人"}。${parkingNote}`, next: "先問負責業務，屋主的價格還能不能談，再看看適合推薦給誰。" };
  if (buyers.strict === 0) return pending("目前還沒找到合適的客人。", "先看看現有客人的需求，有合適的再安排介紹。", { ...detail, label: "目前還沒找到合適的客人" });
  const confirmed = time(property.viewingConfirmedAt);
  const ready = property.viewingStatus === "available" && confirmed !== null && confirmed <= now && now - confirmed <= 30 * 86400000;
  if (!ready) return pending(`符合 ${buyers.strict} 組現有客需，尚待近期帶看確認。`, "向負責業務確認可帶看，並在編輯資料更新帶看狀態。", detail);
  return { ...detail, status: "priority", label: "優先推案", reason: `扣車開價不高於相近成交中位數，符合 ${buyers.strict} 組現有客需，且近 30 天已確認可帶看。${parkingNote}`, next: "核對樓層、屋況與交易條件後，聯繫符合需求的買方安排帶看。" };
}
