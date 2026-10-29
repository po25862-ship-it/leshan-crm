import { dealParkingComparison } from "./propertyDealParking";
import { officialNetUnit } from "./propertyUnitPrice";

test.each([
  [12000000, 31.75, "坡道平面", 9.33, 180, "45.50"],
  [13680000, 35.8, "坡道機械", 6.8, 150, "42.00"],
  [11680000, 34.5, "坡道機械", 6.8, 150, "36.75"],
])("unseparated sale %s uses the requested preset without changing official data", (price, area, parkingType, parkingArea, priceWan, expected) => {
  const deal = Object.freeze({ price, area, parkingType, parkingArea, parkingPrice: 0, unit: 37.79 });
  const comparison = dealParkingComparison(deal);
  expect(comparison.source).toBe("preset");
  expect(comparison.priceWan).toBe(priceWan);
  expect(comparison.unit.toFixed(2)).toBe(expected);
  expect(deal.parkingPrice).toBe(0);
  expect(deal.unit).toBe(37.79);
  expect(officialNetUnit(deal)).toBeNull();
});

test("an official total car price takes precedence, including for multiple spaces", () => {
  const deal = { price: 20000000, area: 60, parkingType: "坡道平面", parkingArea: 20, parkingPrice: 3200000, parkingCount: 2 };
  expect(dealParkingComparison(deal)).toEqual(expect.objectContaining({ source: "official", priceWan: 320, unit: 42 }));
  const estimated = dealParkingComparison({ ...deal, parkingPrice: 0 });
  expect(estimated.priceWan).toBe(360);
  expect(estimated.count).toBe(2);
});

test("missing areas, unknown or mixed types and impossible values never receive a numeric estimate", () => {
  const deal = { price: 12000000, area: 31.75, parkingType: "坡道平面", parkingArea: 9.33, parkingPrice: 0 };
  expect(dealParkingComparison({ ...deal, parkingArea: null }).reason).toBe("需補車位坪數");
  for (const patch of [{ parkingType: "其他" }, { parkingType: "平面及機械" }, { parkingArea: 40 }, { parkingPrice: 15000000 }, { area: 0 }, { price: 0 }]) {
    expect(dealParkingComparison({ ...deal, ...patch }).unit).toBeNull();
  }
  expect(dealParkingComparison({ price: 12000000, area: 30 }).unit).toBeNull();
  expect(dealParkingComparison({ price: 12000000, area: 30, parkingType: "", parkingPrice: 0, parkingArea: null })).toEqual({ unit: 40, source: "no-parking" });
});
