import { PDFDocument } from "pdf-lib";
import { getPropertySheetPlan, mergePropertySheets } from "./propertyViewingPdf";

test("plans all attachments in the selected property order, including legacy files", () => {
  const plan = getPropertySheetPlan([
    { id: "one", title: "第一間", sheetFiles: [{ url: "https://example.com/a.pdf", name: "正面.pdf" }, { url: "https://example.com/b.jpg" }] },
    { id: "two", title: "第二間", sheetFileUrl: "https://example.com/legacy.pdf" },
    { id: "three", title: "第三間", sheetFiles: [] },
  ]);

  expect(plan.map((entry) => [entry.title, entry.files.length, entry.missing])).toEqual([
    ["第一間", 2, false],
    ["第二間", 1, false],
    ["第三間", 0, true],
  ]);
});

test("merges every PDF page in property and attachment order", async () => {
  const first = await PDFDocument.create();
  first.addPage([400, 500]);
  first.addPage([500, 400]);
  const second = await PDFDocument.create();
  second.addPage([300, 600]);
  const files = {
    "https://example.com/first.pdf": await first.save(),
    "https://example.com/second.pdf": await second.save(),
  };
  const merged = await mergePropertySheets([
    { id: "one", title: "第一間", sheetFiles: [{ url: "https://example.com/first.pdf", name: "first.pdf" }] },
    { id: "two", title: "第二間", sheetFiles: [{ url: "https://example.com/second.pdf", name: "second.pdf" }] },
  ], async (url) => files[url]);
  const output = await PDFDocument.load(merged.bytes);

  expect(merged.fileCount).toBe(2);
  expect(merged.pageCount).toBe(3);
  expect(output.getPages().map((page) => [page.getWidth(), page.getHeight()])).toEqual([
    [400, 500], [500, 400], [300, 600],
  ]);
});

test("turns an uploaded image into a printable PDF page", async () => {
  const png = Uint8Array.from(Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/lZkAAAAASUVORK5CYII=",
    "base64",
  ));
  const merged = await mergePropertySheets([
    { id: "one", title: "圖片資料表", sheetFiles: [{ url: "https://example.com/sheet.png", name: "sheet.png" }] },
  ], async () => png);
  const output = await PDFDocument.load(merged.bytes);

  expect(merged.pageCount).toBe(1);
  expect(Math.round(output.getPage(0).getWidth())).toBe(595);
  expect(Math.round(output.getPage(0).getHeight())).toBe(842);
});

test("flattens a filled PDF form so its content can be printed after merging", async () => {
  const source = await PDFDocument.create();
  const page = source.addPage([400, 500]);
  const field = source.getForm().createTextField("caseNumber");
  field.addToPage(page, { x: 40, y: 400, width: 170, height: 30 });
  field.setText("CASE-123");
  const merged = await mergePropertySheets([
    { id: "one", title: "表單資料表", sheetFiles: [{ url: "https://example.com/form.pdf", name: "form.pdf" }] },
  ], async () => await source.save());
  const output = await PDFDocument.load(merged.bytes);

  expect(output.getPageCount()).toBe(1);
  expect(output.getForm().getFields()).toHaveLength(0);
});

test("does not silently omit a selected property without a sheet", async () => {
  await expect(mergePropertySheets([
    { id: "one", title: "有資料表", sheetFiles: [{ url: "https://example.com/a.pdf" }] },
    { id: "two", title: "缺資料表", sheetFiles: [] },
  ], async () => { throw new Error("should not fetch"); })).rejects.toThrow("缺資料表");
});

test("reports which file failed instead of returning a partial PDF", async () => {
  await expect(mergePropertySheets([
    { id: "one", title: "第一間", sheetFiles: [{ url: "https://example.com/broken.pdf", name: "broken.pdf" }] },
  ], async () => { throw new Error("檔案下載失敗"); })).rejects.toThrow("第一間」的「broken.pdf");
});
