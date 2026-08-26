// Matching Engine V2：保留舊客需欄位相容，新增必要／偏好／排除與可解釋的加權百分比。
import { normalizeRegionText } from "./taiwanRegions";
import { normalizeNeedRanges, toNum } from "./needsFields";
import { parseFloor, isTopFloor } from "./floor";
import { parseAge } from "./age";

const TYPE_TO_CATEGORIES = {
  公寓: ["公寓"], 大樓: ["電梯大樓"], 廠房: ["工廠", "廠辦", "工業地"],
  透天: ["透天厝"], 土地: ["建地", "農地", "土地類其他"], 車位: ["車位"],
};

export const MATCH_WEIGHTS = {
  area: 25, budget: 25, type: 12, rooms: 15, parking: 15,
  mainArea: 8, floor: 5, age: 4, bath: 3, topFloor: 5, features: 5,
};

const DEFAULT_LEVELS = {
  type: "preferred", mainArea: "preferred", rooms: "preferred", bath: "preferred",
  age: "preferred", floor: "preferred", topFloor: "preferred",
};

function parseLayoutPart(layout, index) {
  if (!layout) return null;
  const match = String(layout).split("/")[index]?.match(/\d+/);
  return match ? parseInt(match[0], 10) : null;
}

function inRange(value, min, max) {
  if (min === null && max === null) return null;
  if (value === null) return false;
  return !(min !== null && value < min) && !(max !== null && value > max);
}

function matchesArea(address, area) {
  const normalizedAddress = normalizeRegionText(address || "");
  if (area.city && !normalizedAddress.includes(normalizeRegionText(area.city))) return false;
  if (area.district && !normalizedAddress.includes(normalizeRegionText(area.district))) return false;
  if (area.community && !normalizedAddress.includes(normalizeRegionText(area.community))) return false;
  return true;
}

function propertyHasParking(property) {
  const description = String(property.parkingDescription || "").trim();
  if (description === "無") return false;
  return Number(property.parkingCount || 0) > 0 || Number(property.parkingPing || 0) > 0 || Boolean(description);
}

function isMechanicalParking(property) {
  return /機械|升降|塔式/.test(String(property.parkingDescription || ""));
}

function isGroundFloor(property) {
  return parseFloor(property.floor) === 1 || /一樓|1樓/.test(String(property.floor || ""));
}

function toFeatureList(value) {
  if (Array.isArray(value)) return value.map(String).map((item) => item.trim()).filter(Boolean);
  return String(value || "").split(/[、,，\n]/).map((item) => item.trim()).filter(Boolean);
}

function propertySearchText(property) {
  return [property.title, property.address, property.category, property.parkingDescription, property.notes,
    property.orientation, ...(property.customFields || []).flatMap((field) => [field.label, field.value])]
    .filter(Boolean).join(" ").toLowerCase();
}

function criterionLevel(need, key) {
  return need.criteriaLevels?.[key] || DEFAULT_LEVELS[key] || "preferred";
}

// 區域仍為硬篩，預算上限仍保留 10% 容忍；必要或排除條件不符時不回傳該物件。
export function matchPropertiesForNeed(need, properties) {
  if (!need) return [];
  const areas = (need.areas || []).filter((area) => area.city || area.district || area.community);
  const wantedCategories = (need.types || []).flatMap((type) => TYPE_TO_CATEGORIES[type] || [type]);
  const ranges = normalizeNeedRanges(need);
  const budgetMin = toNum(ranges.budgetMin), budgetMax = toNum(ranges.budgetMax);
  const mainAreaMin = toNum(ranges.mainAreaMin), mainAreaMax = toNum(ranges.mainAreaMax);
  const roomsMin = toNum(ranges.roomsMin), roomsMax = toNum(ranges.roomsMax);
  const bathMin = toNum(ranges.bathMin), bathMax = toNum(ranges.bathMax);
  const ageMin = toNum(ranges.ageMin), ageMax = toNum(ranges.ageMax);
  const floorMin = toNum(need.floorMin), floorMax = toNum(need.floorMax);
  const preferredFeatures = toFeatureList(need.preferredFeatures);
  const excludedFeatures = toFeatureList(need.excludedFeatures);
  const hasAnyCriteria = areas.length || wantedCategories.length || budgetMin !== null || budgetMax !== null ||
    mainAreaMin !== null || mainAreaMax !== null || roomsMin !== null || roomsMax !== null ||
    bathMin !== null || bathMax !== null || ageMin !== null || ageMax !== null || floorMin !== null ||
    floorMax !== null || need.topFloorOnly || need.parkingRequired || need.excludeGroundFloor ||
    need.excludeTopFloor || need.excludeMechanicalParking || preferredFeatures.length || excludedFeatures.length;
  if (!hasAnyCriteria) return [];

  const results = [];
  (properties || []).forEach((property) => {
    if ((property.status || "active") !== "active") return;
    const searchable = propertySearchText(property);
    if (need.excludeGroundFloor && isGroundFloor(property)) return;
    if (need.excludeTopFloor && isTopFloor(property.floor)) return;
    if (need.excludeMechanicalParking && isMechanicalParking(property)) return;
    if (excludedFeatures.some((feature) => searchable.includes(feature.toLowerCase()))) return;

    let matchedWeight = 0, totalWeight = 0, rejected = false;
    const reasons = [], missedReasons = [];
    const addCriterion = ({ key, active, matched, label, missedLabel, ratio = 1, alwaysRequired = false }) => {
      if (!active || rejected) return;
      const level = alwaysRequired ? "required" : criterionLevel(need, key);
      if (level === "ignored") return;
      const weight = MATCH_WEIGHTS[key] || 1;
      totalWeight += weight;
      if (matched) {
        matchedWeight += weight * ratio;
        reasons.push(label);
      } else if (level === "required") rejected = true;
      else missedReasons.push(missedLabel || `${label}未命中`);
    };

    addCriterion({ key: "area", active: areas.length > 0, matched: areas.some((area) => matchesArea(property.address, area)), label: "區域相符", alwaysRequired: true });
    if (rejected) return;

    if (budgetMin !== null || budgetMax !== null) {
      const price = toNum(property.totalPrice);
      if (price !== null && budgetMin !== null && price < budgetMin) return;
      if (price !== null && budgetMax !== null && price > budgetMax * 1.1) return;
      let ratio = 1, label = "預算內";
      if (price === null) { ratio = 0; label = "未提供價格"; }
      else if (budgetMax !== null && price > budgetMax) {
        ratio = Math.max(0.55, 1 - ((price - budgetMax) / (budgetMax * 0.1)) * 0.45);
        label = `接近預算（高 ${Math.round(((price / budgetMax) - 1) * 100)}%）`;
      }
      totalWeight += MATCH_WEIGHTS.budget;
      matchedWeight += MATCH_WEIGHTS.budget * ratio;
      if (ratio > 0) reasons.push(label); else missedReasons.push("物件未提供價格");
    }

    addCriterion({ key: "type", active: wantedCategories.length > 0, matched: wantedCategories.includes(property.category), label: "類型相符", missedLabel: "物件類型不同" });
    addCriterion({ key: "mainArea", active: mainAreaMin !== null || mainAreaMax !== null, matched: inRange(toNum(property.mainBuildingPing) ?? toNum(property.titlePing), mainAreaMin, mainAreaMax), label: "坪數符合", missedLabel: "坪數未達偏好" });
    addCriterion({ key: "rooms", active: roomsMin !== null || roomsMax !== null, matched: inRange(parseLayoutPart(property.layout, 0), roomsMin, roomsMax), label: "房數符合", missedLabel: "房數不符" });
    addCriterion({ key: "bath", active: bathMin !== null || bathMax !== null, matched: inRange(parseLayoutPart(property.layout, 2), bathMin, bathMax), label: "衛浴符合", missedLabel: "衛浴數不符" });
    addCriterion({ key: "age", active: ageMin !== null || ageMax !== null, matched: inRange(parseAge(property.age), ageMin, ageMax), label: "屋齡符合", missedLabel: "屋齡超出偏好" });
    addCriterion({ key: "floor", active: floorMin !== null || floorMax !== null, matched: inRange(parseFloor(property.floor), floorMin, floorMax), label: "樓層符合", missedLabel: "樓層未達偏好" });
    addCriterion({ key: "topFloor", active: !!need.topFloorOnly, matched: isTopFloor(property.floor), label: "頂樓偏好命中", missedLabel: "非頂樓" });
    addCriterion({ key: "parking", active: !!need.parkingRequired, matched: propertyHasParking(property), label: "具車位", missedLabel: "無符合車位", alwaysRequired: true });
    if (rejected) return;

    if (preferredFeatures.length > 0) {
      const hits = preferredFeatures.filter((feature) => searchable.includes(feature.toLowerCase()));
      totalWeight += MATCH_WEIGHTS.features;
      matchedWeight += MATCH_WEIGHTS.features * (hits.length / preferredFeatures.length);
      hits.forEach((feature) => reasons.push(`偏好：${feature}`));
      preferredFeatures.filter((feature) => !hits.includes(feature)).forEach((feature) => missedReasons.push(`未命中：${feature}`));
    }

    if (totalWeight === 0) return;
    const percent = Math.max(0, Math.min(100, Math.round((matchedWeight / totalWeight) * 100)));
    results.push({ property, percent, score: percent, total: 100, reasons, missedReasons, matchedWeight, totalWeight });
  });
  return results.sort((a, b) => b.percent - a.percent || b.matchedWeight - a.matchedWeight);
}

export function reverseMatchProperty(property, needs) {
  return (needs || []).flatMap((need) => matchPropertiesForNeed(need, [property]).map((match) => ({ ...match, need })))
    .sort((a, b) => b.percent - a.percent);
}
