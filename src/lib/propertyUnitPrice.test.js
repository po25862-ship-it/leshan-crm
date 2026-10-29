import { propertyUnitPrice, matchesUnitPrice, officialNetUnit, propertyParkingState, resolvePropertyParkingPrice, formatPropertyParkingPrice, missingUnitPriceFields, formatUnitPrice } from "./propertyUnitPrice";

const p = { totalPrice: 1758, titlePing: 54.59, parkingPing: 11.01, parkingCount: 1 };
test("gross and parking-exclusive asking prices remain distinct", () => {
  expect(propertyUnitPrice(p)).toBeCloseTo(32.2037);
  expect(propertyUnitPrice(p, "net")).toBeNull();
  expect(propertyUnitPrice({ ...p, parkingPrice: 200 }, "net")).toBeCloseTo(35.7503);
});
test("missing car information, zero car price and contradictory values do not become confirmed net prices", () => {
  expect(propertyUnitPrice({ totalPrice: 1000, titlePing: 30 }, "net")).toBeNull();
  expect(propertyUnitPrice({ ...p, parkingPrice: 0 }, "net")).toBeNull();
  expect(propertyUnitPrice({ ...p, parkingPrice: 200, parkingPing: 0 }, "net")).toBeNull();
  expect(propertyParkingState({ ...p, parkingDescription: "無" })).toBe("unknown");
  expect(propertyUnitPrice({ totalPrice: 1000, titlePing: 25, parkingDescription: "無" }, "net")).toBe(40);
});
test("filter ranges handle inclusive boundaries, unknown values and invalid ranges", () => {
  expect(matchesUnitPrice(p, "32", "33")).toBe(true);
  expect(matchesUnitPrice(p, "", "30")).toBe(false);
  expect(matchesUnitPrice(p, "30", "40", "net")).toBe(false);
  expect(matchesUnitPrice(p, "40", "30")).toBe(false);
  expect(matchesUnitPrice({}, "", "")).toBe(true);
  expect(matchesUnitPrice({}, "", "", "net")).toBe(false);
});
test("official net comparison needs actual parking split and never replaces the disclosed unit", () => {
  const d = { price: 16300000, area: 54.59, unit: 32.81, parkingPrice: 2000000, parkingArea: 11.01, parkingType: "坡道平面" };
  expect(officialNetUnit(d)).toBeCloseTo(32.8132);
  expect(officialNetUnit({ ...d, parkingPrice: 0 })).toBeNull();
  expect(d.unit).toBe(32.81);
});

test("flat and mechanical presets apply consistently to net calculations, filters and missing fields", () => {
  const flat = { ...p, parkingDescription: "坡道平面", parkingPrice: "" };
  const mechanical = { ...p, parkingDescription: "升降機械" };
  expect(resolvePropertyParkingPrice(flat).price).toBe(180);
  expect(resolvePropertyParkingPrice(mechanical).price).toBe(150);
  expect(propertyUnitPrice(flat, "net")).toBeCloseTo((1758 - 180) / (54.59 - 11.01));
  expect(matchesUnitPrice(flat, "36", "37", "net")).toBe(true);
  expect(missingUnitPriceFields(flat)).toEqual([]);
  expect(formatUnitPrice(flat, "net")).toContain("預設試算");
  expect(formatPropertyParkingPrice(flat)).toBe("180 萬（平面預設）");
  expect(flat.parkingPrice).toBe("");
});

test("multiple spaces use a total preset but explicitly entered values always take precedence", () => {
  const flat = { ...p, parkingDescription: "升降平面", parkingCount: 2 };
  expect(resolvePropertyParkingPrice(flat).price).toBe(360);
  expect(resolvePropertyParkingPrice({ ...flat, parkingPrice: "250" })).toEqual({ price: 250, source: "entered" });
  expect(resolvePropertyParkingPrice({ ...flat, parkingPrice: 0 })).toEqual({ price: 0, source: "entered" });
  expect(resolvePropertyParkingPrice({ ...flat, parkingPrice: "bad" }).price).toBeNull();
  expect(resolvePropertyParkingPrice({ ...flat, parkingCount: "" }).price).toBe(180);
});

test("unknown or mixed types are not guessed and official sales never receive asking-price presets", () => {
  for (const parkingDescription of ["無", "有", "", "平面及機械", "機車位"]) {
    expect(resolvePropertyParkingPrice({ ...p, parkingDescription }).price).toBeNull();
  }
  expect(resolvePropertyParkingPrice({ ...p, parkingDescription: "坡道平面", parkingCount: 1.5 }).price).toBeNull();
  expect(officialNetUnit({ price: 16000000, area: 50, parkingArea: 10, parkingType: "坡道平面" })).toBeNull();
});
