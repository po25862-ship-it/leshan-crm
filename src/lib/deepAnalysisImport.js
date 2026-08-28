export const DEEP_ANALYSIS_SCHEMA = "leshan-crm.deep-analysis.v1";

const MODES = new Set(["buyer", "seller", "team"]);
const LEVELS = new Set(["高", "中", "低"]);

function text(value, max = 1200) {
  return typeof value === "string" ? value.replace(/\0/g, "").trim().slice(0, max) : "";
}

function list(value, maxItems = 12, maxLength = 240) {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.map((item) => text(item, maxLength)).filter(Boolean))].slice(0, maxItems);
}

function numberText(value) {
  if (value === null || value === undefined || value === "") return "";
  const parsed = Number(String(value).replace(/,/g, ""));
  return Number.isFinite(parsed) ? String(parsed) : "";
}

function score(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.round(Math.max(0, Math.min(100, parsed))) : 0;
}

function evidence(value) {
  if (!Array.isArray(value)) return [];
  return value.slice(0, 10).map((item) => ({
    label: text(item?.label, 80) || "判斷依據",
    text: text(item?.text, 220),
  })).filter((item) => item.text);
}

function deepAnalysis(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const plan = value.actionPlan && typeof value.actionPlan === "object" ? value.actionPlan : {};
  return {
    coreMotivation: text(value.coreMotivation),
    emotionalTrend: text(value.emotionalTrend),
    decisionStage: text(value.decisionStage),
    decisionMakers: list(value.decisionMakers),
    hiddenConcerns: list(value.hiddenConcerns),
    contradictions: list(value.contradictions),
    agentStrengths: list(value.agentStrengths),
    agentMissedOpportunities: list(value.agentMissedOpportunities),
    actionPlan: {
      within24Hours: list(plan.within24Hours),
      within3Days: list(plan.within3Days),
      within7Days: list(plan.within7Days),
    },
  };
}

function buyerNeed(value, participant) {
  const need = value && typeof value === "object" ? value : {};
  const areas = Array.isArray(need.areas) ? need.areas.slice(0, 8).map((area) => ({
    city: text(area?.city, 20), district: text(area?.district, 20), community: text(area?.community, 80),
  })) : [];
  return {
    title: text(need.title, 100) || `${participant || "LINE 客戶"}・深度分析客需`,
    contactId: "", contactName: participant, statusTag: text(need.statusTag, 20) || "正在找",
    areas: areas.length ? areas : [{ city: "", district: "", community: "" }],
    types: list(need.types, 8, 30), purposes: list(need.purposes, 8, 30), motivation: text(need.motivation, 50),
    budgetMin: numberText(need.budgetMin), budgetMax: numberText(need.budgetMax),
    mainAreaMin: numberText(need.mainAreaMin), mainAreaMax: numberText(need.mainAreaMax),
    roomsMin: numberText(need.roomsMin), roomsMax: numberText(need.roomsMax),
    bathMin: numberText(need.bathMin), bathMax: numberText(need.bathMax),
    ageMin: numberText(need.ageMin), ageMax: numberText(need.ageMax),
    floorMin: numberText(need.floorMin), floorMax: numberText(need.floorMax),
    topFloorOnly: Boolean(need.topFloorOnly), criteriaLevels: {}, parkingRequired: Boolean(need.parkingRequired),
    preferredFeatures: text(need.preferredFeatures, 500), excludeGroundFloor: Boolean(need.excludeGroundFloor),
    excludeTopFloor: Boolean(need.excludeTopFloor), excludeMechanicalParking: Boolean(need.excludeMechanicalParking),
    excludedFeatures: text(need.excludedFeatures, 500), shared: false, recommendedProperties: [],
  };
}

function sellerData(value, participant) {
  const seller = value && typeof value === "object" ? value : {};
  const listing = seller.listing && typeof seller.listing === "object" ? seller.listing : {};
  const agreement = text(listing.agreementType, 20);
  return {
    motivations: list(seller.motivations), timeline: text(seller.timeline, 80) || "待確認",
    agreementPreference: text(seller.agreementPreference, 80) || "待確認",
    occupancy: text(seller.occupancy, 80) || "待確認",
    listing: {
      title: text(listing.title, 100) || `${participant || "LINE 屋主"}・售屋追蹤`, propertyId: null,
      category: text(listing.category, 30) || "公寓", store: text(listing.store, 80) || "捷運樂善直營店",
      propertyUrl: "", propertyAddress: text(listing.propertyAddress, 160), price: numberText(listing.askingPrice || listing.price),
      status: ["tracking", "active", "expired"].includes(listing.status) ? listing.status : "tracking",
      listingNo: text(listing.listingNo, 60), agreementType: agreement === "專任" ? "專任" : "一般",
      agreementStartDate: text(listing.agreementStartDate, 20), agreementEndDate: text(listing.agreementEndDate, 20),
      agreementEndSyncToCalendar: false, agreementEndGoogleEventId: null, agreementEndGoogleEventLink: null,
      askingPrice: numberText(listing.askingPrice), floorPrice: numberText(listing.floorPrice),
      adPlatforms: [], documents: [], sharedWith: [],
    },
  };
}

function teamData(value, participant) {
  const team = value && typeof value === "object" ? value : {};
  const topic = team.topic && typeof team.topic === "object" ? team.topic : {};
  return {
    requestTypes: list(team.requestTypes), requests: list(team.requests), blockers: list(team.blockers), deadlines: list(team.deadlines),
    topic: {
      title: text(topic.title, 80) || "同事訴求待確認",
      counterpart: text(topic.counterpart, 80) || participant || "內部同事",
      statusTag: text(topic.statusTag, 30) || "進行中",
    },
  };
}

export function parseDeepAnalysisImport(raw) {
  let value;
  try {
    value = JSON.parse(String(raw || ""));
  } catch {
    throw new Error("這不是有效的 JSON 分析檔，請重新下載後再試一次。");
  }
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("分析檔內容格式不正確。");
  if (value.schema !== DEEP_ANALYSIS_SCHEMA) throw new Error("分析檔版本不相容，請使用 ChatGPT 產生的 CRM 深度分析檔。");
  const analysisType = text(value.analysisType, 20);
  if (!MODES.has(analysisType)) throw new Error("分析對象必須是買方、屋主或同事。");
  const participant = text(value.participant, 100);
  const normalizedScore = score(value.score);
  const result = {
    analysisType,
    participant,
    messageCount: Math.max(0, Math.round(Number(value.messageCount) || 0)),
    totalMessageCount: Math.max(0, Math.round(Number(value.totalMessageCount) || Number(value.messageCount) || 0)),
    score: normalizedScore,
    intentLevel: LEVELS.has(value.intentLevel) ? value.intentLevel : normalizedScore >= 75 ? "高" : normalizedScore >= 50 ? "中" : "低",
    signals: list(value.signals), objections: list(value.objections), nextStep: text(value.nextStep),
    summary: text(value.summary), plainLanguageExplanation: text(value.plainLanguageExplanation, 2400),
    evidence: evidence(value.evidence), missingInformation: list(value.missingInformation),
    recommendedQuestions: list(value.recommendedQuestions), followUpMessage: text(value.followUpMessage, 2000),
    scoreReasons: list(value.scoreReasons), deepAnalysis: deepAnalysis(value.deepAnalysis),
    analysisSource: "chatgpt-import", sourceFileName: text(value.sourceFileName, 180),
  };
  if (!result.summary || !result.nextStep || !result.plainLanguageExplanation) {
    throw new Error("分析檔缺少摘要、下一步或白話說明，請重新產生完整分析檔。");
  }
  if (analysisType === "buyer") Object.assign(result, { need: buyerNeed(value.buyer?.need, participant) });
  if (analysisType === "seller") Object.assign(result, sellerData(value.seller, participant));
  if (analysisType === "team") Object.assign(result, teamData(value.team, participant));
  return result;
}
