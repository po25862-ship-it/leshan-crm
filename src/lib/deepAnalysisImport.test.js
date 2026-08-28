import { DEEP_ANALYSIS_SCHEMA, parseDeepAnalysisImport } from "./deepAnalysisImport";

const base = {
  schema: DEEP_ANALYSIS_SCHEMA, analysisType: "seller", participant: "王先生", score: 130,
  summary: "準備簽委託", nextStep: "確認簽約時間", plainLanguageExplanation: "不是單純詢價，已進入簽約前階段。",
  signals: ["願意簽約"], objections: ["仍需家人確認"], scoreReasons: ["已有明確行動"],
  seller: { motivations: ["換屋"], listing: { title: "測試案", askingPrice: "1,268", agreementType: "專任" } },
};

test("imports and normalizes a seller deep analysis", () => {
  const result = parseDeepAnalysisImport(JSON.stringify(base));
  expect(result.score).toBe(100);
  expect(result.intentLevel).toBe("高");
  expect(result.analysisSource).toBe("chatgpt-import");
  expect(result.listing.askingPrice).toBe("1268");
  expect(result.listing.agreementType).toBe("專任");
});

test.each(["not-json", JSON.stringify({ ...base, schema: "wrong" }), JSON.stringify({ ...base, analysisType: "owner" })])("rejects malformed or incompatible imports", (raw) => {
  expect(() => parseDeepAnalysisImport(raw)).toThrow();
});

test("keeps only bounded known fields", () => {
  const result = parseDeepAnalysisImport(JSON.stringify({ ...base, unknown: "ignored", signals: Array(20).fill("訊號"), summary: "a".repeat(3000) }));
  expect(result.unknown).toBeUndefined();
  expect(result.signals).toHaveLength(1);
  expect(result.summary).toHaveLength(1200);
});

test("creates safe buyer and team defaults", () => {
  const buyer = parseDeepAnalysisImport(JSON.stringify({ ...base, analysisType: "buyer", buyer: undefined }));
  const team = parseDeepAnalysisImport(JSON.stringify({ ...base, analysisType: "team", team: undefined }));
  expect(buyer.need.areas).toEqual([{ city: "", district: "", community: "" }]);
  expect(team.topic.statusTag).toBe("進行中");
});
