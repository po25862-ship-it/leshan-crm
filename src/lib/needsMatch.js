// 根據「客需」的找房條件，自動從物件清單中配對出可能符合的物件，
// 給客需表單裡的「系統配對建議」用，讓仲介不用自己一筆一筆手動搜尋。
import { normalizeRegionText } from "./taiwanRegions";
import { normalizeNeedRanges, toNum } from "./needsFields";
import { parseFloor, isTopFloor } from "./floor";

// 客需表單的物件類型標籤，對應到「案件控台」實際使用的物件類別
const TYPE_TO_CATEGORIES = {
  公寓: ["公寓"],
  大樓: ["電梯大樓"],
  廠房: ["工廠", "廠辦", "工業地"],
  透天: ["透天厝"],
  土地: ["建地", "農地", "土地類其他"],
  車位: ["車位"],
};

// 樓層／房型格式通常是「3/2/2」（房/廳/衛），依序取房數／衛浴數
function parseLayoutPart(layout, index) {
  if (!layout) return null;
  const part = String(layout).split("/")[index];
  const m = (part || "").match(/\d+/);
  return m ? parseInt(m[0], 10) : null;
}

// 判斷一個數值是否落在 [min, max] 範圍內；min／max 沒填的那一端不比對，兩者都沒填視為「沒有這個條件」
function inRange(value, min, max) {
  const hasMin = min !== null;
  const hasMax = max !== null;
  if (!hasMin && !hasMax) return null; // 沒設條件
  if (value === null) return false;
  if (hasMin && value < min) return false;
  if (hasMax && value > max) return false;
  return true;
}

// 判斷一筆物件地址是否落在某個找房區域內（縣市／鄉鎮市區／社區皆為模糊比對，沒填的欄位不比對）
function matchesArea(address, area) {
  const addr = normalizeRegionText(address || "");
  if (area.city && !addr.includes(normalizeRegionText(area.city))) return false;
  if (area.district && !addr.includes(normalizeRegionText(area.district))) return false;
  if (area.community && !addr.includes(normalizeRegionText(area.community))) return false;
  return true;
}

// 針對一筆客需，從物件清單中配對出可能符合的物件，依符合程度（score）排序。
// 區域、預算超出太多的物件會直接排除；其他條件（類型／坪數／房數／衛浴數）沒符合只是不加分，不會被排除，
// 避免因為單一條件沒填好就漏掉原本該推薦的物件。
// 回傳 [{ property, score, total, reasons }]
export function matchPropertiesForNeed(need, properties) {
  if (!need) return [];
  const areas = (need.areas || []).filter((a) => a.city || a.district || a.community);
  const wantedCategories = (need.types || []).flatMap((t) => TYPE_TO_CATEGORIES[t] || [t]);
  const ranges = normalizeNeedRanges(need);
  const budgetMin = toNum(ranges.budgetMin);
  const budgetMax = toNum(ranges.budgetMax);
  const mainAreaMin = toNum(ranges.mainAreaMin);
  const mainAreaMax = toNum(ranges.mainAreaMax);
  const roomsMin = toNum(ranges.roomsMin);
  const roomsMax = toNum(ranges.roomsMax);
  const bathMin = toNum(ranges.bathMin);
  const bathMax = toNum(ranges.bathMax);
  const floorMin = toNum(need.floorMin);
  const floorMax = toNum(need.floorMax);
  const topFloorOnly = !!need.topFloorOnly;

  const hasAnyCriteria =
    areas.length > 0 ||
    wantedCategories.length > 0 ||
    budgetMin !== null ||
    budgetMax !== null ||
    mainAreaMin !== null ||
    mainAreaMax !== null ||
    roomsMin !== null ||
    roomsMax !== null ||
    bathMin !== null ||
    bathMax !== null ||
    floorMin !== null ||
    floorMax !== null ||
    topFloorOnly;
  if (!hasAnyCriteria) return [];

  const results = [];
  (properties || []).forEach((p) => {
    if ((p.status || "active") !== "active") return;
    let score = 0;
    let total = 0;
    const reasons = [];

    if (areas.length > 0) {
      total++;
      if (!areas.some((a) => matchesArea(p.address, a))) return; // 區域不符直接排除
      score++;
      reasons.push("區域相符");
    }

    if (budgetMin !== null || budgetMax !== null) {
      total++;
      const price = toNum(p.totalPrice);
      if (price === null) {
        // 沒填總價的物件不加分，但也不排除
      } else {
        if (budgetMin !== null && price < budgetMin) return; // 明顯低於預算下限也一併排除，避免推薦到條件太不符的物件
        if (budgetMax !== null && price > budgetMax * 1.1) return; // 超出預算上限太多就不推薦
        score++;
        reasons.push(budgetMax !== null && price > budgetMax ? "接近預算" : "預算內");
      }
    }

    if (wantedCategories.length > 0) {
      total++;
      if (wantedCategories.includes(p.category)) {
        score++;
        reasons.push("類型相符");
      }
    }

    if (mainAreaMin !== null || mainAreaMax !== null) {
      total++;
      const ping = toNum(p.titlePing) ?? toNum(p.mainBuildingPing);
      if (inRange(ping, mainAreaMin, mainAreaMax)) {
        score++;
        reasons.push("坪數符合");
      }
    }

    if (roomsMin !== null || roomsMax !== null) {
      total++;
      const rooms = parseLayoutPart(p.layout, 0);
      if (inRange(rooms, roomsMin, roomsMax)) {
        score++;
        reasons.push("房數符合");
      }
    }

    if (bathMin !== null || bathMax !== null) {
      total++;
      const bath = parseLayoutPart(p.layout, 2);
      if (inRange(bath, bathMin, bathMax)) {
        score++;
        reasons.push("衛浴符合");
      }
    }

    if (floorMin !== null || floorMax !== null) {
      total++;
      if (inRange(parseFloor(p.floor), floorMin, floorMax)) {
        score++;
        reasons.push("樓層符合");
      }
    }

    if (topFloorOnly) {
      total++;
      if (isTopFloor(p.floor)) {
        score++;
        reasons.push("頂樓");
      }
    }

    if (total === 0) return;
    results.push({ property: p, score, total, reasons });
  });

  results.sort((a, b) => b.score - a.score || b.total - a.total);
  return results;
}
