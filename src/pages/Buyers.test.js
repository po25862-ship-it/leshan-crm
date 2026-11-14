import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";
import { Simulate } from "react-dom/test-utils";
import Buyers from "./Buyers";

let mockContacts;
const mockAdd = jest.fn(async data => { mockContacts = [...mockContacts, { ...data, id: "new-buyer" }]; return "new-buyer"; });
const mockUpdate = jest.fn(async (id, data) => { mockContacts = mockContacts.map(item => item.id === id ? { ...item, ...data } : item); });
jest.mock("../AuthContext", () => ({ useAuth: () => ({ user: { uid: "staff" } }) }));
jest.mock("../hooks/useSharedCollection", () => ({ useSharedCollection: () => ({ items: mockContacts, add: mockAdd, update: mockUpdate, remove: jest.fn() }) }));
jest.mock("../hooks/useCollection", () => ({ useCollection: () => ({ items: [] }) }));
jest.mock("../hooks/useNeedsCollection", () => ({ useNeedsCollection: () => ({ items: [] }) }));
jest.mock("./BuyerActivityLog", () => () => null);
jest.mock("./BuyerNeeds", () => () => null);
jest.mock("./ShareWithPicker", () => () => null);
jest.mock("./ContactConversationAnalyses", () => () => null);

let container, root;
beforeEach(() => {
  global.IS_REACT_ACT_ENVIRONMENT = true;
  Element.prototype.scrollIntoView = jest.fn();
  mockContacts = [
    { id: "one", name: "陳先生", source: "591 智富館", tags: ["買方"], ownerUid: "staff", createdAt: "2026-11-13" },
    { id: "two", name: "王小姐", source: "朋友介紹（舊來源）", tags: ["買方"], ownerUid: "staff", createdAt: "2026-11-12" },
    { id: "three", name: "林先生", source: "FB 社團", tags: ["買方"], ownerUid: "staff", createdAt: "2026-11-11" },
  ];
  mockAdd.mockReset().mockImplementation(async data => { mockContacts = [...mockContacts, { ...data, id: "new-buyer" }]; return "new-buyer"; });
  mockUpdate.mockReset().mockImplementation(async (id, data) => { mockContacts = mockContacts.map(item => item.id === id ? { ...item, ...data } : item); });
  container = document.createElement("div"); document.body.appendChild(container); root = createRoot(container);
});
afterEach(() => { act(() => root.unmount()); container.remove(); });
const render = () => act(() => root.render(<MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}><Buyers /></MemoryRouter>));
const click = async text => act(async () => [...container.querySelectorAll("button")].find(button => button.textContent.trim() === text).click());
const type = async (input, value) => act(async () => { Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set.call(input, value); input.dispatchEvent(new Event("input", { bubbles: true })); });
const source = () => container.querySelector('input[role="combobox"]');
const options = () => [...container.querySelectorAll('[role="option"]')].map(node => node.getAttribute("aria-label"));

test("remembered sources are all available and a keyword filters the original list", async () => {
  render(); await click("＋ 新增買方");
  await act(async () => container.querySelector('.search-select-toggle').click());
  expect(options()).toEqual(expect.arrayContaining(["591 智富館", "朋友介紹(舊來源)", "FB 社團"]));
  await type(source(), "591"); expect(options()).toEqual(["591 智富館"]);
  await act(async () => container.querySelector('[role="option"]').click());
  expect(source().value).toBe("591 智富館"); expect(mockAdd).not.toHaveBeenCalled();
});

test("a custom source is saved with the buyer and can be searched next time without losing old sources", async () => {
  render(); await click("＋ 新增買方");
  await type(container.querySelector('input[placeholder="例如：陳小姐"]'), "新客戶");
  await type(source(), "社區住戶推薦");
  expect(container.textContent).toContain("沒有相符選項，可直接使用你輸入的內容");
  await act(async () => Simulate.submit(container.querySelector('form')));
  expect(mockAdd).toHaveBeenCalledWith(expect.objectContaining({ source: "社區住戶推薦", name: "新客戶", ownerUid: "staff" }));
  expect(mockContacts.find(item => item.id === "two").source).toBe("朋友介紹（舊來源）");
  await click("＋ 新增買方");
  await act(async () => container.querySelector('.search-select-toggle').click());
  expect(options()).toEqual(expect.arrayContaining(["社區住戶推薦", "591 智富館", "朋友介紹(舊來源)", "FB 社團"]));
  await type(source(), "住戶"); expect(options()).toEqual(["社區住戶推薦"]);
});

test("editing keeps the existing source unless the user changes it, and cancelling a new source does not remember it", async () => {
  render(); await click("查看資料"); await click("編輯資料");
  expect(source().value).toBe("591 智富館");
  await act(async () => Simulate.submit(container.querySelector('form')));
  expect(mockUpdate).toHaveBeenCalledWith("one", expect.objectContaining({ source: "591 智富館" }));
  await click("＋ 新增買方"); await type(source(), "未儲存的來源"); await click("取消");
  await click("＋ 新增買方"); await act(async () => container.querySelector('.search-select-toggle').click());
  expect(options()).not.toContain("未儲存的來源");
});
