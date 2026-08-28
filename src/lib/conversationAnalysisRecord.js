export function buildConversationAnalysisRecord(result, { mode, sourceFileName, ownerUid, linkedRecord = null, customerStage = "正式" }) {
  return {
    mode,
    customerStage,
    participant: result.participant || "",
    score: result.score || 0,
    intentLevel: result.intentLevel || "低",
    summary: result.summary || "",
    plainLanguageExplanation: result.plainLanguageExplanation || "",
    signals: result.signals || [],
    objections: result.objections || [],
    nextStep: result.nextStep || "",
    scoreReasons: result.scoreReasons || [],
    evidence: result.evidence || [],
    missingInformation: result.missingInformation || [],
    recommendedQuestions: result.recommendedQuestions || [],
    followUpMessage: result.followUpMessage || "",
    deepAnalysis: result.deepAnalysis || null,
    analysisSource: result.analysisSource || "local-rules",
    sourceFileName: sourceFileName || result.sourceFileName || "貼上的對話",
    messageCount: result.messageCount || 0,
    totalMessageCount: result.totalMessageCount || 0,
    linkedRecord,
    modeData: mode === "buyer"
      ? { need: result.need || null }
      : { motivations: result.motivations || [], timeline: result.timeline || "", agreementPreference: result.agreementPreference || "", occupancy: result.occupancy || "", listing: result.listing || null },
    ownerUid,
    lastModifiedByUid: ownerUid,
  };
}
