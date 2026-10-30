import { priceNumber, formatSheetPrice, validPriceMark, visionPriceCandidates } from "./propertySheetPrice";

const hash = "a".repeat(64);
const mark = { schema: 1, page: 0, sourceHash: hash, oldPrice: 1398, rect: { x: 0.1, y: 0.15, width: 0.3, height: 0.07 } };
test("only positive prices are usable, with explicit unavailable text and thousands formatting", () => {
  expect(priceNumber("１,２６８")).toBe(1268);
  expect(formatSheetPrice(1268)).toBe("1,268");
  for (const value of [null, "", 0, -1, "面議", Infinity]) expect(formatSheetPrice(value)).toBe("售價待確認");
});
test("locations must belong to a fingerprinted source and stay inside the page", () => {
  expect(validPriceMark(mark)).toEqual(mark);
  expect(validPriceMark({ ...mark, sourceHash: "" })).toBeNull();
  expect(validPriceMark({ ...mark, oldPrice: 0 })).toBeNull();
  expect(validPriceMark({ ...mark, rect: { ...mark.rect, x: 0.9 } })).toBeNull();
  expect(validPriceMark({ ...mark, rect: { ...mark.rect, width: -0.3 } })).toBeNull();
  expect(validPriceMark({ ...mark, page: 1 })).toBeNull();
});
const line = (text, x, y, width = 0.1, height = 0.02) => ({ text, x, y, width, height, confidence: 1 });
test("sale price extraction distinguishes the actual sale field from a loan amount and registration date", () => {
  const lines = [line("售", 0.05, 0.83), line("價", 0.05, 0.8), line("1398", 0.11, 0.8, 0.19, 0.045), line("萬", 0.32, 0.8, 0.02), line("現有貸款", 0.5, 0.83), line("800萬元", 0.65, 0.8), line("111年05月06日", 0.7, 0.8)];
  expect(visionPriceCandidates(lines).map((c) => c.oldPrice)).toEqual([1398]);
  expect(visionPriceCandidates(lines.filter((l) => !["售", "價"].includes(l.text)))).toEqual([]);
});
test("different prices in one page remain ambiguous rather than selecting the first amount", () => {
  const lines = [line("售價", 0.05, 0.8), line("1398萬", 0.15, 0.8), line("1298萬", 0.3, 0.8)];
  expect(visionPriceCandidates(lines)).toHaveLength(2);
});
