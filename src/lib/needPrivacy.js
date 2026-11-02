import { normalizeNeedRanges, rangeStatText } from "./needsFields";

export const NEED_OWNER_UID = "KiYlsnWcChW5muRkG167r7Mi1132";
export const NEED_PUBLIC_FIELDS = [
  "title", "shareAlias", "statusTag", "areas", "types", "purposes", "motivation",
  "budgetMin", "budgetMax", "mainAreaMin", "mainAreaMax", "roomsMin", "roomsMax",
  "bathMin", "bathMax", "ageMin", "ageMax", "floorMin", "floorMax", "topFloorOnly",
  "criteriaLevels", "parkingRequired", "preferredFeatures", "excludeGroundFloor",
  "excludeTopFloor", "excludeMechanicalParking", "excludedFeatures", "shared",
  "recommendedProperties", "ownerUid", "createdAt", "updatedAt", "lastModifiedByUid", "schemaVersion",
];

export function needShareTitle(need = {}) {
  if (need.shareAlias?.trim()) return need.shareAlias.trim();
  const area = (need.areas || []).map(a => [a.city, a.district, a.community].filter(Boolean).join("")).filter(Boolean).join("／");
  const ranges = normalizeNeedRanges(need);
  return [area, rangeStatText(ranges.roomsMin, ranges.roomsMax, "房"), need.parkingRequired && "有車位"].filter(Boolean).join("・") || "找房需求";
}

export function splitNeedData(need = {}, ownerUid) {
  const safe = { ...need, ...normalizeNeedRanges(need), ownerUid, schemaVersion: 2 };
  const publicData = Object.fromEntries(NEED_PUBLIC_FIELDS.filter(k => safe[k] !== undefined).map(k => [k, safe[k]]));
  publicData.title = needShareTitle(need);
  publicData.shareAlias = need.shareAlias?.trim() || "";
  publicData.shared = !!need.shared;
  publicData.recommendedProperties = need.recommendedProperties || [];
  return { publicData, privateData: {
    ownerUid, contactId: need.contactId || "", contactName: need.contactName || "",
    privateTitle: need.title || "", notes: need.notes || "",
  } };
}

export function mergeNeedPrivate(need, privateData) {
  return privateData ? { ...need, ...privateData, title: privateData.privateTitle || need.title, publicTitle: need.title, privateLoaded: true } : { ...need, publicTitle: need.title };
}

export function canManageNeed(need, uid) {
  return need?.ownerUid === uid || uid === NEED_OWNER_UID;
}
