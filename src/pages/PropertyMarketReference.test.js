import React, { act } from "react";
import { createRoot } from "react-dom/client";
import PropertyMarketReference from "./PropertyMarketReference";

global.IS_REACT_ACT_ENVIRONMENT = true;
let host, root;
const property = { title: "測試三房", category: "電梯大樓", titlePing: 50, totalPrice: 1500, parkingPing: 10, parkingCount: 1, layout: "3/2/2", managementFee: "2000元/月" };
const row = { id: "three", date: "2026-03-31", type: "住宅大樓(11層含以上有電梯)", use: "住家用", floor: "三層", rooms: 3, halls: 2, baths: 2, area: 50, price: 16000000, unit: 35, parkingType: "坡道平面", parkingPrice: 2000000, parkingArea: 10, special: false };
const reference = { community: { id: "c", name: "測試社區", zone: "A7", amenities: { list: ["閱覽室"], note: "需預約", updatedAt: 1790000000000 }, fees: {}, url: "https://leshan-market.firebaseapp.com/#/community/c" }, matchMethod: "exact-doorplate", deals: [row, { ...row, id: "two", rooms: 2 }], years: [2026, 2025], publishedDate: "2026-10-21", fetchedAt: Date.now() };
beforeEach(() => { host = document.createElement("div"); document.body.appendChild(host); root = createRoot(host); });
afterEach(() => { act(() => root.unmount()); host.remove(); });
function render(props = {}) { act(() => root.render(<PropertyMarketReference property={property} reference={reference} needs={[]} onRefresh={() => {}} onEdit={() => {}} {...props} />)); }
test("real source facilities and newest comparables render with their date and price basis", () => {
  render({ property: { ...property, parkingPrice: 200 } });
  expect(host.textContent).toContain("閱覽室");
  expect(host.textContent).toContain("需預約");
  expect(host.textContent).toContain("2026-10-21");
  expect(host.querySelectorAll(".property-market-trade")).toHaveLength(2);
  expect(host.textContent).toContain("不限房數");
  expect(host.textContent).toContain("坪數範圍 ±30%");
  expect(host.textContent).toContain("35.00～65.00 坪");
  expect(host.textContent).not.toContain("±20%");
  expect(host.textContent).toContain("本次判斷採用 2 筆成交");
  expect(host.textContent).toContain("沒有車位的成交也可納入");
  expect(host.querySelector('input[type="checkbox"]')).toBeNull();
  expect(host.querySelector("a")).toBeNull();
});
test("missing parking is actionable and does not produce an opportunity label", () => {
  const onEdit = jest.fn();
  render({ onEdit });
  expect(host.querySelector(".property-priority-badge").textContent).toBe("先把資料補齊");
  const button = [...host.querySelectorAll("button")].find((b) => b.textContent === "去補資料");
  act(() => button.click());
  expect(onEdit).toHaveBeenCalledWith("property-parking-price");
  expect(host.querySelector('[aria-label="優先推案參考總價"]')).toBeNull();
});

test("a price-qualified property with a customer opens viewing confirmation without changing the record", () => {
  const onEdit = jest.fn();
  const subject = Object.freeze({ ...property, parkingPrice: 200, viewingStatus: "unknown" });
  render({ property: subject, needs: [{ id: "n", budgetMax: 1600 }], onEdit });
  expect(host.querySelector(".property-priority-badge").textContent).toBe("待確認可帶看");
  expect(host.textContent).toContain("價格已符合，符合 1 組現有客需");
  const button = [...host.querySelectorAll("button")].find((b) => b.textContent === "更新帶看狀態");
  act(() => button.click());
  expect(onEdit).toHaveBeenCalledWith("property-viewing-status");
  expect(subject.viewingStatus).toBe("unknown");
  expect(host.querySelector('[aria-label="優先推案參考總價"]').textContent).toContain("已符合價格條件");
});
test("offline errors do not leave old trades or positive opportunity labels visible", () => {
  render({ error: "來源離線，請更新參考。" });
  expect(host.querySelector('[role="alert"]').textContent).toContain("來源離線");
  expect(host.querySelectorAll(".property-market-trade")).toHaveLength(0);
  expect(host.querySelector(".property-priority-badge").textContent).toBe("先把資料補齊");
  expect(host.querySelector('[aria-label="優先推案參考總價"]')).toBeNull();
});

test("the requested parking preset is identified without replacing missing official car prices", () => {
  render({ property: { ...property, parkingDescription: "機械" }, reference: { ...reference, deals: [{ ...row, parkingPrice: 0 }] } });
  expect(host.textContent).toContain("33.75 萬／坪（預設試算）");
  expect(host.textContent).toContain("機械每個 150 萬預設試算");
  expect(host.querySelector(".property-market-trade").textContent).toContain("車價未分列");
});

test("each comparable shows official and car-exclusive prices with a clear calculation basis", () => {
  render({ reference: { ...reference, deals: [row, { ...row, id: "estimated", parkingType: "坡道機械", parkingPrice: 0 }, { ...row, id: "missing-area", parkingArea: null, parkingPrice: 0 }] } });
  const trades = host.querySelectorAll(".property-market-trade");
  expect(host.querySelector(".property-market-table-heading").textContent).toContain("扣車單價");
  expect(trades[0].querySelector(".property-market-net-unit").textContent).toContain("35.00");
  expect(trades[0].querySelector(".property-market-net-unit").textContent).toContain("官方拆分計算");
  expect(trades[1].querySelector(".property-market-net-unit").textContent).toContain("36.25");
  expect(trades[1].textContent).toContain("預設車價 150 萬");
  expect(trades[1].textContent).toContain("車價未分列");
  expect(trades[2].querySelector(".property-market-net-unit").textContent).toContain("需補車位坪數");
  expect(trades[1].children[3].textContent).toContain("35");
  expect(host.querySelector("a")).toBeNull();
});

test("cloud reference identifies the sync time separately from the current read time", () => {
  render({ reference: { ...reference, sourceMode: "cloud-snapshot", snapshotAt: 1793315106854 } });
  expect(host.textContent).toContain("雲端資料・最後同步");
  expect(host.textContent).toContain("無須開啟本機程式");
  expect(host.textContent).toContain("雲端最後同步");
  expect(host.querySelector("a")).toBeNull();
});

test("one recent sale supplies comparison details while older rows are excluded from the displayed list", () => {
  render({ property: { ...property, parkingPrice: 200 }, reference: { ...reference, deals: [row, { ...row, id: "old", date: "2024-01-01" }] } });
  expect(host.querySelectorAll(".property-market-trade")).toHaveLength(1);
  expect(host.textContent).not.toContain("2024-01-01");
  expect(host.textContent).toContain("近一年只有 1 筆可用成交");
  expect(host.textContent).toContain("至少 1 筆就能比較");
  expect(host.textContent).toContain("採用成交日期：2026-03-31");
  expect(host.textContent).not.toContain("需要至少 3 筆");
});

test("the target total shows the adjustment and keeps the remaining priority requirements explicit", () => {
  render({ property: { ...property, totalPrice: 1700, parkingPrice: 200 } });
  const target = host.querySelector('[aria-label="優先推案參考總價"]');
  expect(target.textContent).toContain("1,600 萬以下");
  expect(target.textContent).toContain("約需調整 100 萬");
  expect(target.textContent).toContain("仍需有合適客需");
  expect(target.textContent).toContain("近 30 天已確認可帶看");
  expect(target.textContent).toContain("扣車面積 40 坪");
  expect(target.textContent).toContain("車位 200 萬");
  expect(host.querySelector(".property-priority-badge").textContent).toBe("議價追蹤");
  render({ property: { ...property, totalPrice: 1500, parkingPrice: 200 } });
  expect(host.querySelector('[aria-label="優先推案參考總價"]').textContent).toContain("已符合價格條件");
});

test("unseparated parking sales take part in the judgment and identify the target as estimated", () => {
  render({ property: { ...property, totalPrice: 1700, parkingPrice: 200 }, reference: { ...reference, deals: [{ ...row, parkingPrice: 0 }] } });
  const target = host.querySelector('[aria-label="優先推案參考總價"]');
  expect(target.textContent).toContain("萬以下（試算）");
  expect(target.textContent).toContain("成交參考含 1 筆車位預設試算");
  expect(host.textContent).toContain("其中 1 筆成交的車位價格採預設試算");
  expect(host.querySelector(".property-priority-badge").textContent).toBe("議價追蹤");
});
