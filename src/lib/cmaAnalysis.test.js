import { buildCmaAnalysis } from "./cmaAnalysis";

const target = { id: "t", title: "樂善景觀宅", communityName: "A7 樂善城", area: "龜山區", titlePing: 40, totalPrice: 1600, category: "住宅", layout: "3/2/2" };
const comps = [
  { id: "a", title: "同社區一", communityName: "A7 樂善城", area: "龜山區", titlePing: 38, totalPrice: 1444, category: "住宅", layout: "3/2/2" },
  { id: "b", title: "同社區二", communityName: "A7 樂善城", area: "龜山區", titlePing: 42, totalPrice: 1680, category: "住宅", layout: "3/2/2" },
  { id: "c", title: "附近三", area: "龜山區", titlePing: 40, totalPrice: 1640, category: "住宅", layout: "3/2/2" },
];

test("builds a CMA range from comparable CRM properties", () => {
  const result = buildCmaAnalysis(target, [target, ...comps]);
  expect(result.comparableCount).toBe(3);
  expect(result.medianUnitPrice).toBe(40);
  expect(result.recommendedLow).toBe(1520);
  expect(result.recommendedHigh).toBe(1640);
  expect(result.confidence).toBe("中");
  expect(result.comparables[0].community).toBe("A7 樂善城");
});

test("falls back to a clearly low-confidence asking-price range", () => {
  const result = buildCmaAnalysis(target, [target]);
  expect(result.confidence).toBe("低");
  expect(result.recommendedLow).toBe(1520);
  expect(result.recommendedHigh).toBe(1680);
  expect(result.disclaimer).toContain("並非政府實價登錄");
});
