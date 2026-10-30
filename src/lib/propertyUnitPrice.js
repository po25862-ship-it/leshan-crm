export function nonNegativeNumber(value) {
  if ((typeof value !== "number" && typeof value !== "string") || String(value).trim() === "") return null;
  const number = Number(String(value).normalize("NFKC").replace(/,/g, ""));
  return Number.isFinite(number) && number >= 0 ? number : null;
}

export function resolvePropertyParkingPrice(property = {}) {
  const entered = property.parkingPrice;
  if (entered != null && String(entered).trim() !== "") {
    return { price: nonNegativeNumber(entered), source: "entered" };
  }
  const description = String(property.parkingDescription || property.parkingType || "").normalize("NFKC");
  const flat = /平面|平車|坡平/.test(description);
  const mechanical = /機械|塔式|[升昇]降橫移/.test(description);
  // Mixed types need a total entered by the user; a space number is not a quantity.
  if (flat === mechanical || /^(無|無車位|沒有車位|不含車位)$/.test(description.trim())) {
    return { price: null, source: "unavailable" };
  }
  const quantity = nonNegativeNumber(property.parkingCount);
  if (quantity > 0 && !Number.isInteger(quantity)) return { price: null, source: "unavailable" };
  const count = quantity > 0 ? quantity : 1;
  const kind = flat ? "平面" : "機械";
  const perSpace = flat ? 180 : 150;
  return { price: perSpace * count, source: "preset", kind, perSpace, count };
}

export function formatPropertyParkingPrice(property) {
  const resolved = resolvePropertyParkingPrice(property);
  if (resolved.price === null) return "未提供";
  return `${resolved.price} 萬${resolved.source === "preset" ? `（${resolved.kind}${resolved.count > 1 ? ` ${resolved.count} 個` : ""}預設）` : ""}`;
}

export function parkingPricePresetNote(property) {
  const resolved = resolvePropertyParkingPrice(property);
  return resolved.source === "preset"
    ? `車位價格採${resolved.kind}每個 ${resolved.perSpace} 萬預設試算${resolved.count > 1 ? `，${resolved.count} 個合計 ${resolved.price} 萬` : ""}。`
    : "";
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
  const parkingPrice = resolvePropertyParkingPrice(property).price;
  const parkingArea = nonNegativeNumber(property.parkingPing);
  if (parking !== "yes" || !(parkingPrice > 0) || !(parkingArea > 0) || parkingPrice >= price || parkingArea >= area) return null;
  return (price - parkingPrice) / (area - parkingArea);
}

export function priorityPriceTarget(property = {}, referenceUnit) {
  const unit = nonNegativeNumber(referenceUnit);
  const area = nonNegativeNumber(property.titlePing);
  const parking = propertyParkingState(property);
  if (!(unit > 0) || !(area > 0) || parking === "unknown") return null;
  const resolved = parking === "yes" ? resolvePropertyParkingPrice(property) : { price: 0, source: "none" };
  const carArea = parking === "yes" ? nonNegativeNumber(property.parkingPing) : 0;
  if (parking === "yes" && (!(resolved.price > 0) || !(carArea > 0) || carArea >= area)) return null;
  const netPing = area - carArea;
  const exactTotal = unit * netPing + resolved.price;
  if (!Number.isFinite(exactTotal) || exactTotal <= 0) return null;
  // Quote a price to 0.01 wan without rounding above the classifier's limit.
  let totalPrice = Math.floor(exactTotal * 100) / 100;
  const unitAtTarget = propertyUnitPrice({ ...property, totalPrice }, "net");
  if (unitAtTarget === null) return null;
  if (unitAtTarget > unit) totalPrice = Math.round((totalPrice - 0.01) * 100) / 100;
  if (!(totalPrice > resolved.price)) return null;
  return { totalPrice, referenceUnit: unit, netPing, parkingPrice: resolved.price, parkingSource: resolved.source };
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
  return unit === null ? "未提供" : `${unit.toFixed(2)} 萬／坪${basis === "net" && resolvePropertyParkingPrice(property).source === "preset" ? "（預設試算）" : ""}`;
}

export function missingUnitPriceFields(property = {}) {
  const missing = [];
  const price = nonNegativeNumber(property.totalPrice);
  const area = nonNegativeNumber(property.titlePing);
  if (!(price > 0)) missing.push({ label: "總價", fieldId: "property-total-price" });
  if (!(area > 0)) missing.push({ label: "權狀坪數", fieldId: "property-title-ping" });
  const parking = propertyParkingState(property);
  if (parking === "unknown") missing.push({ label: "車位狀況", fieldId: "property-parking-description" });
  if (parking === "yes") {
    const carPrice = resolvePropertyParkingPrice(property).price;
    const carArea = nonNegativeNumber(property.parkingPing);
    if (!(carPrice > 0) || (price > 0 && carPrice >= price)) missing.push({ label: "車位價格", fieldId: "property-parking-price" });
    if (!(carArea > 0) || (area > 0 && carArea >= area)) missing.push({ label: "車位坪數", fieldId: "property-parking-ping" });
  }
  return missing;
}

export function officialNetUnit(deal = {}) {
  const price = nonNegativeNumber(deal.price);
  const area = nonNegativeNumber(deal.area);
  const parkingPrice = nonNegativeNumber(deal.parkingPrice);
  const parkingArea = nonNegativeNumber(deal.parkingArea);
  if (!(price > 0) || !(area > 0)) return null;
  if (parkingPrice > 0 && parkingArea > 0 && parkingPrice < price && parkingArea < area) return (price - parkingPrice) / (area - parkingArea) / 10000;
  // Official no-parking sales leave the inapplicable parking area blank/null.
  // Zero car price alone is not enough: reject parking types or invalid areas.
  const noParkingArea = parkingArea === 0 || deal.parkingArea == null || deal.parkingArea === "";
  if (!String(deal.parkingType || "").trim() && parkingPrice === 0 && noParkingArea) return price / area / 10000;
  return null;
}
