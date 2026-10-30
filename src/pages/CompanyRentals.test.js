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
jest.mock("../hooks/useCollection", () => ({ useCollection: () => ({ items: [{ id: "staff", name: "小林" }, { id: "staff-b", name: "同事乙", phone: "02-12345678" }], loading: false }) }));
jest.mock("../hooks/useDoc", () => ({ useDoc: () => ({ data: { name: "小林" } }) }));
jest.mock("../hooks/usePersonalAgid", () => ({ usePersonalAgid: () => ({ agid: "67890" }) }));
jest.mock("../hooks/useCompanyRentals", () => ({ useCompanyRentals: () => ({ items: mockRows, loading: false, error: null, refresh: jest.fn() }) }));
jest.mock("../lib/companyRentalRepository", () => ({ readRentalInternal: jest.fn(), saveCompanyRental: jest.fn(), setCompanyRentalStatus: jest.fn() }));
jest.mock("../hooks/useSharedCollection", () => ({ useSharedCollection: () => ({ items: [], loading: false }) }));
let container, root;
beforeEach(() => { mockRows[0].furniture = []; global.IS_REACT_ACT_ENVIRONMENT = true; container = document.createElement("div"); document.body.appendChild(container); root = createRoot(container); readRentalInternal.mockReset().mockResolvedValue({ doorAddress: "內部門牌" }); saveCompanyRental.mockReset().mockResolvedValue({ rental: { id: "new", status: "draft" }, cleanupFailures: [] }); });
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

const fieldLabel = text => [...container.querySelectorAll("label")].find(node => node.querySelector("span")?.textContent === text);
function select(element, value) { act(() => { element.value = value; element.dispatchEvent(new Event("change", { bubbles: true })); }); }
test("new rental defaults to staff picker and saves another responsible colleague", async () => {
  render(); await click("＋ 新增租賃");
  const picker = fieldLabel("案件負責人＊").querySelector("select");
  expect(picker.value).toBe("staff"); expect(picker.textContent).toContain("同事乙");
  select(picker, "staff-b"); await click("存成草稿");
  expect(saveCompanyRental.mock.calls[0][0].form).toEqual(expect.objectContaining({ agentUid: "staff-b", agentName: "同事乙", agentPhone: "02-12345678" }));
});
test("manual responsible agent and two separate service fees are retained on draft save", async () => {
  render(); await click("＋ 新增租賃");
  select(fieldLabel("案件負責人＊").querySelector("select"), "__manual__");
  input(fieldLabel("業務姓名＊").querySelector("input"), "自填業務");
  await act(async () => [...container.querySelectorAll("[role=tab]")].find(node => node.textContent === "2. 租金與條件").click());
  input(fieldLabel("買方服務費（對客人顯示）").querySelector("input"), "半個月租金");
  input(fieldLabel("賣方服務費（僅同仁可見）").querySelector("input"), "屋主約定 20,000 元");
  await click("存成草稿");
  expect(saveCompanyRental.mock.calls[0][0].form).toEqual(expect.objectContaining({ agentUid: null, agentName: "自填業務", buyerServiceFee: "半個月租金", sellerServiceFee: "屋主約定 20,000 元" }));
});
test("customer share preview never includes seller fee from colleague-only detail", async () => {
  readRentalInternal.mockResolvedValue({ sellerServiceFee: "屋主私約費用", legacyServiceFee: "未拆分舊費用" });
  render(); await click("查看資料"); await click("分享給客人");
  expect(container.querySelector("textarea[aria-label='分享文字']").value).toContain("買方服務費");
  expect(container.querySelector("textarea[aria-label='分享文字']").value).not.toMatch(/屋主私約費用|未拆分舊費用|賣方服務費/);
});

async function rentalConditions() { await act(async () => [...container.querySelectorAll("[role=tab]")].find(node => node.textContent === "2. 租金與條件").click()); }
const equipmentCheckbox = name => [...container.querySelectorAll(".cr-checks label")].find(label => label.textContent === name)?.querySelector("input");
test("custom equipment is added checked, can be unchecked and selected again with Enter, and saved once", async () => {
  render(); await click("＋ 新增租賃"); await rentalConditions();
  input(fieldLabel("新增設備名稱").querySelector("input"), "烘衣機"); await click("＋ 新增設備");
  expect(equipmentCheckbox("烘衣機").checked).toBe(true);
  act(() => equipmentCheckbox("烘衣機").click()); expect(equipmentCheckbox("烘衣機").checked).toBe(false);
  input(fieldLabel("新增設備名稱").querySelector("input"), " 烘衣機 ");
  act(() => fieldLabel("新增設備名稱").querySelector("input").dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true })));
  expect(equipmentCheckbox("烘衣機").checked).toBe(true);
  expect([...container.querySelectorAll(".cr-checks label")].filter(label => label.textContent === "烘衣機")).toHaveLength(1);
  await click("存成草稿"); expect(saveCompanyRental.mock.calls[0][0].form.furniture).toEqual(["烘衣機"]);
});
test("saving also includes the typed equipment name when Add has not been clicked", async () => {
  render(); await click("＋ 新增租賃"); await rentalConditions();
  input(fieldLabel("新增設備名稱").querySelector("input"), "電視");
  await click("存成草稿"); expect(saveCompanyRental.mock.calls[0][0].form.furniture).toEqual(["電視"]);
});
test("existing custom equipment is checked on re-edit and can be removed from this rental", async () => {
  mockRows[0].furniture = ["冷氣", "洗碗機"];
  render(); await click("查看資料"); await click("編輯資料"); await rentalConditions();
  expect(equipmentCheckbox("洗碗機").checked).toBe(true);
  act(() => equipmentCheckbox("洗碗機").click());
  await click("存成草稿"); expect(saveCompanyRental.mock.calls[0][0].form.furniture).toEqual(["冷氣"]);
});
