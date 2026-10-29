export function nonNegativeNumber(value) {
  if ((typeof value !== "number" && typeof value !== "string") || String(value).trim() === "") return null;
  const number = Number(String(value).normalize("NFKC").replace(/,/g, ""));
  return Number.isFinite(number) && number >= 0 ? number : null;
}

export function propertyParkingState(property = {}) {
  const description = String(property.parkingDescription || "").trim();
  const area = nonNegativeNumber(property.parkingPing);
  const count = nonNegativeNumber(property.parkingCount);
  const evidence = (area || 0) > 0 || (count || 0) > 0 || Boolean(property.parkingNumber) || (description && description !== "無");
  if (description === "無" && evidence) return "unknown";
  if (evidence) return "yes";
  if (description === "無" || count === 0 || area === 0) return "no";
  return "unknown";
}

export function propertyUnitPrice(property = {}, basis = "gross") {
  const price = nonNegativeNumber(property.totalPrice);
  const area = nonNegativeNumber(property.titlePing);
  if (!(price > 0) || !(area > 0)) return null;
  if (basis === "gross") return price / area;
  const parking = propertyParkingState(property);
  if (parking === "no") return price / area;
  const parkingPrice = nonNegativeNumber(property.parkingPrice);
  const parkingArea = nonNegativeNumber(property.parkingPing);
  if (parking !== "yes" || !(parkingPrice > 0) || !(parkingArea > 0) || parkingPrice >= price || parkingArea >= area) return null;
  return (price - parkingPrice) / (area - parkingArea);
}

export function matchesUnitPrice(property, minimum, maximum, basis = "gross") {
  if (minimum === "" && maximum === "") return basis === "net" ? propertyUnitPrice(property, basis) !== null : true;
  const min = minimum === "" ? 0 : nonNegativeNumber(minimum);
  const max = maximum === "" ? Infinity : nonNegativeNumber(maximum);
  const unit = propertyUnitPrice(property, basis);
  return min !== null && max !== null && min <= max && unit !== null && unit >= min && unit <= max;
}

export function formatUnitPrice(property, basis = "gross") {
  const unit = propertyUnitPrice(property, basis);
  return unit === null ? "未提供" : `${unit.toFixed(2)} 萬／坪`;
}

export function officialNetUnit(deal = {}) {
  const price = nonNegativeNumber(deal.price);
  const area = nonNegativeNumber(deal.area);
  const parkingPrice = nonNegativeNumber(deal.parkingPrice);
  const parkingArea = nonNegativeNumber(deal.parkingArea);
  if (!(price > 0) || !(area > 0)) return null;
  if (parkingPrice > 0 && parkingArea > 0 && parkingPrice < price && parkingArea < area) return (price - parkingPrice) / (area - parkingArea) / 10000;
  if (!deal.parkingType && parkingPrice === 0 && parkingArea === 0) return price / area / 10000;
  return null;
}
