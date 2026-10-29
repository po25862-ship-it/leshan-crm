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
  render();
  expect(host.textContent).toContain("閱覽室");
  expect(host.textContent).toContain("需預約");
  expect(host.textContent).toContain("2026-10-21");
  expect(host.querySelectorAll(".property-market-trade")).toHaveLength(2);
  expect(host.textContent).toContain("不限房數");
  expect(host.querySelector('input[type="checkbox"]')).toBeNull();
});
test("missing parking is actionable and does not produce an opportunity label", () => {
  const onEdit = jest.fn();
  render({ onEdit });
  expect(host.querySelector(".property-priority-badge").textContent).toBe("先把資料補齊");
  const button = [...host.querySelectorAll("button")].find((b) => b.textContent === "去補資料");
  act(() => button.click());
  expect(onEdit).toHaveBeenCalledWith("property-parking-price");
});
test("offline errors do not leave old trades or positive opportunity labels visible", () => {
  render({ error: "來源離線，請更新參考。" });
  expect(host.querySelector('[role="alert"]').textContent).toContain("來源離線");
  expect(host.querySelectorAll(".property-market-trade")).toHaveLength(0);
  expect(host.querySelector(".property-priority-badge").textContent).toBe("先把資料補齊");
});
