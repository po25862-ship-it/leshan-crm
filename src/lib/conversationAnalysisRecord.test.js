import { buildConversationAnalysisRecord } from "./conversationAnalysisRecord";

test("keeps the full analysis under a customer", () => {
  const record = buildConversationAnalysisRecord({ score: 86, summary: "摘要", need: { budgetMax: "1500" }, deepAnalysis: { coreMotivation: "自住" } }, { mode: "buyer", ownerUid: "u1", customerStage: "觀察中" });
  expect(record.modeData.need.budgetMax).toBe("1500");
  expect(record.deepAnalysis.coreMotivation).toBe("自住");
  expect(record.customerStage).toBe("觀察中");
});
