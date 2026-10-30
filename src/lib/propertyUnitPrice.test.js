import { priorityPriceTarget, propertyUnitPrice, matchesUnitPrice, officialNetUnit, propertyParkingState, resolvePropertyParkingPrice, formatPropertyParkingPrice, missingUnitPriceFields, formatUnitPrice } from "./propertyUnitPrice";

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

test("official no-parking sales accept blank inapplicable areas without accepting incomplete parking sales", () => {
  const sale = { price: 13700000, area: 34.61, parkingType: "", parkingPrice: 0 };
  for (const parkingArea of [null, undefined, "", 0]) {
    expect(officialNetUnit({ ...sale, parkingArea })).toBeCloseTo(39.5839);
  }
  for (const patch of [{ parkingArea: "bad" }, { parkingArea: -1 }, { parkingArea: 8 }, { parkingType: "坡道平面", parkingArea: null }, { parkingType: "坡道平面", parkingArea: 8 }, { parkingPrice: null }]) {
    expect(officialNetUnit({ ...sale, ...patch })).toBeNull();
  }
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

test.each([
  [{ totalPrice: 1700, titlePing: 50, parkingPing: 10, parkingPrice: 200 }, 35, 1600, 200, 'entered'],
  [{ totalPrice: 1700, titlePing: 50, parkingPing: 10, parkingDescription: '坡道平面' }, 35, 1580, 180, 'preset'],
  [{ totalPrice: 1700, titlePing: 50, parkingPing: 10, parkingDescription: '機械', parkingCount: 2 }, 35, 1700, 300, 'preset'],
  [{ totalPrice: 1200, titlePing: 30, parkingDescription: '無' }, 35, 1050, 0, 'none'],
])('the target total reverses the same net-price basis and adds the full parking value', (property, unit, total, carPrice, source) => {
  const target = priorityPriceTarget(property, unit);
  expect(target.totalPrice).toBe(total);
  expect(target.parkingPrice).toBe(carPrice);
  expect(target.parkingSource).toBe(source);
  expect(propertyUnitPrice({ ...property, totalPrice: target.totalPrice }, 'net')).toBeLessThanOrEqual(unit);
  expect(propertyUnitPrice({ ...property, totalPrice: target.totalPrice + 0.01 }, 'net')).toBeGreaterThan(unit);
});

test('the quoted total rounds down and never invents a target from missing or impossible data', () => {
  const subject = { titlePing: 43.21, parkingDescription: '無' };
  const target = priorityPriceTarget(subject, 35.123456);
  expect(target.totalPrice).toBeLessThanOrEqual(43.21 * 35.123456);
  expect(propertyUnitPrice({ ...subject, totalPrice: target.totalPrice }, 'net')).toBeLessThanOrEqual(35.123456);
  for (const [input, unit] of [[{}, 35], [subject, null], [subject, -1], [{ titlePing: 40 }, 35], [{ titlePing: 40, parkingPing: 5, parkingDescription: '有' }, 35], [{ titlePing: 40, parkingPing: 40, parkingDescription: '平面' }, 35]]) {
    expect(priorityPriceTarget(input, unit)).toBeNull();
  }
});
