import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";
import { Simulate } from "react-dom/test-utils";
import Buyers from "./Buyers";

let mockContacts;
const mockAdd = jest.fn(async data => { mockContacts = [...mockContacts, { ...data, id: "new-buyer" }]; return "new-buyer"; });
const mockUpdate = jest.fn(async (id, data) => { mockContacts = mockContacts.map(item => item.id === id ? { ...item, ...data } : item); });
const mockSaveSources = jest.fn();
jest.mock("../lib/buyerSourceRepository", () => ({ saveBuyerSourceChanges: (...args) => mockSaveSources(...args) }));
jest.mock("../AuthContext", () => ({ useAuth: () => ({ user: { uid: "staff" } }) }));
jest.mock("../hooks/useSharedCollection", () => ({ useSharedCollection: () => ({ items: mockContacts, add: mockAdd, update: mockUpdate, remove: jest.fn() }) }));
jest.mock("../hooks/useCollection", () => ({ useCollection: () => ({ items: [] }) }));
jest.mock("../hooks/useNeedsCollection", () => ({ useNeedsCollection: () => ({ items: [] }) }));
jest.mock("./BuyerActivityLog", () => ({contactId,initialType,focusRequest,onLogged}) => <div data-testid="activity" data-contact={contactId} data-type={initialType} data-focus={focusRequest?.type || ""}><textarea aria-label="測試談話草稿" /><button type="button" onClick={()=>onLogged({date:'2026-11-17',summary:'測試談話'})}>測試儲存談話</button></div>);
jest.mock("./BuyerNeeds", () => () => <div data-testid="buyer-needs" />);
jest.mock("./ShareWithPicker", () => () => null);
jest.mock("./ContactConversationAnalyses", () => () => <div data-testid="buyer-analyses" />);

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
  mockSaveSources.mockReset().mockImplementation(async (_, changes) => { mockContacts = mockContacts.map(buyer => { const change = changes.find(row => row.id === buyer.id); return change ? { ...buyer, source: change.after } : buyer; }); return changes; });
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

const action = async label => act(async () => container.querySelector(`button[aria-label="${label}"]`).click());
test("source manager previews and confirms a merge, then the picker keeps the merged choice", async () => {
  mockContacts.push({ id: "four", name: "重複來源客戶", source: "591 typo", tags: ["買方"], ownerUid: "staff" });
  render(); await click("管理來源"); await action("修改或合併來源：591 typo");
  await type(source(), "591 智富館");
  expect(container.textContent).toContain("整理後這個來源共有 2 位買方");
  expect(mockSaveSources).not.toHaveBeenCalled();
  await click("確認合併來源"); render();
  expect(mockSaveSources).toHaveBeenCalledWith("staff", [{ id: "four", before: "591 typo", after: "591 智富館" }]);
  expect(container.textContent).toContain("已整理 1 位買方的來源");
  await click("關閉管理來源"); await click("＋ 新增買方");
  await act(async () => container.querySelector('.search-select-toggle').click());
  expect(options()).toContain("591 智富館"); expect(options()).not.toContain("591 typo");
});

test("deletion needs confirmation, cancelling does nothing, and undo keeps every buyer", async () => {
  render(); await click("管理來源"); await action("刪除來源：FB 社團");
  expect(container.textContent).toContain("來源欄位會清空"); expect(mockSaveSources).not.toHaveBeenCalled();
  await click("取消整理"); expect(mockSaveSources).not.toHaveBeenCalled();
  await action("刪除來源：FB 社團"); await click("確認刪除來源"); render();
  expect(mockContacts).toHaveLength(3); expect(mockContacts.find(b => b.id === "three").source).toBe("");
  await click("復原上次整理"); render();
  expect(mockContacts.find(b => b.id === "three").source).toBe("FB 社團");
  expect(container.textContent).toContain("已復原 1 位買方的來源");
});

test("source manager handles write failure and prevents changes while a buyer draft is open", async () => {
  render(); await click("＋ 新增買方");
  expect([...container.querySelectorAll("button")].find(b => b.textContent === "管理來源").disabled).toBe(true);
  await click("取消"); await click("管理來源"); await action("修改或合併來源：FB 社團"); await type(source(), "Facebook");
  mockSaveSources.mockRejectedValueOnce(new Error("另一裝置已修改，本次沒有修改資料。"));
  await click("確認修改來源");
  expect(container.querySelector('[role="alert"]').textContent).toContain("本次沒有修改資料");
  expect(mockContacts.find(b => b.id === "three").source).toBe("FB 社團");
});
test("opening a buyer puts the conversation first and keeps reference panels collapsed until requested",async()=>{
 render();await click("查看資料");const work=container.querySelector('.buyer-detail-workspace'),activity=work.querySelector('[data-testid="activity"]'),aside=work.querySelector('aside');
 expect(activity.dataset.type).toBe('interaction');expect(activity.compareDocumentPosition(aside)&Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
 const panels=work.querySelectorAll('aside>details');expect(panels).toHaveLength(3);expect([...panels].every(panel=>!panel.open)).toBe(true);
 expect(work.querySelector('[data-testid="buyer-needs"]')).toBeNull();expect(work.querySelector('[data-testid="buyer-analyses"]')).toBeNull();
 await act(async()=>{panels[1].open=true;panels[1].dispatchEvent(new Event('toggle'));});expect(work.querySelector('[data-testid="buyer-needs"]')).not.toBeNull();
 await act(async()=>{panels[1].open=false;panels[1].dispatchEvent(new Event('toggle'));});expect(work.querySelector('[data-testid="buyer-needs"]')).not.toBeNull();
});
test("header shortcuts target the current activity form and editing buyer details preserves the conversation draft",async()=>{
 render();await click("查看資料");const work=container.querySelector('.buyer-detail-workspace'),draft=work.querySelector('textarea');
 act(()=>Simulate.change(draft,{target:{value:'尚未儲存的談話'}}));draft.value='尚未儲存的談話';await click('約帶看');expect(work.querySelector('[data-testid="activity"]').dataset.focus).toBe('appointment');
 await click('記錄談話');expect(work.querySelector('[data-testid="activity"]').dataset.focus).toBe('interaction');await click('編輯資料');
 expect(work.querySelector('aside>details').open).toBe(true);expect(work.querySelector('textarea[aria-label="測試談話草稿"]')).toBe(draft);expect(draft.value).toBe('尚未儲存的談話');
 expect(document.activeElement).toBe(work.querySelector('input[placeholder="例如：陳小姐"]'));
});
test("saving buyer details after recording a talk preserves the updated last-contact date",async()=>{
 mockContacts[0].lastContactDate='2026-08-23';render();await click('查看資料');await click('編輯資料');await click('測試儲存談話');
 await act(async()=>Simulate.submit(container.querySelector('.buyer-detail-support form')));
 expect(mockUpdate).toHaveBeenLastCalledWith('one',expect.objectContaining({lastContactDate:'2026-11-17'}));
});
