import React, { act } from "react";
import { createRoot } from "react-dom/client";
import TextSizeSettings, { TextSizeProvider } from "../components/TextSizeSettings";
import { normalizeTextSizes, readTextSizes, textSizeKey, writeTextSizes } from "./textSize";

global.IS_REACT_ACT_ENVIRONMENT = true;

let container, root;
beforeEach(() => {
  localStorage.clear();
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});
afterEach(() => {
  act(() => root.unmount());
  container.remove();
  jest.restoreAllMocks();
});
const render = (userId = "colleague-a", isMobile = false) => act(() => root.render(
  <TextSizeProvider key={userId} userId={userId} isMobile={isMobile}><TextSizeSettings /><p>案件內容</p><input aria-label="未儲存內容" defaultValue="" /></TextSizeProvider>
));
const open = () => act(() => container.querySelector(".text-size-trigger").click());
const select = (value) => act(() => container.querySelector(`input[value="${value}"]`).click());
const size = () => container.querySelector(".crm-font-scope").dataset.crmTextSize;

test("invalid, corrupt and unavailable storage safely fall back to standard", () => {
  expect(normalizeTextSizes({ desktop: "gigantic", mobile: "large" })).toEqual({ desktop: "standard", mobile: "large" });
  localStorage.setItem(textSizeKey("a"), "broken json");
  expect(readTextSizes(localStorage, "a")).toEqual({ desktop: "standard", mobile: "standard" });
  const unavailable = { getItem() { throw Error("blocked"); }, setItem() { throw Error("full"); } };
  expect(readTextSizes(unavailable, "a").desktop).toBe("standard");
  expect(writeTextSizes(unavailable, "a", { desktop: "large" })).toBe(false);
});

test("the three radio choices immediately apply and survive remounting", () => {
  render(); open();
  expect([...container.querySelectorAll('input[type="radio"]')].map((input) => input.getAttribute("aria-label"))).toEqual(["標準", "大", "特大"]);
  const draft = container.querySelector('input[aria-label="未儲存內容"]');
  draft.value = "還沒儲存的客需";
  select("xlarge");
  expect(container.querySelector('input[aria-label="未儲存內容"]')).toBe(draft);
  expect(draft.value).toBe("還沒儲存的客需");
  expect(size()).toBe("xlarge");
  expect(container.querySelector(".crm-font-scope").style.getPropertyValue("--crm-font-scale")).toBe("1.25");
  expect(JSON.parse(localStorage.getItem(textSizeKey("colleague-a"))).desktop).toBe("xlarge");
  act(() => root.render(null));
  render();
  expect(size()).toBe("xlarge");
});

test("each account and mobile/desktop profile keeps its own choice", () => {
  render("colleague-a"); open(); select("xlarge");
  render("colleague-a", true);
  expect(size()).toBe("standard");
  select("large");
  render("colleague-a", false);
  expect(size()).toBe("xlarge");
  render("colleague-b", false);
  expect(size()).toBe("standard");
  open(); select("large");
  render("colleague-a", true);
  expect(size()).toBe("large");
  expect(JSON.parse(localStorage.getItem(textSizeKey("colleague-b"))).desktop).toBe("large");
});

test("blocked saving still applies the selected size and explains persistence", () => {
  jest.spyOn(Storage.prototype, "setItem").mockImplementation(() => { throw Error("blocked"); });
  render(); open(); select("large");
  expect(size()).toBe("large");
  expect(container.querySelector('[role="status"]').textContent).toContain("無法記住設定");
});

test("Escape closes settings and returns focus to the trigger", () => {
  render(); open();
  act(() => document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true })));
  expect(container.querySelector(".text-size-panel")).toBeNull();
  expect(document.activeElement).toBe(container.querySelector(".text-size-trigger"));
});

test("another account's storage event cannot overwrite the active preference", () => {
  render("colleague-a"); open(); select("large");
  act(() => window.dispatchEvent(new StorageEvent("storage", { key: textSizeKey("colleague-b"), newValue: '{"desktop":"xlarge"}' })));
  expect(size()).toBe("large");
  localStorage.setItem(textSizeKey("colleague-a"), '{"desktop":"xlarge"}');
  act(() => window.dispatchEvent(new StorageEvent("storage", { key: textSizeKey("colleague-a") })));
  expect(size()).toBe("xlarge");
});
