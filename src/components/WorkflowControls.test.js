import React, { act, useState } from "react";
import { createRoot } from "react-dom/client";
import { Simulate } from "react-dom/test-utils";
import SearchSelect from "./SearchSelect";
import FileDropZone from "./FileDropZone";

let container, root;
beforeEach(() => { global.IS_REACT_ACT_ENVIRONMENT = true; container = document.createElement("div"); document.body.append(container); root = createRoot(container); });
afterEach(() => { act(() => root.unmount()); container.remove(); });
function Choice({ initial = "", allowCustom = true, onPick = () => {} }) {
  const [value, setValue] = useState(initial);
  return <><SearchSelect label="社區" value={value} allowCustom={allowCustom} onChange={value => { setValue(value); onPick(value); }} options={[{ value: "one", label: "智匯學", searchText: "A7 牛角坡路" }, { value: "two", label: "金捷市", searchText: "樂善二路" }]} /><output>{value}</output><button>其他欄位</button></>;
}
const type = value => act(() => { const input = container.querySelector('[role="combobox"]'); Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set.call(input, value); input.dispatchEvent(new Event("input", { bubbles: true })); });
const key = (value, extra = {}) => act(() => container.querySelector('[role="combobox"]').dispatchEvent(new KeyboardEvent("keydown", { key: value, bubbles: true, cancelable: true, ...extra })));
const pdf = () => new File(["valid fixture"], "物調.pdf", { type: "application/pdf" });
const drag = files => ({ dataTransfer: { files, items: [], types: ["Files"] } });

test("search matches aliases/fullwidth text and keyboard picks without reopening", () => {
  act(() => root.render(<Choice />)); type("Ａ７");
  expect(container.querySelectorAll('[role="option"]')).toHaveLength(1);
  key("ArrowDown"); key("Enter");
  expect(container.querySelector("output").textContent).toBe("one");
  expect(container.querySelector('[role="combobox"]').value).toBe("智匯學");
  expect(container.querySelector('[role="listbox"]')).toBeNull();
});
test("strict staff-style picker preserves selected identity while typing and blurring", () => {
  const onPick = jest.fn(); act(() => root.render(<Choice initial="one" allowCustom={false} onPick={onPick} />));
  type("未建檔的人"); expect(container.querySelector("output").textContent).toBe("one");
  act(() => Simulate.blur(container.querySelector('[role="combobox"]'), { relatedTarget: container.querySelector("button:last-child") }));
  expect(container.querySelector('[role="combobox"]').value).toBe("智匯學"); expect(onPick).not.toHaveBeenCalled();
});
test("custom community remains entered, and composing Enter never selects another option", () => {
  act(() => root.render(<Choice />)); type("新社區"); key("Escape");
  expect(container.querySelector("output").textContent).toBe("新社區");
  type("金捷"); key("ArrowDown"); key("Enter", { isComposing: true });
  expect(container.querySelector("output").textContent).toBe("金捷");
  key("Enter"); expect(container.querySelector("output").textContent).toBe("two");
});
test("file picker and drag-drop use the same validated upload callback", async () => {
  const receive = jest.fn(); act(() => root.render(<FileDropZone label="物調" accept=".pdf" onFiles={receive} />));
  const file = pdf();
  await act(async () => Simulate.change(container.querySelector('input[type="file"]'), { target: { files: [file], value: "" } }));
  await act(async () => Simulate.drop(container.querySelector('.file-drop-zone'), drag([file])));
  expect(receive).toHaveBeenCalledTimes(2); expect(receive).toHaveBeenLastCalledWith([file]);
});
test("a mixed invalid batch and oversized files never reach cloud upload", async () => {
  const receive = jest.fn(); act(() => root.render(<FileDropZone label="物調" accept=".pdf" maxBytes={8} onFiles={receive} />));
  await act(async () => Simulate.drop(container.querySelector('.file-drop-zone'), drag([pdf()])));
  expect(container.querySelector('[role="alert"]').textContent).toContain("超過");
  await act(async () => Simulate.drop(container.querySelector('.file-drop-zone'), drag([new File(["p"], "a.pdf"), new File(["x"], "bad.exe")])));
  expect(container.querySelector('[role="alert"]').textContent).toContain("格式不支援"); expect(receive).not.toHaveBeenCalled();
});
test("repeated drops while uploading are locked, then enabled again", async () => {
  let resolve; const receive = jest.fn(() => new Promise(done => { resolve = done; }));
  act(() => root.render(<FileDropZone label="物調" accept=".pdf" onFiles={receive} />));
  await act(async () => { Simulate.drop(container.querySelector('.file-drop-zone'), drag([pdf()])); Simulate.drop(container.querySelector('.file-drop-zone'), drag([pdf()])); });
  expect(receive).toHaveBeenCalledTimes(1); expect(container.querySelector('button').disabled).toBe(true);
  await act(async () => resolve()); expect(container.querySelector('button').disabled).toBe(false);
});
test("disabled and folder drops cannot upload or navigate away", async () => {
  const receive = jest.fn(); act(() => root.render(<FileDropZone label="物調" accept=".pdf" disabled onFiles={receive} />));
  await act(async () => Simulate.drop(container.querySelector('.file-drop-zone'), drag([pdf()]))); expect(receive).not.toHaveBeenCalled();
  act(() => root.render(<FileDropZone label="物調" accept=".pdf" onFiles={receive} />));
  await act(async () => Simulate.drop(container.querySelector('.file-drop-zone'), { dataTransfer: { files: [pdf()], types: ["Files"], items: [{ webkitGetAsEntry: () => ({ isDirectory: true }) }] } }));
  expect(container.querySelector('[role="alert"]').textContent).toContain("資料夾"); expect(receive).not.toHaveBeenCalled();
});
