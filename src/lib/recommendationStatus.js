export const RECOMMENDATION_STATUS = {
  pending: "pending",
  introduced: "introduced",
  interested: "interested",
  notInterested: "notInterested",
};

export const RECOMMENDATION_STATUS_LABELS = {
  pending: "待介紹",
  introduced: "已介紹／待回覆",
  interested: "有興趣／持續追蹤",
  notInterested: "沒興趣",
};

export function getRecommendationStatus(item) {
  if (item?.status && RECOMMENDATION_STATUS_LABELS[item.status]) return item.status;
  return item?.introduced ? RECOMMENDATION_STATUS.introduced : RECOMMENDATION_STATUS.pending;
}

export function isActiveRecommendation(item) {
  const status = getRecommendationStatus(item);
  return status === RECOMMENDATION_STATUS.pending || status === RECOMMENDATION_STATUS.interested;
}

export function recommendationCounts(items = []) {
  return items.reduce((counts, item) => {
    const status = getRecommendationStatus(item);
    counts.total += 1;
    counts[status] += 1;
    return counts;
  }, { total: 0, pending: 0, introduced: 0, interested: 0, notInterested: 0 });
}
