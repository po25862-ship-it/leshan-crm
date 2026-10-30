/** @jest-environment jsdom */
import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";
import CompanyRentals from "./CompanyRentals";
import { readRentalInternal, saveCompanyRental } from "../lib/companyRentalRepository";
const mockRows = [
  { id: "a", title: "金捷市兩房", community: "金捷市", street: "樂善二路", area: "A7", status: "available", ownerUid: "staff", rent: 28000, photos: [], revision: 1 },
  { id: "b", title: "林口三房", area: "A9", status: "rented", ownerUid: "other", rent: 35000, photos: [] },
  { id: "c", title: "其他同事套房", area: "A7", status: "available", ownerUid: "other", rent: 15000, photos: [] },
];
jest.mock("../AuthContext", () => ({ useAuth: () => ({ user: { uid: "staff" } }) }));
jest.mock("../hooks/useDoc", () => ({ useDoc: () => ({ data: { name: "小林" } }) }));
jest.mock("../hooks/usePersonalAgid", () => ({ usePersonalAgid: () => ({ agid: "67890" }) }));
jest.mock("../hooks/useCompanyRentals", () => ({ useCompanyRentals: () => ({ items: mockRows, loading: false, error: null, refresh: jest.fn() }) }));
jest.mock("../lib/companyRentalRepository", () => ({ readRentalInternal: jest.fn(), saveCompanyRental: jest.fn(), setCompanyRentalStatus: jest.fn() }));
jest.mock("../hooks/useSharedCollection", () => ({ useSharedCollection: () => ({ items: [], loading: false }) }));
let container, root;
beforeEach(() => { global.IS_REACT_ACT_ENVIRONMENT = true; container = document.createElement("div"); document.body.appendChild(container); root = createRoot(container); readRentalInternal.mockReset().mockResolvedValue({ doorAddress: "內部門牌" }); saveCompanyRental.mockReset().mockResolvedValue({ rental: { id: "new", status: "draft" }, cleanupFailures: [] }); });
afterEach(() => { act(() => root.unmount()); container.remove(); });
const render = () => act(() => root.render(<MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}><CompanyRentals /></MemoryRouter>));
const button = label => [...container.querySelectorAll("button")].find(node => node.textContent === label);
const click = async label => act(async () => button(label).click());
function input(element, value) { const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").set; act(() => { setter.call(element, value); element.dispatchEvent(new Event("input", { bubbles: true })); }); }
test("status and search counts reflect filtered rows; changing a search closes stale details", async () => {
  render(); expect(container.querySelectorAll("article")).toHaveLength(2);
  await click("查看資料"); expect(container.textContent).toContain("完整門牌／樓層");
  input(container.querySelector("input[placeholder^='搜尋案名']"), "其他同事");
  expect(container.querySelectorAll("article")).toHaveLength(1); expect(container.querySelector(".cr-detail")).toBeNull();
  expect(container.querySelector("h1").textContent).toContain("1");
});
test("another colleague's listing can be browsed but cannot be edited", async () => {
  render(); await act(async () => container.querySelectorAll("article button")[1].click());
  expect(container.querySelector(".cr-detail")).not.toBeNull(); expect(button("編輯資料")).toBeUndefined();
});
test("failed private read disables editing rather than replacing it with empty private fields", async () => {
  readRentalInternal.mockRejectedValue(new Error("network")); render(); await click("查看資料");
  expect(container.textContent).toContain("內部資料讀取失敗"); expect(button("編輯資料").disabled).toBe(true);
});
test("empty new listing can be saved as draft, while publishing requires complete details", async () => {
  render(); await click("＋ 新增租賃"); await click("儲存並招租");
  expect(saveCompanyRental).not.toHaveBeenCalled(); expect(container.querySelector("[role=alert]").textContent).toContain("請填寫");
  await click("存成草稿"); expect(saveCompanyRental).toHaveBeenCalledWith(expect.objectContaining({ status: "draft", photos: [] }));
});
