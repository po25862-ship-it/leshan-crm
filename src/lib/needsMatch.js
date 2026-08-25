// 根據「客需」的找房條件，自動從物件清單中配對出可能符合的物件，
// 給客需表單裡的「系統配對建議」用，讓仲介不用自己一筆一筆手動搜尋。
import { normalizeRegionText } from "./taiwanRegions";

// 客需表單的物件類型標籤，對應到「案件控台」實際使用的物件類別
const TYPE_TO_CATEGORIES = {
  公寓: ["公寓"],
  大樓: ["電梯大樓"],
  廠房: ["工廠", "廠辦", "工業地"],
  透天: ["透天厝"],
  土地: ["建地", "農地", "土地類其他"],
  車位: ["車位"],
};

// 樓層／房型格式通常是「3/2/2」（房/廳/衛），取第一個數字當房數
function parseLayoutRooms(layout) {
  if (!layout) return null;
  const first = String(layout).split("/")[0];
  const m = (first || "").match(/\d+/);
  return m ? parseInt(m[0], 10) : null;
}

function toNumberOrNull(v) {
  if (v === "" || v === null || v === undefined) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
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
// 區域、預算超出太多的物件會直接排除；其他條件（類型／坪數／房數）沒符合只是不加分，不會被排除，
// 避免因為單一條件沒填好就漏掉原本該推薦的物件。
// 回傳 [{ property, score, total, reasons }]
export function matchPropertiesForNeed(need, properties) {
  if (!need) return [];
  const areas = (need.areas || []).filter((a) => a.city || a.district || a.community);
  const wantedCategories = (need.types || []).flatMap((t) => TYPE_TO_CATEGORIES[t] || [t]);
  const budget = toNumberOrNull(need.budget);
  const minMainArea = toNumberOrNull(need.minMainArea);
  const minRooms = toNumberOrNull(need.minRooms);

  if (areas.length === 0 && wantedCategories.length === 0 && budget === null && minMainArea === null && minRooms === null) {
    return [];
  }

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

    if (budget !== null) {
      total++;
      const price = toNumberOrNull(p.totalPrice);
      if (price === null) {
        // 沒填總價的物件不加分，但也不排除
      } else if (price <= budget * 1.1) {
        score++;
        reasons.push(price <= budget ? "預算內" : "接近預算");
      } else {
        return; // 超出預算太多就不推薦
      }
    }

    if (wantedCategories.length > 0) {
      total++;
      if (wantedCategories.includes(p.category)) {
        score++;
        reasons.push("類型相符");
      }
    }

    if (minMainArea !== null) {
      total++;
      const ping = toNumberOrNull(p.titlePing) ?? toNumberOrNull(p.mainBuildingPing);
      if (ping !== null && ping >= minMainArea) {
        score++;
        reasons.push("坪數符合");
      }
    }

    if (minRooms !== null) {
      total++;
      const rooms = parseLayoutRooms(p.layout);
      if (rooms !== null && rooms >= minRooms) {
        score++;
        reasons.push("房數符合");
      }
    }

    if (total === 0) return;
    results.push({ property: p, score, total, reasons });
  });

  results.sort((a, b) => b.score - a.score || b.total - a.total);
  return results;
}
