import { TAIWAN_CITIES, TAIWAN_REGIONS, normalizeRegionText } from "./taiwanRegions";

const TYPE_KEYWORDS = {
  大樓: ["大樓", "電梯大樓", "華廈"],
  公寓: ["公寓", "無電梯"],
  透天: ["透天", "別墅", "透天厝"],
  土地: ["土地", "建地", "農地"],
  廠房: ["廠房", "廠辦", "工廠"],
  車位: ["車位"],
};

const SIGNAL_RULES = [
  { label: "主動詢問看屋／約時間", weight: 18, pattern: /看屋|帶看|約(?:時間|看)|什麼時候.*看|安排.*看/ },
  { label: "出價或議價意願", weight: 22, pattern: /出價|要約|議價|談價|斡旋|可以談|底價/ },
  { label: "討論貸款或付款", weight: 13, pattern: /貸款|房貸|成數|頭期|自備款|付款/ },
  { label: "有明確購買時程", weight: 12, pattern: /(?:這|下|本)(?:週|月)|月底前|年前|近期|盡快|急著|馬上.*買/ },
  { label: "決策者參與", weight: 9, pattern: /家人|爸媽|先生|太太|老婆|老公|長輩.*(?:看|討論)|再看一次/ },
  { label: "索取物件細節", weight: 7, pattern: /地址|格局|坪數|管理費|屋齡|車位|權狀|實價|照片|影片/ },
];

const OBJECTION_RULES = [
  { label: "價格／預算疑慮", pattern: /太貴|價格高|超出預算|預算不夠|便宜一點|價錢.*(?:高|貴)/ },
  { label: "貸款／頭期疑慮", pattern: /貸不到|貸款.*(?:擔心|問題)|頭期.*(?:不夠|壓力)|自備款.*(?:不夠|壓力)/ },
  { label: "屋況／屋齡疑慮", pattern: /屋況|漏水|壁癌|屋齡.*(?:高|老)|要整理|裝潢.*(?:舊|差)/ },
  { label: "地點／交通疑慮", pattern: /太遠|交通不便|離.*遠|地點不喜歡|通勤.*久/ },
  { label: "樓層／格局疑慮", pattern: /樓層.*(?:不喜歡|太高|太低)|格局.*(?:不喜歡|不好)|不方正|採光不好/ },
  { label: "仍需與家人討論", pattern: /考慮一下|再想想|跟家人討論|問(?:先生|太太|爸媽|家人)|還沒決定/ },
  { label: "仲介費／交易成本疑慮", pattern: /仲介費|服務費|稅費|交易成本/ },
];

const FEATURE_KEYWORDS = ["電梯", "採光", "邊間", "景觀", "學區", "捷運", "公園", "管理", "垃圾集中", "陽台", "雙車位", "平面車位", "可養寵物"];

const DATE_LINE = /^\s*(?:\d{4}[./-])?\d{1,2}[./-]\d{1,2}(?:\s*\([^)]*\)|\s*[（(][^）)]*[）)])?\s*$/;
const MESSAGE_LINE = /^\s*(\d{1,2}:\d{2})(?:\s*[AP]M)?\s*[\t ]+([^\t]+?)[\t ]+(.+)$/i;
const SYSTEM_LINE = /^\s*(\d{1,2}:\d{2})(?:\s*[AP]M)?\s*[\t ]+(.+)$/i;

function unique(values) {
  return [...new Set(values.filter(Boolean))];
}

function numberValue(raw) {
  if (!raw) return null;
  const value = Number(String(raw).replace(/,/g, ""));
  return Number.isFinite(value) ? value : null;
}

function firstRange(text, unitPattern) {
  const range = text.match(new RegExp(`([\\d,]+(?:\\.\\d+)?)\\s*(?:-|~|～|到|至)\\s*([\\d,]+(?:\\.\\d+)?)\\s*${unitPattern}`));
  if (range) return { min: numberValue(range[1]), max: numberValue(range[2]) };
  const max = text.match(new RegExp(`([\\d,]+(?:\\.\\d+)?)\\s*${unitPattern}\\s*(?:內|以下|以內|左右)`));
  if (max) return { min: null, max: numberValue(max[1]) };
  const min = text.match(new RegExp(`([\\d,]+(?:\\.\\d+)?)\\s*${unitPattern}\\s*(?:以上|起)`));
  if (min) return { min: numberValue(min[1]), max: null };
  const prefixedMin = text.match(new RegExp(`(?:至少|最少|起碼)\\s*([\\d,]+(?:\\.\\d+)?)\\s*${unitPattern}`));
  if (prefixedMin) return { min: numberValue(prefixedMin[1]), max: null };
  const exact = text.match(new RegExp(`([\\d,]+(?:\\.\\d+)?)\\s*${unitPattern}`));
  if (exact) return { min: numberValue(exact[1]), max: numberValue(exact[1]) };
  return { min: null, max: null };
}

function fieldValue(value) {
  return value === null || value === undefined ? "" : String(value);
}

export function parseLineChat(text) {
  const normalized = String(text || "").replace(/^\uFEFF/, "").replace(/\r\n?/g, "\n");
  const messages = [];
  let currentDate = "";
  let lastMessage = null;

  normalized.split("\n").forEach((rawLine) => {
    const line = rawLine.trimEnd();
    if (!line.trim()) return;
    if (DATE_LINE.test(line)) {
      currentDate = line.trim();
      lastMessage = null;
      return;
    }
    const match = line.match(MESSAGE_LINE);
    if (match) {
      lastMessage = { date: currentDate, time: match[1], sender: match[2].trim(), text: match[3].trim() };
      messages.push(lastMessage);
      return;
    }
    if (SYSTEM_LINE.test(line) || /^\[LINE\]|^儲存日期|^聊天記錄/.test(line.trim())) {
      lastMessage = null;
      return;
    }
    if (lastMessage) lastMessage.text += `\n${line.trim()}`;
  });

  return { messages, participants: unique(messages.map((message) => message.sender)) };
}

export function analyzeLineConversation(messages, participant = "") {
  const selected = participant ? messages.filter((message) => message.sender === participant) : messages;
  const text = normalizeRegionText(selected.map((message) => message.text).join("\n"));
  const allText = normalizeRegionText(messages.map((message) => message.text).join("\n"));

  const areas = [];
  const districtOwners = {};
  const shortDistrictOwners = {};
  TAIWAN_CITIES.forEach((city) => TAIWAN_REGIONS[city].forEach((district) => {
    districtOwners[district] = [...(districtOwners[district] || []), city];
    const shortName = district.replace(/[區市鎮鄉]$/, "");
    shortDistrictOwners[shortName] = [...(shortDistrictOwners[shortName] || []), { city, district }];
  }));
  TAIWAN_CITIES.forEach((city) => {
    const cityMentioned = text.includes(city);
    const districts = TAIWAN_REGIONS[city].filter((district) => {
      if (!text.includes(district)) return false;
      if ((districtOwners[district] || []).length === 1) return true;
      return text.includes(`${city}${district}`) || new RegExp(`${city}.{0,6}${district}`).test(text);
    });
    if (cityMentioned || districts.length) {
      if (districts.length) districts.forEach((district) => areas.push({ city, district, community: "" }));
      else areas.push({ city, district: "", community: "" });
    }
  });

  // LINE 對話常只寫「板橋／竹北」而省略行政區後綴。
  Object.entries(shortDistrictOwners).forEach(([shortName, owners]) => {
    if (shortName.length < 2 || owners.length !== 1 || !text.includes(shortName)) return;
    const { city, district } = owners[0];
    if (!areas.some((area) => area.city === city && area.district === district)) areas.push({ city, district, community: "" });
  });

  const budget = firstRange(text, "萬(?:元)?");
  const areaRange = firstRange(text, "坪");
  const rooms = firstRange(text, "房(?:間)?");
  const baths = firstRange(text, "衛(?:浴)?");
  const types = Object.entries(TYPE_KEYWORDS).filter(([, keywords]) => keywords.some((keyword) => text.includes(keyword))).map(([type]) => type);
  const preferredFeatures = FEATURE_KEYWORDS.filter((keyword) => text.includes(keyword));
  const parkingRequired = /(?:要|需要|一定要|希望有|至少.*個).*車位|車位.*(?:必要|一定要)|(?:平面|機械|坡道平面)車位/.test(text);
  const purposes = unique([/自住|住宅/.test(text) ? "住宅" : "", /辦公/.test(text) ? "辦公" : "", /店面/.test(text) ? "店面" : ""]);
  const motivation = /投資|收租/.test(text) ? "投資" : /自住|自用/.test(text) ? "自用" : "";

  const signals = SIGNAL_RULES.filter((rule) => rule.pattern.test(text)).map((rule) => rule.label);
  const objections = OBJECTION_RULES.filter((rule) => rule.pattern.test(text)).map((rule) => rule.label);
  const negative = /不考慮|不用了|先不要|暫時不買|已經買了|已成交/.test(text);
  const detailScore = [areas.length, types.length, budget.min !== null || budget.max !== null, rooms.min !== null || rooms.max !== null, areaRange.min !== null || areaRange.max !== null, parkingRequired].filter(Boolean).length * 3;
  const signalScore = SIGNAL_RULES.filter((rule) => rule.pattern.test(text)).reduce((total, rule) => total + rule.weight, 0);
  const recentText = selected.slice(-5).map((message) => message.text).join(" ");
  const recentBonus = /看屋|帶看|出價|斡旋|貸款|約時間/.test(recentText) ? 8 : 0;
  const score = Math.max(5, Math.min(100, 28 + detailScore + signalScore + recentBonus - objections.length * 3 - (negative ? 45 : 0)));
  const intentLevel = score >= 75 ? "高" : score >= 50 ? "中" : "低";

  let nextStep = "先確認預算、區域、房型與購買時程，再補齊客需條件。";
  if (negative) nextStep = "先暫緩推案，確認拒絕主因與適合再次聯絡的時間。";
  else if (signals.includes("出價或議價意願")) nextStep = "整理實價登錄與屋主可談空間，盡快確認出價金額並安排斡旋。";
  else if (signals.includes("主動詢問看屋／約時間")) nextStep = "今天內提供 3–5 間高配對物件，提出兩個明確時段完成帶看邀約。";
  else if (objections.includes("價格／預算疑慮")) nextStep = "提供預算內替代案與近期成交行情，確認可接受的最高總價。";
  else if (objections.includes("貸款／頭期疑慮")) nextStep = "先試算貸款成數、月付與自備款，再依可負擔總價重新配對。";
  else if (score >= 50) nextStep = "在 24 小時內傳送 3–5 間相符物件，並用一個問題確認最優先條件。";

  const need = {
    title: `${participant || "LINE 客戶"}・對話分析客需`,
    contactId: "",
    contactName: participant || "",
    statusTag: negative ? "暫緩" : "正在找",
    areas: areas.length ? areas.slice(0, 8) : [{ city: "", district: "", community: "" }],
    types,
    purposes,
    motivation,
    budgetMin: fieldValue(budget.min),
    budgetMax: fieldValue(budget.max),
    mainAreaMin: fieldValue(areaRange.min),
    mainAreaMax: fieldValue(areaRange.max),
    roomsMin: fieldValue(rooms.min),
    roomsMax: fieldValue(rooms.max),
    bathMin: fieldValue(baths.min),
    bathMax: fieldValue(baths.max),
    ageMin: "",
    ageMax: "",
    floorMin: "",
    floorMax: "",
    topFloorOnly: false,
    criteriaLevels: {},
    parkingRequired,
    preferredFeatures: preferredFeatures.join("、"),
    excludeGroundFloor: /不要一樓|不考慮一樓|排除一樓/.test(text),
    excludeTopFloor: /不要頂樓|不考慮頂樓|排除頂樓/.test(text),
    excludeMechanicalParking: /不要機械車位|不考慮機械車位/.test(text),
    excludedFeatures: "",
    shared: false,
    recommendedProperties: [],
  };

  const summaryParts = [
    areas.length ? `區域：${areas.slice(0, 4).map((area) => `${area.city}${area.district}`).join("、")}` : "",
    budget.min !== null || budget.max !== null ? `預算：${budget.min ?? ""}${budget.min !== null && budget.max !== null ? "–" : ""}${budget.max ?? ""} 萬` : "",
    types.length ? `房型：${types.join("、")}` : "",
    rooms.min !== null || rooms.max !== null ? `房數：${rooms.min ?? ""}${rooms.min !== null && rooms.max !== null ? "–" : ""}${rooms.max ?? ""} 房` : "",
  ].filter(Boolean);

  return {
    participant,
    messageCount: selected.length,
    totalMessageCount: messages.length,
    score,
    intentLevel,
    signals,
    objections,
    nextStep,
    need,
    summary: summaryParts.join("｜") || "尚未抽取到明確客需，建議先補問關鍵條件。",
    sourcePreview: allText.slice(-600),
  };
}

export function analysisNotes(result) {
  return [
    `【LINE 對話分析】意願 ${result.score} 分（${result.intentLevel}）`,
    result.summary,
    result.signals.length ? `成交訊號：${result.signals.join("、")}` : "成交訊號：尚未偵測到明確訊號",
    result.objections.length ? `主要異議：${result.objections.join("、")}` : "主要異議：尚未偵測到明確異議",
    `建議下一步：${result.nextStep}`,
  ].join("\n");
}
