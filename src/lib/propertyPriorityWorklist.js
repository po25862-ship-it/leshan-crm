import { assessPropertyPriority, COMPARABLE_AREA_TOLERANCE, comparisonSamples, referenceKey } from "./propertyMarketReference";

export const PRIORITY_FILTERS = [
  { value: "all", label: "全部案件" },
  { value: "priority", label: "優先推案" },
  { value: "negotiate", label: "議價追蹤" },
  { value: "pending", label: "先把資料補齊" },
  { value: "unassessed", label: "還沒查過附近成交" },
];

export function priorityActionLabel(assessment) {
  return assessment?.code === "missing_unit" ? "去補資料" : "看價格比較";
}

export const REFERENCE_MAX_AGE = 86400000;
const STORAGE_PREFIX = "leshan-crm.priority-reference.v3:";

export function priorityReferenceKey(property) {
  // The cached five comparables depend on area/type/address; price, needs and
  // viewing confirmation are always assessed again from the current CRM data.
  return JSON.stringify([referenceKey(property), property.category || "", String(property.titlePing ?? ""), COMPARABLE_AREA_TOLERANCE]);
}

export function isPriorityCandidate(property, communityNames = []) {
  return /a[789]/i.test([property.area, property.title].join(" ")) || communityNames.includes(property.communityName);
}

export function priorityGroup(assessment) {
  if (!assessment || assessment.status === "inactive") return "other";
  if (["missing_reference", "source_unavailable", "stale_reference"].includes(assessment.code)) return "unassessed";
  return ["priority", "negotiate", "pending"].includes(assessment.status) ? assessment.status : "other";
}

export function matchesPriorityFilter(assessment, filter = "all") {
  return filter === "all" || priorityGroup(assessment) === filter;
}

export function countPriorityGroups(properties, assessments) {
  const counts = { all: properties.length, priority: 0, negotiate: 0, pending: 0, unassessed: 0 };
  for (const property of properties) {
    const group = priorityGroup(assessments.get(property.id));
    if (Object.hasOwn(counts, group)) counts[group]++;
  }
  return counts;
}

export function cachedPriorityReference(property, record) {
  return record?.key === priorityReferenceKey(property) ? record : null;
}

export function compactPriorityReference(property, data) {
  if (!data || !Array.isArray(data.deals)) return null;
  // Store only the five rows needed by assessment, never the full source dataset,
  // buyer needs, contact details, login tokens or a precomputed recommendation.
  return {
    community: data.community ? { id: data.community.id, name: data.community.name, zone: data.community.zone } : null,
    matchMethod: data.matchMethod, reason: data.reason,
    fetchedAt: Number(data.fetchedAt) || Date.now(),
    deals: comparisonSamples(property, data).map((deal) => Object.fromEntries(
      ["id", "date", "type", "use", "area", "price", "parkingPrice", "parkingArea", "parkingType", "parkingCount", "rooms", "special"]
        .filter((key) => deal[key] !== undefined).map((key) => [key, deal[key]])
    )),
  };
}

export function loadPriorityReferences(uid, storage, now = Date.now()) {
  if (!uid || !storage) return {};
  try {
    const raw = storage.getItem(STORAGE_PREFIX + uid);
    if (!raw || raw.length > 2_000_000) return {};
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
    return Object.fromEntries(Object.entries(parsed).filter(([id, record]) =>
      id && typeof record?.key === "string" && record.data && Array.isArray(record.data.deals)
      && record.data.deals.length <= 5 && record.data.deals.every((deal) => deal && typeof deal.id === "string" && typeof deal.date === "string")
      && (record.data.community === null || (typeof record.data.community?.id === "string" && typeof record.data.community?.name === "string"))
      && Number.isFinite(record.data.fetchedAt)
      && record.data.fetchedAt <= now && now - record.data.fetchedAt <= REFERENCE_MAX_AGE
    ).slice(0, 600));
  } catch { return {}; }
}

export function savePriorityReferences(uid, records, storage) {
  if (!uid || !storage) return;
  try {
    const now = Date.now();
    const saved = Object.fromEntries(Object.entries(records).filter(([, record]) =>
      !record.error && record.data?.fetchedAt <= now && now - record.data.fetchedAt <= REFERENCE_MAX_AGE
    ).slice(-600));
    const text = JSON.stringify(saved);
    if (text.length <= 2_000_000) storage.setItem(STORAGE_PREFIX + uid, text);
  } catch { /* A blocked/full browser cache never prevents using the worklist. */ }
}

export function buildPriorityAssessments(properties, records, needs, communityNames, now = Date.now()) {
  return new Map(properties.flatMap((property) => {
    const record = cachedPriorityReference(property, records[property.id]);
    if (!isPriorityCandidate(property, communityNames) && !["A7", "A8", "A9"].includes(record?.data?.community?.zone)) return [];
    return [[property.id, assessPropertyPriority(property, record?.data, needs, { error: record?.error, now })]];
  }));
}

export async function refreshPriorityReferences(properties, { load, onResult, onProgress, shouldStop = () => false, pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms)), now = Date.now, interval = 1500 }) {
  let completed = 0;
  for (const property of properties) {
    if (shouldStop()) return { completed, stopped: true };
    const started = now();
    try {
      const data = await load(property);
      if (shouldStop()) return { completed, stopped: true };
      onResult(property, data, "");
      completed++;
      onProgress(completed);
    } catch {
      if (!shouldStop()) onResult(property, null, "雲端行情資料暫時無法讀取，請確認網路連線後重試。");
      // Do not repeat a failing request for every remaining property.
      return { completed, failed: true };
    }
    if (completed < properties.length) await pause(Math.max(0, interval - (now() - started)));
  }
  return { completed, stopped: false };
}
