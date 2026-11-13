/** @jest-environment jsdom */
import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";
import CompanyRentals from "./CompanyRentals";
import { readRentalInternal, saveCompanyRental, setCompanyRentalStatus } from "../lib/companyRentalRepository";
import { loadRentalListingInfo } from "../lib/rentalWebsiteClient";
import { rentalToday } from "../lib/companyRentalWebsite";
const mockRows = [
  { id: "a", title: "金捷市兩房", community: "金捷市", street: "樂善二路", area: "A7", status: "available", ownerUid: "staff", rent: 28000, photos: [], revision: 1 },
  { id: "b", title: "林口三房", area: "A9", status: "rented", ownerUid: "other", rent: 35000, photos: [] },
  { id: "c", title: "其他同事套房", area: "A7", status: "available", ownerUid: "other", rent: 15000, photos: [] },
];
let mockStoredRows = mockRows;
jest.mock("../AuthContext", () => ({ useAuth: () => ({ user: { uid: "staff" } }) }));
jest.mock("../hooks/useCollection", () => ({ useCollection: () => ({ items: [{ id: "staff", name: "小林" }, { id: "staff-b", name: "同事乙", phone: "02-12345678" }, { id: "mTfncojmWcgx3XN3JYceTJFJtw03", name: "我會寫扣" }, { id: "Qv7tWXKV07M5UL0UA6Ug8eWeJOF3", name: "po25862z" }], loading: false }) }));
jest.mock("../hooks/useDoc", () => ({ useDoc: () => ({ data: { name: "小林" } }) }));
jest.mock("../hooks/usePersonalAgid", () => ({ usePersonalAgid: () => ({ agid: "67890" }) }));
jest.mock("../hooks/useCompanyRentals", () => ({ useCompanyRentals: () => ({ items: mockStoredRows, loading: false, error: null, refresh: jest.fn() }) }));
jest.mock("../hooks/useRentalWebsiteChecks", () => ({ useRentalWebsiteChecks: () => ({}) }));
jest.mock("../lib/rentalWebsiteClient", () => ({ loadRentalWebsiteInfo: jest.fn(), loadRentalListingInfo: jest.fn(), needsRentalWebsiteCheck: jest.fn(() => false) }));
jest.mock("../lib/companyRentalRepository", () => ({ readRentalInternal: jest.fn(), saveCompanyRental: jest.fn(), setCompanyRentalStatus: jest.fn() }));
jest.mock("../hooks/useSharedCollection", () => ({ useSharedCollection: () => ({ items: [], loading: false }) }));
let container, root;
beforeEach(() => { mockStoredRows = mockRows; setCompanyRentalStatus.mockReset(); loadRentalListingInfo.mockReset(); mockRows.forEach(row => { row.furniture = []; for (const key of ["equipmentCatalog", "agentUid", "agentName", "websiteUrl", "websiteExpiresOn", "mandateExpiresOn", "websiteCheckStatus", "websiteCheckedUrl", "websiteUnavailable"]) delete row[key]; }); global.IS_REACT_ACT_ENVIRONMENT = true; container = document.createElement("div"); document.body.appendChild(container); root = createRoot(container); readRentalInternal.mockReset().mockResolvedValue({ doorAddress: "內部門牌" }); saveCompanyRental.mockReset().mockResolvedValue({ rental: { id: "new", status: "draft" }, cleanupFailures: [] }); });
afterEach(() => { act(() => root.unmount()); container.remove(); });
const render = () => act(() => root.render(<MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}><CompanyRentals /></MemoryRouter>));
const button = label => [...container.querySelectorAll("button")].find(node => node.textContent === label);
const click = async label => act(async () => button(label).click());
function input(element, value) { const setter = Object.getOwnPropertyDescriptor(element.tagName === "TEXTAREA" ? window.HTMLTextAreaElement.prototype : window.HTMLInputElement.prototype, "value").set; act(() => { setter.call(element, value); element.dispatchEvent(new Event("input", { bubbles: true })); }); }
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
  expect(saveCompanyRental).not.toHaveBeenCalled(); expect(container.querySelector("[role=alert]").textContent).toContain("還需要補上");
  await click("存成草稿"); expect(saveCompanyRental).toHaveBeenCalledWith(expect.objectContaining({ status: "draft", photos: [] }));
});

const fieldLabel = text => [...container.querySelectorAll("label")].find(node => node.querySelector("span")?.textContent === text);
function select(element, value) { act(() => { element.value = value; element.dispatchEvent(new Event("change", { bubbles: true })); }); }
test("new rental defaults to staff picker and saves another responsible colleague", async () => {
  render(); await click("＋ 新增租賃");
  const picker = container.querySelector('input[role="combobox"]');
  expect(picker.value).toBe("小林（我）");
  await act(async () => container.querySelector('.search-select-toggle').click());
  expect(container.querySelector('.search-select-options').textContent).not.toMatch(/我會寫扣|po25862z/);
  await act(async () => container.querySelector('[role="option"][aria-label="同事乙"]').click()); await click("存成草稿");
  expect(saveCompanyRental.mock.calls[0][0].form).toEqual(expect.objectContaining({ agentUid: "staff-b", agentName: "同事乙", agentPhone: "02-12345678" }));
});

test("an existing hidden assignee is preserved on save but cannot be chosen for a new assignment", async () => {
  mockRows[0].agentUid = "mTfncojmWcgx3XN3JYceTJFJtw03"; mockRows[0].agentName = "我會寫扣";
  render(); await click("查看資料"); await click("編輯資料");
  const picker = container.querySelector('input[role="combobox"]');
  expect(picker.value).toBe("我會寫扣");
  await act(async () => container.querySelector('.search-select-toggle').click());
  expect(container.querySelector('.search-select-options').textContent).not.toContain("我會寫扣");
  await click("存成草稿");
  expect(saveCompanyRental.mock.calls[0][0].form.agentUid).toBe(mockRows[0].agentUid);
});

test("the A7 community dropdown selection is included in the saved rental", async () => {
  render(); await click("＋ 新增租賃");
  await act(async () => container.querySelector(".cr-community-toggle").click());
  const option = [...container.querySelectorAll("[role=option]")].find(node => node.textContent === "富宇富御");
  await act(async () => option.click()); await click("存成草稿");
  expect(saveCompanyRental.mock.calls[0][0].form.community).toBe("富宇富御");
});

test("a motorcycle-only rental can select no car space and save its separate monthly fee", async () => {
  render(); await click("＋ 新增租賃"); await rentalConditions();
  input(fieldLabel("月租金（元）＊").querySelector("input"), "28000");
  select(fieldLabel("管理費").querySelector("select"), "已含租金");
  select(fieldLabel("汽車位類型").querySelector("select"), "無車位");
  expect(fieldLabel("汽車位費用")).toBeUndefined();
  select(fieldLabel("機車位狀況").querySelector("select"), "有機車位");
  select(fieldLabel("機車位費用").querySelector("select"), "另計");
  input(fieldLabel("機車位租金（元／月）").querySelector("input"), "300");
  expect(container.querySelector(".cr-editor .cr-cost strong").textContent).toContain("28,300");
  await click("存成草稿");
  expect(saveCompanyRental.mock.calls[0][0].form).toEqual(expect.objectContaining({ parking: "無車位", motorbikeParking: "有機車位", motorbikeParkMode: "另計", motorbikeParkFee: "300" }));
});
test("a rental can include both car and motorcycle spaces with independent fee settings", async () => {
  render(); await click("＋ 新增租賃"); await rentalConditions();
  select(fieldLabel("汽車位類型").querySelector("select"), "坡道平面");
  select(fieldLabel("汽車位費用").querySelector("select"), "另計");
  input(fieldLabel("汽車位租金（元／月）").querySelector("input"), "3000");
  select(fieldLabel("機車位狀況").querySelector("select"), "社區先到先停");
  select(fieldLabel("機車位費用").querySelector("select"), "已含租金");
  expect(fieldLabel("機車位租金（元／月）")).toBeUndefined();
  await click("存成草稿");
  expect(saveCompanyRental.mock.calls[0][0].form).toEqual(expect.objectContaining({ parking: "坡道平面", parkFee: "3000", motorbikeParking: "社區先到先停", motorbikeParkMode: "已含租金" }));
});

test("expired website stays stored but is replaced with no-website text in details and customer sharing", async () => {
  Object.assign(mockRows[0], { websiteUrl: "https://rent.591.com.tw/22258856", websiteExpiresOn: "2000-01-01", mandateExpiresOn: "2000-01-02", shareWebsite: true });
  render(); expect(container.textContent).toContain("目前無網站"); expect(container.textContent).toContain("有到期提醒");
  expect(container.querySelector(".cr-row-actions a")).toBeNull();
  await click("只看到期提醒"); expect(container.querySelectorAll("article")).toHaveLength(1); expect(container.querySelector("h1").textContent).toContain("1");
  await click("查看資料"); expect([...container.querySelectorAll("a")].some(node => node.textContent.includes("開啟物件網址"))).toBe(false);
  expect(container.textContent).toContain("https://rent.591.com.tw/22258856");
  await click("分享給客人"); const share = container.querySelector("textarea[aria-label='分享文字']").value;
  expect(share).toContain("目前無網站"); expect(share).not.toContain("rent.591.com.tw"); expect(share).not.toContain("2000-01-02");
});
test("rental editor saves independent mandate and website dates and resets old URL expiry after a URL change", async () => {
  render(); await click("＋ 新增租賃");
  await act(async () => [...container.querySelectorAll(".workflow-steps button")].find(node => node.getAttribute("aria-label") === "3. 網址、照片與內部資料").click());
  input(fieldLabel("物件網址").querySelector("input"), "https://rent.591.com.tw/22258856");
  input(fieldLabel("網站刊登到期日").querySelector("input"), "2026-11-29");
  input(fieldLabel("委託到期日").querySelector("input"), "2027-01-31");
  input(fieldLabel("物件網址").querySelector("input"), "https://rent.591.com.tw/12345678");
  expect(fieldLabel("網站刊登到期日").querySelector("input").value).toBe("");
  expect(fieldLabel("委託到期日").querySelector("input").value).toBe("2027-01-31");
  input(fieldLabel("網站刊登到期日").querySelector("input"), "2026-12-15");
  await click("存成草稿");
  expect(saveCompanyRental.mock.calls[0][0].form).toEqual(expect.objectContaining({ mandateExpiresOn: "2027-01-31", websiteExpiresOn: "2026-12-15", websiteExpirySource: "manual", websiteCheckStatus: "unchecked" }));
});
test("today's mandate date reminds staff without hiding the website before its own expiry date", async () => {
  Object.assign(mockRows[0], { websiteUrl: "https://example.test/rental", websiteExpiresOn: "2099-01-01", mandateExpiresOn: rentalToday() });
  render(); expect(container.textContent).toContain("委託今天到期");
  const website = container.querySelector(".cr-row-actions a");
  expect(website.getAttribute("href")).toBe("https://example.test/rental");
  expect(website.target).toBe("_blank"); expect(website.rel).toContain("noopener");
  expect(container.querySelector(".cr-detail")).toBeNull();
  await click("查看資料"); expect(container.querySelector("a[href='https://example.test/rental']")).not.toBeNull();
});
test("manual responsible agent and two separate service fees are retained on draft save", async () => {
  render(); await click("＋ 新增租賃");
  await act(async () => container.querySelector(".search-select-toggle").click());
  await act(async () => container.querySelector('[role="option"][aria-label="自行輸入業務"]').click());
  input(fieldLabel("業務姓名＊").querySelector("input"), "自填業務");
  await act(async () => [...container.querySelectorAll(".workflow-steps button")].find(node => node.getAttribute("aria-label") === "2. 租金與條件").click());
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

async function rentalConditions() { await act(async () => [...container.querySelectorAll(".workflow-steps button")].find(node => node.getAttribute("aria-label") === "2. 租金與條件").click()); }
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
  expect(saveCompanyRental.mock.calls[0][0].form.equipmentCatalog).toContain("洗碗機");
});

test("a new rental offers equipment remembered by another colleague's rented case without selecting it", async () => {
  mockRows[1].equipmentCatalog = ["洗碗機"]; mockRows[1].furniture = ["電視"];
  render();
  input(container.querySelector("input[placeholder^='搜尋案名']"), "找不到的案件");
  await click("＋ 新增租賃"); await rentalConditions();
  expect(equipmentCheckbox("洗碗機").checked).toBe(false); expect(equipmentCheckbox("電視").checked).toBe(false);
  act(() => equipmentCheckbox("洗碗機").click());
  await click("存成草稿");
  expect(saveCompanyRental.mock.calls[0][0].form.furniture).toEqual(["洗碗機"]);
});
test("new equipment remains remembered when unchecked before saving without including it in this case", async () => {
  render(); await click("＋ 新增租賃"); await rentalConditions();
  input(fieldLabel("新增設備名稱").querySelector("input"), "除濕機"); await click("＋ 新增設備");
  act(() => equipmentCheckbox("除濕機").click()); await click("存成草稿");
  const savedForm = saveCompanyRental.mock.calls[0][0].form;
  expect(savedForm.furniture).toEqual([]); expect(savedForm.equipmentCatalog).toEqual(["除濕機"]);
});


test("the list offers status editing only for an authorized rental without opening its details", () => {
  render();
  const rows = container.querySelectorAll("article");
  expect(rows[0].querySelector("select[aria-label='金捷市兩房的招租狀態']").value).toBe("available");
  expect(rows[1].querySelector(".cr-row-status select")).toBeNull();
  expect(rows[1].querySelector(".cr-readonly-status").textContent).toBe("招租中");
  expect(container.querySelector(".cr-detail")).toBeNull();
  expect(readRentalInternal).not.toHaveBeenCalled();
});

test.each([["paused", "暫時不租"], ["rented", "已出租"]])("changing a listing to %s saves once, prevents repeat changes, and moves it to its status tab", async (nextStatus, label) => {
  let finish;
  setCompanyRentalStatus.mockImplementation(() => new Promise(resolve => { finish = resolve; }));
  render();
  const picker = container.querySelector("select[aria-label='金捷市兩房的招租狀態']");
  select(picker, nextStatus);
  expect(picker.disabled).toBe(true);
  expect(container.textContent).toContain("狀態儲存中");
  expect(setCompanyRentalStatus).toHaveBeenCalledTimes(1);
  expect(setCompanyRentalStatus).toHaveBeenCalledWith(mockRows[0], nextStatus, { uid: "staff" });
  await act(async () => {
    const saved = { ...mockRows[0], status: nextStatus, revision: 2 };
    mockStoredRows = mockRows.map(row => row.id === saved.id ? saved : row);
    finish(saved);
  });
  expect(container.querySelectorAll("article")).toHaveLength(1);
  expect(container.querySelector("[role=status]").textContent).toContain(`已改為「${label}」`);
  const tab = [...container.querySelectorAll(".cr-tabs button")].find(node => node.textContent.startsWith(label));
  await act(async () => tab.click());
  expect(container.querySelector("select[aria-label='金捷市兩房的招租狀態']").value).toBe(nextStatus);
  expect(readRentalInternal).not.toHaveBeenCalled();
});

test("a failed list status save keeps the rental in its original tab and restores the control", async () => {
  setCompanyRentalStatus.mockRejectedValue(Object.assign(new Error("denied"), { code: "permission-denied" }));
  render();
  const picker = container.querySelector("select[aria-label='金捷市兩房的招租狀態']");
  await act(async () => select(picker, "rented"));
  expect(picker.value).toBe("available"); expect(picker.disabled).toBe(false);
  expect(container.querySelectorAll("article")).toHaveLength(2);
  expect(container.querySelector("[role=alert]").textContent).toContain("狀態尚未更新");
  expect(container.querySelector("[role=alert]").textContent).toContain("目前帳號無法修改");
  expect(container.querySelector(".cr-success")).toBeNull();
});


const imported591 = {url:"https://rent.591.com.tw/22268405",status:"live",expiresOn:"2026-12-01",checkedAt:"2026-11-04T13:00:00Z",listing:{title:"591案名",community:"頤昌筑岳",rent:29000,parking:"平面車位",sizeBasis:"591 刊登使用坪數",furniture:["冷氣"]}};
test("591 import fills the form after review, preserves a custom title, and saves with the current colleague", async () => {
  loadRentalListingInfo.mockResolvedValue(imported591);render();await click("＋ 新增租賃");
  input(fieldLabel("案名＊").querySelector("input"),"自己的案名");
  input(fieldLabel("591 租屋網址").querySelector("input"),imported591.url);await click("讀取 591 資料");
  expect(saveCompanyRental).not.toHaveBeenCalled();
  const titleOption=[...container.querySelectorAll(".cr-import-fields label")].find(node=>node.querySelector("b").textContent==="案名");
  expect(titleOption.querySelector("input").checked).toBe(false);
  await act(async()=>[...container.querySelectorAll("button")].find(node=>node.textContent.startsWith("帶入表單（")).click());
  expect(fieldLabel("案名＊").querySelector("input").value).toBe("自己的案名");
  expect(fieldLabel("坪數說明").querySelector("select").value).toBe("591 刊登使用坪數");
  await click("存成草稿");
  expect(saveCompanyRental.mock.calls[0][0].form).toEqual(expect.objectContaining({title:"自己的案名",community:"頤昌筑岳",rent:29000,parking:"平面車位",agentUid:"staff",websiteUrl:imported591.url,websiteExpiresOn:"2026-12-01",furniture:["冷氣"]}));
});
test("a 591 read failure leaves the existing form untouched and does not save", async () => {
  loadRentalListingInfo.mockResolvedValue({...imported591,status:"unknown",listing:undefined});render();await click("＋ 新增租賃");
  input(fieldLabel("案名＊").querySelector("input"),"保留案名");input(fieldLabel("591 租屋網址").querySelector("input"),imported591.url);await click("讀取 591 資料");
  expect(container.querySelector("[role=alert]").textContent).toContain("表單內容未更動");
  expect(fieldLabel("案名＊").querySelector("input").value).toBe("保留案名");expect(saveCompanyRental).not.toHaveBeenCalled();
});
test("a delayed 591 response cannot appear after the URL has been changed", async () => {
  let finish;loadRentalListingInfo.mockImplementation(()=>new Promise(resolve=>{finish=resolve}));render();await click("＋ 新增租賃");
  const urlInput=fieldLabel("591 租屋網址").querySelector("input");input(urlInput,imported591.url);await click("讀取 591 資料");
  input(urlInput,"https://rent.591.com.tw/12345678");await act(async()=>finish(imported591));
  expect(container.querySelector(".cr-import-preview")).toBeNull();expect(saveCompanyRental).not.toHaveBeenCalled();
});


test("after a 591 import only missing private details are requested, and shortcuts open the correct step", async () => {
  loadRentalListingInfo.mockResolvedValue({...imported591,listing:{...imported591.listing,city:"桃園市",district:"龜山區",street:"牛角坡路",floor:"6/15"}});
  render();await click("＋ 新增租賃");
  input(fieldLabel("591 租屋網址").querySelector("input"),imported591.url);await click("讀取 591 資料");
  await act(async()=>[...container.querySelectorAll("button")].find(node=>node.textContent.startsWith("帶入表單（")).click());
  await click("儲存並招租");
  const alert=container.querySelector("[role=alert]");
  expect(alert.querySelector("p").textContent).toBe("還需要補上：完整門牌（內部）、帶看方式。");
  expect(alert.textContent).not.toContain("縣市");expect(alert.textContent).not.toContain("案名");
  expect(document.activeElement.getAttribute("data-rental-field")).toBe("doorAddress");
  expect(fieldLabel("案名＊").querySelector("input").value).toBe("591案名");
  input(fieldLabel("完整門牌＊（內部）").querySelector("input"),"測試完整門牌");
  expect(container.querySelector("[role=alert]").querySelector("p").textContent).toBe("還需要補上：帶看方式。");
  await click("補帶看方式");
  expect([...container.querySelectorAll(".workflow-steps button")].find(node=>node.getAttribute("aria-current")==="step").getAttribute("aria-label")).toContain("3.");
  expect(document.activeElement.getAttribute("data-rental-field")).toBe("viewingInstructions");
  input(fieldLabel("帶看方式＊").querySelector("textarea"),"請先聯繫負責同事");
  expect(container.querySelector("[role=alert]")).toBeNull();
  await click("儲存並招租");
  expect(saveCompanyRental.mock.calls[0][0].form).toEqual(expect.objectContaining({title:"591案名",street:"牛角坡路",floor:"6/15",rent:29000,doorAddress:"測試完整門牌",viewingInstructions:"請先聯繫負責同事"}));
});

test("commercial 591 URLs can be read, reviewed and applied without creating a residential listing", async () => {
  const shop={...imported591,url:"https://business.591.com.tw/rent/22209235",expiresOn:"",listing:{title:"大湖匯漂亮店面",type:"店面",rent:42000,size:30,street:"文三一街",doorAddress:"桃園市龜山區文三一街53號",floor:"1/13",deposit:2,description:"規格：面寬5.6米·層高6.8米·進深11米"}};
  loadRentalListingInfo.mockResolvedValue(shop);render();await click("＋ 新增租賃");
  input(fieldLabel("591 租屋網址").querySelector("input"),shop.url);await click("讀取 591 資料");
  expect(loadRentalListingInfo).toHaveBeenCalledWith(expect.objectContaining({uid:"staff"}),shop.url);
  expect(container.textContent).toContain("大湖匯漂亮店面");expect(saveCompanyRental).not.toHaveBeenCalled();
  const apply=[...container.querySelectorAll("button")].find(node=>node.textContent.startsWith("帶入表單"));await act(async()=>apply.click());
  expect(fieldLabel("租賃類型").querySelector("select").value).toBe("店面");expect(fieldLabel("樓層").querySelector("input").value).toBe("1/13");
  expect(container.querySelector('[data-rental-field="doorAddress"]').value).toBe("桃園市龜山區文三一街53號");
  await click("存成草稿");expect(saveCompanyRental.mock.calls[0][0].form).toEqual(expect.objectContaining({type:"店面",rent:42000,size:30,websiteUrl:shop.url,websiteExpiresOn:"",description:"規格：面寬5.6米·層高6.8米·進深11米"}));
});
