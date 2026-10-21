import { PDFDocument } from "pdf-lib";
import { getPropertySheetPlan, mergePropertySheets } from "./propertyViewingPdf";
import { buildPropertySummary } from "./propertySummaryCanvas";

const tinyPng = Uint8Array.from(Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/lZkAAAAASUVORK5CYII=",
  "base64",
));

test("plans all attachments in the selected property order, including legacy files", () => {
  const plan = getPropertySheetPlan([
    { id: "one", title: "第一間", sheetFiles: [{ url: "https://example.com/a.pdf", name: "正面.pdf" }, { url: "https://example.com/b.jpg" }] },
    { id: "two", title: "第二間", sheetFileUrl: "https://example.com/legacy.pdf" },
    { id: "three", title: "第三間", sheetFiles: [] },
  ]);

  expect(plan.map((entry) => [entry.title, entry.files.length, entry.skippedCount, entry.missing])).toEqual([
    ["第一間", 1, 1, false],
    ["第二間", 1, 0, false],
    ["第三間", 0, 0, true],
  ]);
  expect(plan[0].files[0].url).toBe("https://example.com/b.jpg");
});

test("chooses the newest dated LINE sheet even if an older one was appended later", () => {
  const [entry] = getPropertySheetPlan([{
    id: "one", title: "鴻廣新A7", sheetFiles: [
      { url: "https://example.com/new.jpg", name: "LINE_ALBUM_115.08進案物調_261004_8.jpg" },
      { url: "https://example.com/old.jpg", name: "LINE_ALBUM_115.08進案物調_260824_1.jpg" },
    ],
  }]);
  expect(entry.files[0].url).toBe("https://example.com/new.jpg");
  expect(entry.skippedCount).toBe(1);
});

test("uses upload time, then list order, when filenames have no date", () => {
  const [datedUpload, listFallback] = getPropertySheetPlan([
    { id: "one", sheetFiles: [
      { url: "https://example.com/new.jpg", name: "新版.jpg", uploadedAt: "2026-10-21T09:00:00Z" },
      { url: "https://example.com/old.jpg", name: "舊版.jpg", uploadedAt: "2026-10-20T09:00:00Z" },
    ] },
    { id: "two", sheetFiles: [
      { url: "https://example.com/first.jpg", name: "第一份.jpg" },
      { url: "https://example.com/last.jpg", name: "最後一份.jpg" },
    ] },
  ]);
  expect(datedUpload.files[0].url).toBe("https://example.com/new.jpg");
  expect(listFallback.files[0].url).toBe("https://example.com/last.jpg");
});

test("merges only the newest source file for one property", async () => {
  const load = jest.fn(async () => tinyPng);
  const merged = await mergePropertySheets([{
    id: "one", title: "兩份物調", sheetFiles: [
      { url: "https://example.com/old.png", name: "LINE_ALBUM_260824_1.png" },
      { url: "https://example.com/new.png", name: "LINE_ALBUM_261004_1.png" },
    ],
  }], load);
  expect(load).toHaveBeenCalledTimes(1);
  expect(load).toHaveBeenCalledWith("https://example.com/new.png");
  expect(merged).toMatchObject({ fileCount: 1, summaryCount: 0, pageCount: 1 });
});

test("keeps all pages of the chosen PDF in property order", async () => {
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
  const merged = await mergePropertySheets([
    { id: "one", title: "圖片資料表", sheetFiles: [{ url: "https://example.com/sheet.png", name: "sheet.png" }] },
  ], async () => tinyPng);
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

test("places a CRM summary page exactly where a selected property has no sheet", async () => {
  const original = await PDFDocument.create();
  original.addPage([400, 500]);
  const summaryProperties = [];
  const merged = await mergePropertySheets([
    { id: "one", title: "有資料表", sheetFiles: [{ url: "https://example.com/a.pdf" }] },
    { id: "two", title: "缺資料表", sheetFiles: [] },
    { id: "three", title: "也缺資料表", sheetFiles: [] },
  ], async () => await original.save(), async (property) => {
    summaryProperties.push(property.title);
    return tinyPng;
  });
  const output = await PDFDocument.load(merged.bytes);
  expect(summaryProperties).toEqual(["缺資料表", "也缺資料表"]);
  expect(merged).toMatchObject({ fileCount: 1, summaryCount: 2, pageCount: 3 });
  expect(output.getPages().map((page) => Math.round(page.getWidth()))).toEqual([400, 595, 595]);
});

test("summary uses only known CRM fields and marks missing values explicitly", () => {
  const summary = buildPropertySummary({
    title: "文化二路兩房", listingNo: "DE123", totalPrice: "1280", mainBuildingPing: "15.1",
    address: "桃園市龜山區文化二路", status: "active", layout: "0/0/0",
    notes: "內部備註不該印在帶看資料",
  }, new Date("2026-10-21T00:00:00Z"));
  expect(summary.basic[0]).toEqual(["總價", "1280 萬"]);
  expect(summary.basic[1]).toEqual(["格局", "未提供"]);
  expect(summary.areas[1]).toEqual(["主建物", "15.1 坪"]);
  expect(summary.location[2]).toEqual(["地址", "桃園市龜山區文化二路"]);
  expect(JSON.stringify(summary)).not.toContain("內部備註");
});

test("blocks an incomplete attachment link instead of silently using a summary", async () => {
  await expect(mergePropertySheets([
    { id: "one", title: "檔案網址壞掉", sheetFiles: [{ url: "" }] },
  ], async () => { throw new Error("should not fetch"); })).rejects.toThrow("資料表連結不完整");
});

test("reports which file failed instead of returning a partial PDF", async () => {
  await expect(mergePropertySheets([
    { id: "one", title: "第一間", sheetFiles: [{ url: "https://example.com/broken.pdf", name: "broken.pdf" }] },
  ], async () => { throw new Error("檔案下載失敗"); })).rejects.toThrow("第一間」的「broken.pdf");
});
