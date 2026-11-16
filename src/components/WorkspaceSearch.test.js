import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { MemoryRouter, useLocation } from "react-router-dom";
import WorkspaceSearch from "./WorkspaceSearch";
import { useCollection } from "../hooks/useCollection";

let mockProperties, mockContacts, mockNeeds, mockRentals;
jest.mock("../AuthContext", () => ({ useAuth: () => ({ user: { uid: "me" } }) }));
jest.mock("../hooks/useCollection", () => ({ useCollection: jest.fn(() => mockProperties) }));
jest.mock("../hooks/useSharedCollection", () => ({ useSharedCollection: () => mockContacts }));
jest.mock("../hooks/useNeedsCollection", () => ({ useNeedsCollection: () => mockNeeds }));
jest.mock("../hooks/useCompanyRentals", () => ({ useCompanyRentals: () => mockRentals }));
global.IS_REACT_ACT_ENVIRONMENT = true;
let container, root;
const empty = () => ({ items: [], loading: false, error: null });
function CurrentPage() { const location = useLocation(); return <output data-page>{location.pathname}{location.search}</output>; }
beforeEach(() => {
  mockProperties = empty(); mockContacts = empty(); mockNeeds = empty(); mockRentals = empty();
  useCollection.mockImplementation(() => mockProperties); container = document.createElement("div"); document.body.appendChild(container); root = createRoot(container);
});
afterEach(() => { act(() => root.unmount()); container.remove(); });
const render = () => act(() => root.render(<MemoryRouter initialEntries={["/"]} future={{ v7_startTransition: true, v7_relativeSplatPath: true }}><WorkspaceSearch /><CurrentPage /></MemoryRouter>));
const input = () => container.querySelector('input[type="search"]');
const type = text => act(() => { Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set.call(input(), text); input().dispatchEvent(new Event("input", { bubbles: true })); });

test("only opens data sources after a query; keyboard selection opens a matching case", () => {
  mockProperties.items = [{ id: "p1", title: "金捷市兩房", status: "onHold" }];
  render(); expect(useCollection).not.toHaveBeenCalled();
  type("金捷市"); expect(container.querySelector('[role="status"]').textContent).toBe("找到 1 筆");
  const link = container.querySelector('a[href="/properties?open=p1"]'); expect(link).not.toBeNull();
  act(() => input().dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true })));
  expect(document.activeElement).toBe(link);
  act(() => link.click());
  expect(container.querySelector('[data-page]').textContent).toBe("/properties?open=p1");
  expect(input().value).toBe("");
  expect(container.querySelector('.workspace-search-results')).toBeNull();
});

test("loading and permission errors are not presented as no results", () => {
  mockProperties.loading = true; render(); type("金捷市");
  expect(container.textContent).toContain("正在搜尋可查看的資料");
  expect(container.textContent).not.toContain("找不到");
  mockProperties = { ...empty(), error: new Error("denied") }; type("金捷市三房");
  expect(container.textContent).toContain("物件暫時無法讀取");
  expect(container.textContent).not.toContain("找不到");
});

test("Escape closes results without discarding the query; clearing starts a fresh search", () => {
  render(); type("不存在"); expect(container.textContent).toContain("找不到「不存在」");
  act(() => input().dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true })));
  expect(container.querySelector('.workspace-search-results')).toBeNull(); expect(input().value).toBe("不存在");
  act(() => container.querySelector('button[aria-label="清除工作台搜尋"]').click());
  expect(input().value).toBe(""); expect(document.activeElement).toBe(input());
});
