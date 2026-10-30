import { readLatestPdfProperties } from "./propertyPdfLatest";
jest.mock("../firebase", () => ({ db: {} }));
const snapshot = (data) => ({ exists: () => true, data: () => data });
test("fresh prices and attachments replace the displayed selection without changing its order", async () => {
  const rows = await readLatestPdfProperties([{ id: "a", totalPrice: 1398 }, { id: "b", totalPrice: 2000 }], async (id) => snapshot(id === "a" ? { totalPrice: 1268, sheetFiles: [{ name: "最新.jpg" }] } : { totalPrice: 1888 }));
  expect(rows).toEqual([{ id: "a", totalPrice: 1268, sheetFiles: [{ name: "最新.jpg" }] }, { id: "b", totalPrice: 1888 }]);
});
test("a deleted or unreadable property cannot silently retain its cached price", async () => {
  await expect(readLatestPdfProperties([{ id: "a", title: "已移除物件", totalPrice: 1398 }], async () => ({ exists: () => false }))).rejects.toThrow("已不存在");
  await expect(readLatestPdfProperties([{ id: "a", title: "測試物件", totalPrice: 1398 }], async () => { throw new Error("offline"); })).rejects.toThrow("最新售價");
});
