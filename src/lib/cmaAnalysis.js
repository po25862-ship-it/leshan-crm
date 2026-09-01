const numeric = (value) => {
  if (value === "" || value === null || value === undefined) return null;
  const parsed = Number(String(value).replace(/,/g, ""));
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
};

const propertyArea = (property) => numeric(property?.titlePing) || numeric(property?.mainBuildingPing);
const propertyPrice = (property) => numeric(property?.soldPrice) || numeric(property?.totalPrice);
const propertyName = (property) => property?.title || property?.communityName || property?.community || property?.address || "未命名物件";
const communityName = (property) => String(property?.communityName || property?.community || "").trim();

const regionKey = (property) => {
  const source = String(property?.area || property?.address || "").replace(/s/g, "");
  const match = source.match(/([^縣市]{1,3}[縣市])?([^區鄉鎮市]{1,4}[區鄉鎮市])/);
  return match?.[2] || String(property?.area || "").trim();
};

const median = (numbers) => {
  const sorted = [...numbers].sort((a, b) => a - b);
  if (!sorted.length) return null;
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
};

const round = (value, digits = 1) => {
  if (!Number.isFinite(value)) return null;
  const base = 10 ** digits;
  return Math.round(value * base) / base;
};

function comparableScore(target, candidate) {
  let score = 0;
  const targetCommunity = communityName(target);
  const candidateCommunity = communityName(candidate);
  if (targetCommunity && candidateCommunity && targetCommunity === candidateCommunity) score += 6;
  if (regionKey(target) && regionKey(target) === regionKey(candidate)) score += 3;
  if (target.category && target.category === candidate.category) score += 2;
  if (target.layout && target.layout === candidate.layout) score += 1;
  const targetArea = propertyArea(target);
  const candidateArea = propertyArea(candidate);
  if (targetArea && candidateArea) {
    const difference = Math.abs(candidateArea - targetArea) / targetArea;
    if (difference <= 0.15) score += 3;
    else if (difference <= 0.3) score += 2;
    else if (difference <= 0.45) score += 1;
  }
  return score;
}

export function buildCmaAnalysis(target, properties) {
  const targetArea = propertyArea(target);
  const askingPrice = propertyPrice(target);
  const candidates = (properties || [])
    .filter((candidate) => candidate?.id !== target?.id)
    .map((candidate) => {
      const area = propertyArea(candidate);
      const price = propertyPrice(candidate);
      if (!area || !price) return null;
      return {
        id: candidate.id || "",
        name: propertyName(candidate),
        community: communityName(candidate),
        region: regionKey(candidate),
        area: round(area),
        price: round(price),
        unitPrice: round(price / area, 2),
        status: candidate.status || "active",
        score: comparableScore(target, candidate),
      };
    })
    .filter(Boolean)
    .filter((candidate) => candidate.score >= 2)
    .sort((a, b) => b.score - a.score || Math.abs((a.area || 0) - (targetArea || 0)) - Math.abs((b.area || 0) - (targetArea || 0)))
    .slice(0, 6);

  const unitPrices = candidates.map((candidate) => candidate.unitPrice).filter(Boolean);
  const medianUnitPrice = median(unitPrices);
  const sortedUnitPrices = [...unitPrices].sort((a, b) => a - b);
  const lowUnitPrice = sortedUnitPrices.length >= 3
    ? sortedUnitPrices[Math.floor((sortedUnitPrices.length - 1) * 0.25)]
    : medianUnitPrice ? medianUnitPrice * 0.93 : null;
  const highUnitPrice = sortedUnitPrices.length >= 3
    ? sortedUnitPrices[Math.ceil((sortedUnitPrices.length - 1) * 0.75)]
    : medianUnitPrice ? medianUnitPrice * 1.07 : null;
  const recommendedLow = targetArea && lowUnitPrice ? round(targetArea * lowUnitPrice) : askingPrice ? round(askingPrice * 0.95) : null;
  const recommendedHigh = targetArea && highUnitPrice ? round(targetArea * highUnitPrice) : askingPrice ? round(askingPrice * 1.05) : null;
  const midpoint = recommendedLow && recommendedHigh ? (recommendedLow + recommendedHigh) / 2 : null;
  const askingDifferencePercent = askingPrice && midpoint ? round(((askingPrice / midpoint) - 1) * 100) : null;
  const sameCommunityCount = candidates.filter((candidate) => candidate.score >= 6).length;
  const confidence = candidates.length >= 5 && sameCommunityCount >= 2 ? "高" : candidates.length >= 3 ? "中" : "低";

  const factors = [
    communityName(target) ? `目標社區：${communityName(target)}` : "未填社區名稱，改以區域與物件條件比較",
    targetArea ? `比較面積基準：${round(targetArea)} 坪` : "未填權狀／主建物坪數，無法精算建議單價",
    candidates.length ? `找到 ${candidates.length} 筆可比較物件，其中 ${sameCommunityCount} 筆為同社區優先樣本` : "CRM 中沒有足夠的相近物件",
  ];
  if (askingDifferencePercent !== null) {
    factors.push(askingDifferencePercent > 0
      ? `目前開價較建議區間中值高約 ${Math.abs(askingDifferencePercent)}%`
      : askingDifferencePercent < 0
        ? `目前開價較建議區間中值低約 ${Math.abs(askingDifferencePercent)}%`
        : "目前開價接近建議區間中值");
  }

  return {
    type: "cma",
    title: `${propertyName(target)}・CMA 行情分析`,
    sourceLabel: "CRM 現有物件比較",
    generatedAt: new Date().toISOString(),
    confidence,
    targetArea: round(targetArea),
    askingPrice: round(askingPrice),
    comparableCount: candidates.length,
    medianUnitPrice: round(medianUnitPrice, 2),
    lowUnitPrice: round(lowUnitPrice, 2),
    highUnitPrice: round(highUnitPrice, 2),
    recommendedLow,
    recommendedHigh,
    askingDifferencePercent,
    summary: candidates.length
      ? `依 ${candidates.length} 筆相近物件估算，建議總價區間為 ${recommendedLow || "—"}～${recommendedHigh || "—"} 萬，分析信心為${confidence}。`
      : `目前缺少相近物件，暫以開價上下 5% 作為觀察區間，分析信心為低。`,
    factors,
    comparables: candidates,
    disclaimer: "本報告依 CRM 內現有物件資料估算，並非政府實價登錄鑑價；正式建議仍需確認屋況、樓層、車位、座向與近期成交資料。",
  };
}
