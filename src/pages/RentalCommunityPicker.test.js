/** @jest-environment jsdom */
import React, { act, useState } from "react";
import { createRoot } from "react-dom/client";
import RentalCommunityPicker from "./RentalCommunityPicker";
import { A7_RENTAL_COMMUNITIES } from "../lib/rentalCommunities";

let container, root;
function Harness({ initial = "" }) { const [value, setValue] = useState(initial); return <><RentalCommunityPicker value={value} onChange={setValue} /><output>{value}</output><button>下一欄</button></>; }
beforeEach(() => { global.IS_REACT_ACT_ENVIRONMENT = true; container = document.createElement("div"); document.body.appendChild(container); root = createRoot(container); });
afterEach(() => { act(() => root.unmount()); container.remove(); });
const render = initial => act(() => root.render(<Harness initial={initial} />));
function type(value) { const input = container.querySelector("input"); act(() => { Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").set.call(input, value); input.dispatchEvent(new Event("input", { bubbles: true })); }); }
function key(value) { act(() => container.querySelector("input").dispatchEvent(new KeyboardEvent("keydown", { key: value, bubbles: true }))); }

test("opening shows every A7 community; alias search and clicking choose the canonical name", () => {
  render(); act(() => container.querySelector(".cr-community-toggle").click());
  expect(container.querySelectorAll("[role=option]")).toHaveLength(A7_RENTAL_COMMUNITIES.length);
  type("新潤興業鉑麗"); expect(container.querySelectorAll("[role=option]")).toHaveLength(1);
  act(() => container.querySelector("[role=option]").click());
  expect(container.querySelector("output").textContent).toBe("新潤鉑麗／新潤翡麗2");
  expect(container.querySelector("input").getAttribute("aria-expanded")).toBe("false");
});
test("keyboard selection works and unmatched communities remain manually editable", () => {
  render(); type("智匯"); key("ArrowDown"); key("Enter");
  expect(container.querySelector("output").textContent).toBe("智匯學");
  type("新社區手動名稱"); key("ArrowUp");
  expect(container.textContent).toContain("可直接使用目前輸入的名稱");
  expect(container.querySelector("output").textContent).toBe("新社區手動名稱");
  expect(container.querySelector("input").hasAttribute("aria-activedescendant")).toBe(false);
  key("Escape"); expect(container.querySelector("[role=listbox]")).toBeNull();
});
test("existing non-A7 or custom community names are preserved until explicitly changed", () => {
  render("A9既有社區");
  expect(container.querySelector("input").value).toBe("A9既有社區");
  act(() => container.querySelector(".cr-community-toggle").click());
  expect(container.querySelectorAll("[role=option]")).toHaveLength(A7_RENTAL_COMMUNITIES.length);
  expect(container.querySelector("output").textContent).toBe("A9既有社區");
});
