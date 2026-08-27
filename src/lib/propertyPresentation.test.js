import { getRecentPriceDrop } from "./propertyPresentation";

const now = new Date("2026-08-27T12:00:00+08:00").getTime();

test("辨識近 14 天有效降價並計算降幅", () => {
  expect(getRecentPriceDrop({
    lastPriceChange: { oldPrice: 1800, newPrice: 1620, date: "2026-08-20" },
  }, 14, now)).toEqual({ oldPrice: 1800, newPrice: 1620, amount: 180, percent: 10, date: "2026-08-20" });
});

test("排除漲價、同價與超過期限的異動", () => {
  expect(getRecentPriceDrop({ lastPriceChange: { oldPrice: 1600, newPrice: 1700, date: "2026-08-20" } }, 14, now)).toBeNull();
  expect(getRecentPriceDrop({ lastPriceChange: { oldPrice: 1600, newPrice: 1600, date: "2026-08-20" } }, 14, now)).toBeNull();
  expect(getRecentPriceDrop({ lastPriceChange: { oldPrice: 1800, newPrice: 1600, date: "2026-08-01" } }, 14, now)).toBeNull();
});
