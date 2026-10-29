import { IDBFactory } from "fake-indexeddb";
import { PDFDocument } from "pdf-lib";
import { chooseDraftSlot, listPdfRecords, makePdfSelection, pdfLibraryError, readSavedPdf, removePdfRecord, renamePdfRecord, resolvePdfSelection, saveDraftPdf, saveFavoritePdfSelection } from "./propertyPdfLibrary";

const property = (id) => ({ id, title: `物件 ${id}`, listingNo: `DE${id}` });
const selection = (id, buyerId = "buyer-a") => makePdfSelection([property(id)], buyerId, "測試買方");
let pdf;
beforeEach(async () => {
  global.indexedDB = new IDBFactory();
  if (!global.structuredClone) global.structuredClone = function clone(value) {
    if (ArrayBuffer.isView(value)) return new Uint8Array(value);
    if (Array.isArray(value)) return value.map(clone);
    if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).map(([key, entry]) => [key, clone(entry)]));
    return value;
  };
  const document = await PDFDocument.create();
  document.addPage([595, 842]);
  pdf = { bytes: await document.save(), filename: "帶看.pdf", pageCount: 1, fileCount: 1, summaryCount: 0 };
});

test("retains five recent PDFs, evicts only the oldest draft and preserves all five favorites", async () => {
  for (let slot = 0; slot < 5; slot += 1) {
    await saveFavoritePdfSelection("staff-a", slot, selection(`favorite-${slot}`), slot + 1);
    await saveDraftPdf("staff-a", selection(`draft-${slot}`), pdf, slot + 1);
  }
  const sixth = await saveDraftPdf("staff-a", selection("sixth"), pdf, 6);
  expect(sixth.slot).toBe(0);
  const records = await listPdfRecords("staff-a");
  expect(records).toHaveLength(10);
  expect(records.filter((record) => record.kind === "favorite").map((record) => record.properties[0].id).sort())
    .toEqual(["favorite-0", "favorite-1", "favorite-2", "favorite-3", "favorite-4"]);
  expect(records.some((record) => record.properties[0].id === "draft-0")).toBe(false);
  const restored = await PDFDocument.load(await readSavedPdf("staff-a", 0));
  expect(restored.getPageCount()).toBe(1);
});

test("each colleague has their own slots and cannot retrieve another account's PDF", async () => {
  await saveDraftPdf("staff-a", selection("A"), pdf);
  expect(await listPdfRecords("staff-b")).toEqual([]);
  expect(await readSavedPdf("staff-b", 0)).toBeNull();
  const secondPdf = { ...pdf, bytes: new Uint8Array([37, 80, 68, 70, 2]) };
  await saveDraftPdf("staff-b", selection("B"), secondPdf);
  expect((await listPdfRecords("staff-a"))[0].properties[0].id).toBe("A");
  expect((await listPdfRecords("staff-b"))[0].properties[0].id).toBe("B");
  expect(Array.from(await readSavedPdf("staff-b", 0))).toEqual(Array.from(secondPdf.bytes));
  expect(Array.from(await readSavedPdf("staff-a", 0))).toEqual(Array.from(pdf.bytes));
});

test("updates the same draft for the same buyer and order, but treats a different buyer or order as a new group", async () => {
  const first = makePdfSelection([property("1"), property("2")], "buyer-a");
  await saveDraftPdf("staff", first, pdf, 1);
  const again = await saveDraftPdf("staff", first, { ...pdf, pageCount: 2 }, 2);
  expect(again.slot).toBe(0);
  expect((await listPdfRecords("staff"))).toHaveLength(1);
  await saveDraftPdf("staff", makePdfSelection([property("2"), property("1")], "buyer-a"), pdf, 3);
  await saveDraftPdf("staff", makePdfSelection([property("1"), property("2")], "buyer-b"), pdf, 4);
  expect((await listPdfRecords("staff"))).toHaveLength(3);
});

test("renaming preserves the PDF, and does not make an old PDF newer for rotation", async () => {
  for (let slot = 0; slot < 5; slot += 1) await saveDraftPdf("staff", selection(String(slot)), pdf, slot + 1);
  await renamePdfRecord("staff", "draft", 0, "新的名稱", 100);
  const renamed = (await listPdfRecords("staff")).find((record) => record.slot === 0);
  expect(renamed.name).toBe("新的名稱");
  expect(renamed.generatedAt).toBe(1);
  expect((await readSavedPdf("staff", 0)).length).toBe(pdf.bytes.length);
  expect(chooseDraftSlot(await listPdfRecords("staff"), "different-group")).toBe(0);
});

test("deleting a draft removes its file only, leaving other slots and the other account intact", async () => {
  await saveDraftPdf("staff-a", selection("1"), pdf);
  await saveFavoritePdfSelection("staff-a", 0, selection("2"));
  await saveDraftPdf("staff-b", selection("3"), pdf);
  await removePdfRecord("staff-a", "draft", 0);
  expect(await readSavedPdf("staff-a", 0)).toBeNull();
  expect(await listPdfRecords("staff-a")).toHaveLength(1);
  expect((await readSavedPdf("staff-b", 0)).length).toBe(pdf.bytes.length);
});

test("rejects invalid slots, unsigned accounts, and missing PDFs without modifying the library", async () => {
  expect(() => saveFavoritePdfSelection("staff", 5, selection("1"))).toThrow("有效的儲存位置");
  expect(() => listPdfRecords("")).toThrow("請先登入");
  expect(() => saveDraftPdf("staff", selection("1"), { bytes: new Uint8Array() })).toThrow("沒有可暫存");
  expect(await listPdfRecords("staff")).toEqual([]);
});

test("selection preserves order without duplicates and stores only identifiers, labels and recipient", () => {
  const result = makePdfSelection([{ ...property("2"), totalPrice: 9999, sheetFileUrl: "private-url" }, property("1"), property("2")], "buyer", "測試", "  A7 兩房車  ");
  expect(result.name).toBe("A7 兩房車");
  expect(result.properties.map((entry) => entry.id)).toEqual(["2", "1"]);
  expect(JSON.stringify(result)).not.toContain("private-url");
  expect(JSON.stringify(result)).not.toContain("9999");
});

test("loading a saved group resolves the current prices and files in its original order", () => {
  const saved = makePdfSelection([property("2"), property("1")]);
  const current = [{ ...property("1"), totalPrice: 1688 }, { ...property("2"), totalPrice: 1298, sheetFiles: [{ name: "新版.pdf" }] }];
  const restored = resolvePdfSelection(saved, current);
  expect(restored.missing).toEqual([]);
  expect(restored.properties.map((entry) => entry.totalPrice)).toEqual([1298, 1688]);
  expect(restored.properties[0].sheetFiles[0].name).toBe("新版.pdf");
});

test("recovers a replaced document by unique listing number, reports missing or ambiguous matches", () => {
  const saved = makePdfSelection([property("1"), property("2"), property("3")]);
  const restored = resolvePdfSelection(saved, [{ id: "new", listingNo: "DE1" }, { id: "two-a", listingNo: "DE2" }, { id: "two-b", listingNo: "DE2" }]);
  expect(restored.properties.map((entry) => entry.id)).toEqual(["new"]);
  expect(restored.missing.map((entry) => entry.id)).toEqual(["2", "3"]);
});

test("reports a full device without promising the PDF was saved", async () => {
  expect(pdfLibraryError({ name: "QuotaExceededError" })).toContain("PDF 仍可下載");
  delete global.indexedDB;
  await expect(listPdfRecords("staff")).rejects.toThrow("無法保留暫存");
});
