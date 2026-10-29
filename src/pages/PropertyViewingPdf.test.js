import React, { act } from "react";
import { createRoot } from "react-dom/client";
import PropertyViewingPdf from "./PropertyViewingPdf";
import { mergePropertySheets } from "../lib/propertyViewingPdf";

jest.mock("../AuthContext", () => ({ useAuth: () => ({ user: { uid: "test-staff" } }) }));
jest.mock("../hooks/useSharedCollection", () => ({ useSharedCollection: () => ({ items: [{ id: "buyer-a", name: "測試買方" }, { id: "buyer-b", name: "另一買方" }] }) }));
jest.mock("../lib/propertySheetDownload", () => ({ downloadPropertySheet: jest.fn() }));
jest.mock("../lib/propertyViewingPdf", () => ({
  getPropertySheetPlan: (properties) => properties.map((property) => ({ ...property, files: [], missing: true })),
  mergePropertySheets: jest.fn(),
}));

let container, root;
beforeEach(() => {
  global.IS_REACT_ACT_ENVIRONMENT = true;
  container = document.createElement("div"); document.body.appendChild(container);
  root = createRoot(container);
  URL.createObjectURL = jest.fn(() => "blob:test-pdf");
  URL.revokeObjectURL = jest.fn();
  mergePropertySheets.mockReset();
});
afterEach(() => { act(() => root.unmount()); container.remove(); });
const properties = [{ id: "one", title: "測試物件" }];
const output = { bytes: new Uint8Array([37, 80, 68, 70]), fileCount: 0, summaryCount: 1, pageCount: 1 };
async function create() {
  await act(async () => [...container.querySelectorAll("button")].find((button) => button.textContent === "製作合併 PDF").click());
}

test("automatically saves only a successfully generated PDF with the original recipient", async () => {
  mergePropertySheets.mockResolvedValue(output);
  const onGenerated = jest.fn(async () => ({ slot: 2 }));
  act(() => root.render(<PropertyViewingPdf properties={properties} buyerId="buyer-a" onGenerated={onGenerated} />));
  await create();
  expect(onGenerated).toHaveBeenCalledWith({ properties, buyerId: "buyer-a", buyerName: "測試買方" }, expect.objectContaining({ ...output, filename: expect.stringContaining("測試買方") }));
  expect(container.textContent).toContain("暫存 3");
  expect(container.querySelector("a[download]").href).toBe("blob:test-pdf");
});

test("a device storage failure keeps the generated PDF available for download", async () => {
  mergePropertySheets.mockResolvedValue(output);
  const onGenerated = jest.fn(async () => { throw { name: "QuotaExceededError" }; });
  act(() => root.render(<PropertyViewingPdf properties={properties} buyerId="buyer-a" onGenerated={onGenerated} />));
  await create();
  expect(container.textContent).toContain("沒有存入暫存");
  expect(container.querySelector("a[download]")).not.toBeNull();
});

test("changing the buyer while generating does not show or cache the old buyer's result", async () => {
  let finish;
  mergePropertySheets.mockImplementation(() => new Promise((resolve) => { finish = resolve; }));
  const onGenerated = jest.fn();
  act(() => root.render(<PropertyViewingPdf properties={properties} buyerId="buyer-a" onGenerated={onGenerated} />));
  await create();
  act(() => root.render(<PropertyViewingPdf properties={properties} buyerId="buyer-b" onGenerated={onGenerated} />));
  await act(async () => finish(output));
  expect(onGenerated).not.toHaveBeenCalled();
  expect(container.querySelector("a[download]")).toBeNull();
});

test("failed PDF generation never consumes a draft slot", async () => {
  mergePropertySheets.mockRejectedValue(new Error("資料表下載失敗"));
  const log = jest.spyOn(console, "error").mockImplementation(() => {});
  const onGenerated = jest.fn();
  act(() => root.render(<PropertyViewingPdf properties={properties} onGenerated={onGenerated} />));
  await create();
  expect(onGenerated).not.toHaveBeenCalled();
  expect(container.textContent).toContain("資料表下載失敗");
  log.mockRestore();
});
