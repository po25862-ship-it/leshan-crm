import React, { act } from "react";
import { createRoot } from "react-dom/client";
import PropertyPdfLibrary from "./PropertyPdfLibrary";
import { useSharedCollection } from "../hooks/useSharedCollection";
import { makePdfSelection, readSavedPdf } from "../lib/propertyPdfLibrary";

jest.mock("../AuthContext", () => ({ useAuth: () => ({ user: { uid: "test-staff" } }) }));
jest.mock("../hooks/useSharedCollection", () => ({ useSharedCollection: jest.fn() }));
jest.mock("../lib/propertyPdfLibrary", () => ({ ...jest.requireActual("../lib/propertyPdfLibrary"), readSavedPdf: jest.fn() }));
let container, root, library, onLoad;
const properties = [{ id: "one", title: "測試一", listingNo: "DE1" }, { id: "two", title: "測試二", listingNo: "DE2" }];
const favorite = { ...makePdfSelection(properties, "buyer", "測試買方", "A7 兩房車"), key: "favorite-0", kind: "favorite", slot: 0, updatedAt: 1 };
beforeEach(() => {
  global.IS_REACT_ACT_ENVIRONMENT = true;
  container = document.createElement("div"); document.body.appendChild(container); root = createRoot(container);
  library = { records: [], loading: false, error: "", saveFavorite: jest.fn(async () => {}), rename: jest.fn(), remove: jest.fn() };
  onLoad = jest.fn();
  useSharedCollection.mockReset();
  useSharedCollection.mockReturnValue({ items: [{ id: "buyer", name: "測試買方", tags: ["買方"] }], loading: false });
  URL.createObjectURL = jest.fn(() => "blob:restored-pdf"); URL.revokeObjectURL = jest.fn();
});
afterEach(() => { act(() => root.unmount()); container.remove(); });
const button = (name) => [...container.querySelectorAll("button")].find((entry) => entry.textContent === name);
async function click(name) { await act(async () => button(name).click()); }
function render(current = properties) { act(() => root.render(<PropertyPdfLibrary library={library} properties={current} selectedProperties={properties} buyerId="buyer" onLoad={onLoad} />)); }

test("opens five device slots without loading contacts while the library stays collapsed", async () => {
  render();
  expect(useSharedCollection).not.toHaveBeenCalled();
  await click("開啟紀錄");
  expect(container.querySelectorAll(".pdf-library-card")).toHaveLength(5);
  expect(container.textContent).toContain("目前裝置與瀏覽器");
});

test("uses an empty favorite slot and requires an explicit confirmation before overwriting", async () => {
  library.records = [favorite]; render(); await click("開啟紀錄");
  await click("將已選 2 間存為常用");
  expect(library.saveFavorite).toHaveBeenLastCalledWith(1, expect.objectContaining({ buyerId: "buyer", properties: expect.arrayContaining([expect.objectContaining({ id: "one" })]) }));
  library.saveFavorite.mockClear();
  act(() => { const select = container.querySelector(".pdf-library-save select"); select.value = "0"; select.dispatchEvent(new Event("change", { bubbles: true })); });
  await click("將已選 2 間存為常用");
  expect(library.saveFavorite).not.toHaveBeenCalled();
  await click("確認更新這一格");
  expect(library.saveFavorite).toHaveBeenCalledWith(0, expect.objectContaining({ buyerId: "buyer" }));
});

test("loads a saved buyer and original order, but never silently drops missing properties", async () => {
  library.records = [favorite]; render(); await click("開啟紀錄"); await click("常用（1／5）");
  await click("載入物件製作 PDF");
  expect(onLoad).toHaveBeenCalledWith(properties, "buyer");
  onLoad.mockClear(); render([properties[0]]); await click("載入物件製作 PDF");
  expect(onLoad).not.toHaveBeenCalled();
  expect(container.textContent).toContain("為避免漏印，這次沒有載入");
});

test("removes an unavailable buyer from the restored selection instead of reusing their old ID", async () => {
  useSharedCollection.mockReturnValue({ items: [], loading: false });
  library.records = [favorite]; render(); await click("開啟紀錄"); await click("常用（1／5）"); await click("載入物件製作 PDF");
  expect(onLoad).toHaveBeenCalledWith(properties, "");
  expect(container.textContent).toContain("重新選擇介紹對象");
});

test("retrieves a saved PDF without regenerating or downloading source files", async () => {
  const draft = { ...favorite, kind: "draft", hasPdf: true, generatedAt: 1, filename: "帶看.pdf", pageCount: 2 };
  library.records = [draft]; readSavedPdf.mockResolvedValue(new Uint8Array([37, 80, 68, 70]));
  render(); await click("開啟紀錄"); await click("讀取已存 PDF");
  expect(readSavedPdf).toHaveBeenCalledWith("test-staff", 0);
  expect(container.querySelector("a[download]").getAttribute("download")).toBe("帶看.pdf");
  await click("收起紀錄");
  expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:restored-pdf");
});
