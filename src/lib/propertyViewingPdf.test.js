import { PDFDocument, degrees } from "pdf-lib";
import { getPropertySheetPlan, mergePropertySheets } from "./propertyViewingPdf";
import { buildPropertySummary } from "./propertySummaryCanvas";

const tinyPng = Uint8Array.from(Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/lZkAAAAASUVORK5CYII=",
  "base64",
));

describe("latest sale prices", () => {
  const { webcrypto, createHash } = require("crypto");
  const originalCrypto = globalThis.crypto;
  beforeAll(() => Object.defineProperty(globalThis, "crypto", { configurable: true, value: webcrypto }));
  afterAll(() => Object.defineProperty(globalThis, "crypto", { configurable: true, value: originalCrypto }));
  const mark = { schema: 1, page: 0, sourceHash: createHash("sha256").update(tinyPng).digest("hex"), oldPrice: 1398, rect: { x: 0.1, y: 0.15, width: 0.3, height: 0.07 } };
  test("a verified source receives this property's current price rather than a value cached in its location metadata", async () => {
    const renderPrice = jest.fn(async () => tinyPng);
    const property = { id: "a", title: "鴻廣新A7", totalPrice: 1268, sheetFiles: [{ url: "https://example.com/sheet.png", priceMark: mark }] };
    const result = await mergePropertySheets([property], async () => tinyPng, undefined, { latestPrices: true, renderPrice });
    expect(result).toMatchObject({ priceOverlayCount: 1, priceHeaderCount: 0, pageCount: 1 });
    expect(renderPrice).toHaveBeenCalledWith(expect.objectContaining({ property, oldPrice: 1398 }));
    expect(property.totalPrice).toBe(1268);
    expect(property.sheetFiles[0].priceMark.oldPrice).toBe(1398);
  });
  test("changed file bytes or missing position metadata use a separate header, with no guessed cross-out", async () => {
    const renderPrice = jest.fn(async () => tinyPng);
    const properties = [
      { id: "a", totalPrice: 1268, sheetFiles: [{ url: "https://example.com/a.png", priceMark: { ...mark, sourceHash: "a".repeat(64) } }] },
      { id: "b", totalPrice: 888, sheetFiles: [{ url: "https://example.com/b.png" }] },
    ];
    const result = await mergePropertySheets(properties, async () => tinyPng, undefined, { latestPrices: true, renderPrice });
    expect(result).toMatchObject({ priceOverlayCount: 0, priceHeaderCount: 2, pageCount: 2 });
    expect(renderPrice.mock.calls.map(([input]) => [input.property.totalPrice, input.header, input.oldPrice])).toEqual([[1268, true, undefined], [888, true, undefined]]);
  });
  test("a source PDF keeps each page and places its current quote above all original content", async () => {
    const source = await PDFDocument.create();
    source.addPage([595, 842]).drawText("OLD PRICE 1398");
    source.addPage([842, 595]).drawText("SECOND PAGE");
    const result = await mergePropertySheets([{ id: "a", totalPrice: 1268, sheetFiles: [{ url: "https://example.com/a.pdf" }] }], async () => await source.save(), undefined, { latestPrices: true, renderPrice: async () => tinyPng });
    const pdf = await PDFDocument.load(result.bytes);
    expect(pdf.getPageCount()).toBe(2);
    expect(result).toMatchObject({ priceOverlayCount: 0, priceHeaderCount: 2 });
    expect(pdf.getPages().map((p) => [p.getWidth(), p.getHeight()])).toEqual([[595, 842], [842, 595]]);
  });
  test("rotated and blank source pages remain printable with their visible orientation", async () => {
    const source = await PDFDocument.create();
    source.addPage([595, 842]).setRotation(degrees(90));
    source.addPage([595, 842]).drawText("ORIGINAL CONTENT");
    const result = await mergePropertySheets([{ id: "a", totalPrice: 1268, sheetFiles: [{ url: "https://example.com/a.pdf" }] }], async () => await source.save(), undefined, { latestPrices: true, renderPrice: async () => tinyPng });
    const pdf = await PDFDocument.load(result.bytes);
    expect(pdf.getPages().map((p) => [p.getWidth(), p.getHeight()])).toEqual([[842, 595], [595, 842]]);
    expect(result.priceHeaderCount).toBe(2);
  });
});

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
  expect(summary.basic[0]).toEqual(["最新售價", "1,280 萬"]);
  expect(summary.basic[1]).toEqual(["格局", "未提供"]);
  expect(summary.areas[1]).toEqual(["主建物", "15.1 坪"]);
  expect(summary.location[2]).toEqual(["地址", "桃園市龜山區文化二路"]);
  expect(summary.location[4]).toEqual(["車位編號", "未提供"]);
  expect(JSON.stringify(summary)).not.toContain("內部備註");
});

test("summary includes a saved parking space number, or an explicitly labelled legacy number", () => {
  expect(buildPropertySummary({ parkingNumber: "B2-123、B2-124", parkingDescription: "坡道平面" }).location[4])
    .toEqual(["車位編號", "B2-123、B2-124"]);
  expect(buildPropertySummary({ parkingDescription: "坡道平面，車位編號：B3-45" }).location[4])
    .toEqual(["車位編號", "B3-45"]);
  expect(buildPropertySummary({ parkingDescription: "1個坡道式平面車位 編號B1-5" }).location[4])
    .toEqual(["車位編號", "B1-5"]);
  expect(buildPropertySummary({ parkingDescription: "1個坡道平面車位" }).location[4])
    .toEqual(["車位編號", "未提供"]);
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
