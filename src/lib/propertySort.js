import { parseAge } from "./age";
import { propertyUnitPrice } from "./propertyUnitPrice";

export const PROPERTY_SORT_OPTIONS = [
  { value: "newest", label: "新案件優先" },
  { value: "price-asc", label: "總價低 → 高" },
  { value: "price-desc", label: "總價高 → 低" },
  { value: "unit-price-asc", label: "單價低 → 高" },
  { value: "unit-price-desc", label: "單價高 → 低" },
  { value: "main-area-desc", label: "主建物坪數大 → 小" },
  { value: "age-asc", label: "屋齡新 → 舊" },
  { value: "price-drop", label: "最近降價優先" },
];

function timestamp(value) {
  if (!value) return null;
  const date = typeof value.toDate === "function" ? value.toDate() :
    typeof value.seconds === "number" ? new Date(value.seconds * 1000) : new Date(value);
  const time = date.getTime();
  return Number.isFinite(time) ? time : null;
}

function positiveNumber(value) {
  if (value === "" || value === null || value === undefined) return null;
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : null;
}

function newestTime(property) {
  return timestamp(property.firstSeenAt) ?? timestamp(property.createdAt);
}

function recentPriceDrop(property) {
  const change = property.lastPriceChange;
  const before = positiveNumber(change?.oldPrice);
  const after = positiveNumber(change?.newPrice);
  return before !== null && after !== null && after < before ? timestamp(change?.date) : null;
}

function compareKnown(a, b, direction = "desc") {
  if (a === null && b === null) return 0;
  if (a === null) return 1;
  if (b === null) return -1;
  return direction === "asc" ? a - b : b - a;
}

export function sortProperties(properties, sortBy = "newest", { unitPriceBasis = "gross" } = {}) {
  return [...properties].sort((a, b) => {
    let comparison = 0;
    switch (sortBy) {
      case "price-asc":
        comparison = compareKnown(positiveNumber(a.totalPrice), positiveNumber(b.totalPrice), "asc");
        break;
      case "price-desc":
        comparison = compareKnown(positiveNumber(a.totalPrice), positiveNumber(b.totalPrice));
        break;
      case "unit-price-asc":
        comparison = compareKnown(propertyUnitPrice(a, unitPriceBasis), propertyUnitPrice(b, unitPriceBasis), "asc");
        break;
      case "unit-price-desc":
        comparison = compareKnown(propertyUnitPrice(a, unitPriceBasis), propertyUnitPrice(b, unitPriceBasis));
        break;
      case "main-area-desc":
        comparison = compareKnown(positiveNumber(a.mainBuildingPing), positiveNumber(b.mainBuildingPing));
        break;
      case "age-asc":
        comparison = compareKnown(parseAge(a.age), parseAge(b.age), "asc");
        break;
      case "price-drop":
        comparison = compareKnown(recentPriceDrop(a), recentPriceDrop(b));
        break;
      default:
        comparison = compareKnown(newestTime(a), newestTime(b));
    }
    return comparison || compareKnown(newestTime(a), newestTime(b)) ||
      String(a.listingNo || a.id || "").localeCompare(String(b.listingNo || b.id || ""), "zh-Hant");
  });
}
