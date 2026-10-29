import { nonNegativeNumber, resolvePropertyParkingPrice } from "./propertyUnitPrice";

// Official sale prices are in yuan. Keep the source record intact and return a
// separate comparison value; preset estimates never become official evidence.
export function dealParkingComparison(deal = {}) {
  const total = nonNegativeNumber(deal.price);
  const area = nonNegativeNumber(deal.area);
  const carArea = nonNegativeNumber(deal.parkingArea);
  const carPrice = nonNegativeNumber(deal.parkingPrice);
  const type = String(deal.parkingType || "").trim();
  const unavailable = (reason) => ({ unit: null, source: "unavailable", reason });
  if (!(total > 0) || !(area > 0)) return unavailable("需確認成交總價及坪數");
  const hasParking = Boolean(type) || carArea > 0 || carPrice > 0;
  if (!hasParking) {
    return carPrice === 0 && (carArea === null || carArea === 0)
      ? { unit: total / area / 10000, source: "no-parking" }
      : unavailable("需確認車位資料");
  }
  if (!(carArea > 0)) return unavailable("需補車位坪數");
  if (carArea >= area) return unavailable("需確認車位坪數");
  const resolved = carPrice > 0
    ? { price: carPrice / 10000, source: "official" }
    : resolvePropertyParkingPrice({ parkingDescription: type, parkingCount: deal.parkingCount });
  if (resolved.price === null) return unavailable("需確認車位類型及數量");
  if (!(resolved.price > 0) || resolved.price * 10000 >= total) return unavailable("需確認車位價格");
  return {
    unit: (total / 10000 - resolved.price) / (area - carArea),
    source: resolved.source === "preset" ? "preset" : "official",
    priceWan: resolved.price,
    area: carArea,
    kind: resolved.kind,
    count: resolved.count,
  };
}
