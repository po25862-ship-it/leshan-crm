import { sortProperties } from "./propertySort";

const properties = [
  { id: "old", firstSeenAt: "2026-10-01T08:00:00Z", totalPrice: 900, mainBuildingPing: 28, age: "15年", lastPriceChange: { oldPrice: 1000, newPrice: 900, date: "2026-10-03" } },
  { id: "new", firstSeenAt: { seconds: Date.parse("2026-10-10T08:00:00Z") / 1000 }, totalPrice: 1500, mainBuildingPing: 32, age: "5年6個月", lastPriceChange: { oldPrice: 1600, newPrice: 1500, date: "2026-10-12" } },
  { id: "missing", createdAt: "2026-09-01", totalPrice: "", mainBuildingPing: "", age: "", lastPriceChange: { oldPrice: 100, newPrice: 120, date: "2026-10-15" } },
];

test("排序不改動來源，預設以首次掃描時間的新案優先", () => {
  expect(sortProperties(properties).map((item) => item.id)).toEqual(["new", "old", "missing"]);
  expect(properties.map((item) => item.id)).toEqual(["old", "new", "missing"]);
});

test("價錢、主建物與屋齡排序把缺資料的物件放最後", () => {
  expect(sortProperties(properties, "price-asc").map((item) => item.id)).toEqual(["old", "new", "missing"]);
  expect(sortProperties(properties, "price-desc").map((item) => item.id)).toEqual(["new", "old", "missing"]);
  expect(sortProperties(properties, "main-area-desc").map((item) => item.id)).toEqual(["new", "old", "missing"]);
  expect(sortProperties(properties, "age-asc").map((item) => item.id)).toEqual(["new", "old", "missing"]);
});

test("最近降價只計算真正降價，不把漲價排在前面", () => {
  expect(sortProperties(properties, "price-drop").map((item) => item.id)).toEqual(["new", "old", "missing"]);
});

test("單價排序遵守選定車位口徑，缺資料放最後", () => {
  const rows = [
    { id: "b", totalPrice: 900, titlePing: 30, parkingPing: 10, parkingCount: 1 },
    { id: "a", totalPrice: 1000, titlePing: 50, parkingPing: 10, parkingCount: 1, parkingPrice: 200 },
    { id: "unknown", totalPrice: 800 },
  ];
  expect(sortProperties(rows, "unit-price-asc").map((p) => p.id)).toEqual(["a", "b", "unknown"]);
  expect(sortProperties(rows, "unit-price-desc").map((p) => p.id)).toEqual(["b", "a", "unknown"]);
  expect(sortProperties(rows, "unit-price-asc", { unitPriceBasis: "net" })[0].id).toBe("a");
});

test("暫時不賣按最近轉入時間排列，案件建立及同步日期不會搶到前面", () => {
  const rows = [
    { id: "recent-listing", firstSeenAt: "2026-11-08", statusChangedAt: "2026-11-06", updatedAt: "2026-11-09", totalPrice: 1000 },
    { id: "recently-paused", firstSeenAt: "2026-08-17", statusChangedAt: "2026-11-09T00:15:00+08:00", updatedAt: "2026-11-08", totalPrice: 2000 },
    { id: "same-day-legacy", firstSeenAt: "2026-09-01", statusChangedAt: "2026-11-09" },
    { id: "fallback", firstSeenAt: "2026-08-01", firstOnHoldAt: { seconds: Date.parse("2026-11-07T10:00:00+08:00") / 1000 } },
    { id: "unknown", firstSeenAt: "2026-12-01", updatedAt: "2026-12-01" },
  ];
  expect(sortProperties(rows, "newest", { viewMode: "onHold" }).map(item => item.id))
    .toEqual(["recently-paused", "same-day-legacy", "fallback", "recent-listing", "unknown"]);
  expect(rows[0].id).toBe("recent-listing");
  expect(sortProperties(rows, "price-asc", { viewMode: "onHold" }).slice(0, 2).map(item => item.id))
    .toEqual(["recent-listing", "recently-paused"]);
  expect(sortProperties(rows)[0].id).toBe("unknown");
});

test("重新轉入以本次狀態日期為準，舊資料缺日期放最後", () => {
  const rows = [
    { id: "earlier", statusChangedAt: "2026-11-09T09:00:00+08:00", createdAt: "2026-11-08" },
    { id: "returned", statusChangedAt: "2026-11-09T11:00:00+08:00", firstOnHoldAt: "2026-10-01", createdAt: "2026-01-01" },
    { id: "invalid", statusChangedAt: "尚未記錄", createdAt: "2026-11-09" },
  ];
  expect(sortProperties(rows, "newest", { viewMode: "onHold" }).map(item => item.id))
    .toEqual(["returned", "earlier", "invalid"]);
});
