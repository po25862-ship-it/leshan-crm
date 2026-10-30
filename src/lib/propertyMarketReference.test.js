import { comparableDeals, assessPropertyPriority } from "./propertyMarketReference";
const now = Date.parse("2026-10-29T04:00:00Z");
const property = { id: "p", category: "電梯大樓", totalPrice: 1500, titlePing: 50, parkingPing: 10, parkingPrice: 200, parkingCount: 1, layout: "3/2/2", address: "桃園市龜山區文青路222號", viewingStatus: "available", viewingConfirmedAt: "2026-10-28" };
const deal = { id: "a", date: "2026-09-01", kind: "sale", type: "住宅大樓(11層含以上有電梯)", use: "住家用", area: 50, price: 16000000, unit: 35, rooms: 3, parkingPrice: 2000000, parkingArea: 10, parkingType: "坡道平面", special: false };
const reference = { community: { id: "c" }, matchMethod: "exact-doorplate", deals: [deal, { ...deal, id: "b", date: "2026-08-01" }, { ...deal, id: "c", date: "2026-07-01" }] };
const needs = [{ id: "n", contactId: "buyer", statusTag: "正在找", budgetMax: 1600, areas: [{ city: "桃園市", district: "龜山區" }] }];
test("comparables include different room counts while excluding special, wrong-type and future records", () => {
  const source = { ...reference, deals: [...reference.deals, { ...deal, id: "special", special: true }, { ...deal, id: "future", date: "2027-01-01" }, { ...deal, id: "wrong-type", type: "店面" }, { ...deal, id: "two-room", rooms: 2 }, { ...deal, id: "far", area: 90 }] };
  expect(comparableDeals(property, source, { now })).toHaveLength(4);
  expect(comparableDeals(property, source, { now, sameRooms: true })).toHaveLength(3);
  expect(comparableDeals({ ...property, layout: "" }, source, { now })).toHaveLength(4);
});
test("missing parking price never earns a positive opportunity label", () => {
  const result = assessPropertyPriority({ ...property, titlePing: 34.43, totalPrice: 1750, parkingPing: 7.77, parkingPrice: "" }, reference, needs, { now });
  expect(result.code).toBe("missing_unit");
  expect(result.label).toBe("先把資料補齊");
  expect(result.missingFields).toEqual([{ label: "車位價格", fieldId: "property-parking-price" }]);
  expect(result.reason).not.toContain("車位坪數");
  expect(result.reason).toBe("這間還沒填車位價格，暫時沒辦法比較房子的每坪價格。");
  expect(result.next).toBe("確認車位價格後填進去，系統就會重新判斷。");
});
test("priority needs actual clients, recent comparable evidence, exact community and recent manual viewing confirmation", () => {
  expect(assessPropertyPriority(property, reference, needs, { now }).status).toBe("priority");
  expect(assessPropertyPriority(property, reference, [], { now }).status).toBe("pending");
  expect(assessPropertyPriority({ ...property, viewingConfirmedAt: "2026-01-01" }, reference, needs, { now }).status).toBe("pending");
  expect(assessPropertyPriority(property, { ...reference, matchMethod: "exact-community-name" }, needs, { now }).status).toBe("pending");
});
test("a higher asking price may trigger negotiation but never priority", () => {
  expect(assessPropertyPriority({ ...property, totalPrice: 1700 }, reference, needs, { now }).status).toBe("negotiate");
});
test("old and incomplete parking transactions cannot supply confident comparison samples", () => {
  const old = { ...reference, deals: reference.deals.map((d) => ({ ...d, date: "2024-01-01" })) };
  const result = assessPropertyPriority(property, old, needs, { now });
  expect(result.code).toBe("insufficient_comps");
  expect(result.label).toBe("近一年沒有可比較的成交");
});
test("offline or stale responses never keep an old positive priority label", () => {
  expect(assessPropertyPriority(property, reference, needs, { now, error: "offline" }).code).toBe("source_unavailable");
  expect(assessPropertyPriority(property, { ...reference, fetchedAt: now - 2 * 86400000 }, needs, { now }).code).toBe("stale_reference");
});

test("opportunity assessment uses eligible same-community sales across room counts", () => {
  const mixed = { ...reference, deals: reference.deals.map((row, index) => ({ ...row, rooms: index + 1 })) };
  const result = assessPropertyPriority(property, mixed, needs, { now });
  expect(result.status).toBe("priority");
  expect(result.sampleCount).toBe(3);
});

test("an above-reference asking price belongs to negotiation even without a matched customer", () => {
  const result = assessPropertyPriority({ ...property, totalPrice: 1700 }, reference, [], { now });
  expect(result.status).toBe("negotiate");
  expect(result.label).toBe("議價追蹤");
  expect(result.reason).toContain("目前還沒找到合適的客人");
  expect(result.missingFields).toBeUndefined();
});

test("priority assessment uses the requested car preset and clearly identifies the estimated basis", () => {
  const result = assessPropertyPriority({ ...property, parkingPrice: "", parkingDescription: "坡道平面" }, reference, needs, { now });
  expect(result.status).toBe("priority");
  expect(result.unit).toBe(33);
  expect(result.reason).toContain("平面每個 180 萬預設試算");
});

test("Huangxiang's two no-parking sales count alongside two fully split car sales, excluding the preset-only sale", () => {
  const subject = { ...property, titlePing: 42.15, totalPrice: 1598, parkingPing: 11.01, parkingPrice: "", parkingDescription: "坡道平面", layout: "2/2/1" };
  const raw = [
    { date: "2026-06-11", area: 40.67, price: 14300000, parkingType: "坡道平面", parkingPrice: 1800000, parkingArea: 9.53 },
    { date: "2026-04-12", area: 34.61, price: 13700000, parkingType: "", parkingPrice: 0, parkingArea: null },
    { date: "2026-04-09", area: 42.15, price: 14160000, parkingType: "坡道平面", parkingPrice: 1900000, parkingArea: 11.01 },
    { date: "2025-12-20", area: 45.97, price: 15750000, parkingType: "", parkingPrice: 0, parkingArea: null },
    { date: "2025-12-04", area: 42.15, price: 14150000, parkingType: "坡道平面", parkingPrice: 0, parkingArea: 11.01 },
  ];
  const actual = { ...reference, deals: raw.map((row, index) => ({ ...deal, id: String(index), ...row })) };
  const result = assessPropertyPriority(subject, actual, [], { now });
  expect(result.status).toBe("negotiate");
  expect(result.sampleCount).toBe(4);
  expect(result.referenceUnit.toFixed(2)).toBe("39.48");
  expect(result.unit.toFixed(2)).toBe("45.54");
  expect(result.reason).toContain("預設試算");
  const onlyTwo = { ...actual, deals: actual.deals.filter((row) => row.parkingType) };
  expect(assessPropertyPriority(subject, onlyTwo, [], { now }).sampleCount).toBe(2);
  expect(assessPropertyPriority(subject, onlyTwo, [], { now }).status).toBe("negotiate");
  expect(assessPropertyPriority(subject, onlyTwo, [], { now }).sampleNote).toContain("只有 2 筆");
});

test.each([1, 2])("%s usable sale(s) in the past year allow price comparison with a limited-sample note", (count) => {
  const data = { ...reference, deals: reference.deals.slice(0, count) };
  const result = assessPropertyPriority(property, data, needs, { now });
  expect(result.status).toBe("priority");
  expect(result.sampleCount).toBe(count);
  expect(result.referenceUnit).toBe(35);
  expect(result.reason).toContain(`近一年只有 ${count} 筆可用成交`);
  const expensive = assessPropertyPriority({ ...property, totalPrice: 1700 }, data, [], { now });
  expect(expensive.status).toBe("negotiate");
  expect(expensive.sampleCount).toBe(count);
});

test("the one-year cutoff is inclusive and older or future sales cannot provide comparison evidence", () => {
  const data = { ...reference, deals: [
    { ...deal, id: "boundary", date: "2025-10-29" },
    { ...deal, id: "old", date: "2025-10-28" },
    { ...deal, id: "future", date: "2026-10-30" },
  ] };
  expect(comparableDeals(property, data, { now }).map((row) => row.id)).toEqual(["boundary"]);
  const result = assessPropertyPriority(property, data, needs, { now });
  expect(result.sampleCount).toBe(1);
  expect(result.sampleDates).toEqual(["2025-10-29"]);
  const oldOnly = { ...data, deals: data.deals.filter((row) => row.id !== "boundary") };
  expect(assessPropertyPriority(property, oldOnly, needs, { now }).code).toBe("insufficient_comps");
});

test("incomplete recent sales do not hide a single usable sale later in the past-year records", () => {
  const data = { ...reference, deals: [
    ...Array.from({ length: 5 }, (_, i) => ({ ...deal, id: `incomplete-${i}`, parkingPrice: 0 })),
    { ...deal, id: "usable", date: "2026-08-01" },
    { ...deal, id: "too-old", date: "2024-01-01" },
  ] };
  const result = assessPropertyPriority(property, data, needs, { now });
  expect(result.status).toBe("priority");
  expect(result.sampleCount).toBe(1);
  expect(result.sampleDates).toEqual(["2026-08-01"]);
});
