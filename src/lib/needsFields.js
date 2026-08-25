// 客需表單的「找房條件」共用小工具。
// 這裡把總價／主建物坪數／房數／衛浴數都改成「範圍」（最低～最高），
// 同時保留對舊資料（改版前只有單一數字欄位，例如 budget、minMainArea、minRooms）的相容轉換，
// 避免改版後舊客需在畫面上突然消失欄位、或漏掉系統配對推薦。

export function toNum(v) {
  if (v === "" || v === null || v === undefined) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

// 把一筆客需資料正規化成統一的 range 欄位；沒有新版欄位時會退回舊版單一數字欄位。
// 舊版「預算（萬）」「最低坪數」「最小房數」語意上分別對應到新版的 budgetMax／mainAreaMin／roomsMin。
export function normalizeNeedRanges(need) {
  const n = need || {};
  const pick = (newVal, legacyVal) => (newVal !== undefined && newVal !== null && newVal !== "" ? newVal : (legacyVal ?? ""));
  return {
    budgetMin: n.budgetMin ?? "",
    budgetMax: pick(n.budgetMax, n.budget),
    mainAreaMin: pick(n.mainAreaMin, n.minMainArea),
    mainAreaMax: n.mainAreaMax ?? "",
    roomsMin: pick(n.roomsMin, n.minRooms),
    roomsMax: n.roomsMax ?? "",
    bathMin: n.bathMin ?? "",
    bathMax: n.bathMax ?? "",
    ageMin: n.ageMin ?? "",
    ageMax: n.ageMax ?? "",
  };
}

// 把 min/max 組成一句摘要文字，例如「800~1200萬」「30坪以上」「2房以下」；兩者都沒填就回傳 null
export function rangeStatText(min, max, unit) {
  const hasMin = min !== "" && min !== null && min !== undefined;
  const hasMax = max !== "" && max !== null && max !== undefined;
  if (!hasMin && !hasMax) return null;
  if (hasMin && hasMax) return `${min}~${max}${unit}`;
  if (hasMax) return `${max}${unit}以下`;
  return `${min}${unit}以上`;
}
