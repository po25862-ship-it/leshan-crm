import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { Simulate } from "react-dom/test-utils";
import PropertyListTags from "./PropertyListTags";

global.IS_REACT_ACT_ENVIRONMENT = true;
let host, root, onSave, onRowClick;
const property = { id: "p1", title: "兩房車", tags: ["邊間"], tagCatalog: ["有裝潢"] };
const button = text => [...host.querySelectorAll("button")].find(element => element.textContent.trim() === text);
beforeEach(() => {
  host = document.createElement("div"); document.body.appendChild(host); root = createRoot(host);
  onSave = jest.fn(async () => {}); onRowClick = jest.fn();
  act(() => root.render(<div onClick={onRowClick} onKeyDown={onRowClick}><PropertyListTags property={property} choices={["邊間", "廁所開窗"]} onSave={onSave} /></div>));
});
afterEach(() => { act(() => root.unmount()); host.remove(); });

test("從清單選標籤不打開資料或勾選物件，明確儲存後才寫入", async () => {
  act(() => button("＋ 標籤").click());
  act(() => button("廁所開窗＋").click());
  act(() => Simulate.keyDown(host.querySelector("input"), { key: "a" }));
  expect(onRowClick).not.toHaveBeenCalled();
  expect(onSave).not.toHaveBeenCalled();
  await act(async () => button("儲存標籤").click());
  expect(onSave).toHaveBeenCalledTimes(1);
  expect(onSave).toHaveBeenCalledWith(["邊間", "廁所開窗"]);
  expect(host.textContent).toContain("標籤已儲存");
  expect(host.querySelector("input")).toBeNull();
  expect(onRowClick).not.toHaveBeenCalled();
});

test("取消未儲存的新增及移除，下次開啟以目前案件標籤開始", () => {
  act(() => button("＋ 標籤").click());
  act(() => host.querySelector('[aria-label="移除小標籤：邊間"]').click());
  act(() => button("有裝潢＋").click());
  act(() => button("取消").click());
  expect(onSave).not.toHaveBeenCalled();
  act(() => button("＋ 標籤").click());
  expect(host.querySelector('[aria-label="移除小標籤：邊間"]')).not.toBeNull();
  expect(host.querySelector('[aria-label="移除小標籤：有裝潢"]')).toBeNull();
});

test("連線失敗保留選擇可重試，儲存中阻擋重複送出及修改", async () => {
  onSave.mockRejectedValueOnce(new Error("offline"));
  act(() => button("＋ 標籤").click());
  act(() => button("廁所開窗＋").click());
  await act(async () => button("儲存標籤").click());
  expect(host.querySelector('[role="alert"]').textContent).toContain("標籤未儲存");
  expect(host.querySelector('[aria-label="移除小標籤：廁所開窗"]')).not.toBeNull();
  let finish;
  onSave.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
  act(() => button("儲存標籤").click());
  expect(button("儲存中…").disabled).toBe(true);
  expect(button("取消").disabled).toBe(true);
  expect(host.querySelector("fieldset").disabled).toBe(true);
  await act(async () => { finish(); });
  expect(onSave).toHaveBeenCalledTimes(2);
  expect(host.querySelector('[role="alert"]')).toBeNull();
  expect(host.textContent).toContain("標籤已儲存");
});
