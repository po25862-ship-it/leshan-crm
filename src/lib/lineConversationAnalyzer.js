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

const SELLER_SIGNAL_RULES = [
  { label: "願意安排到府估價／現勘", weight: 20, pattern: /到府|現勘|來看房子|過來看|約.*(?:估價|看屋況)|安排.*(?:估價|現勘)/ },
  { label: "主動詢問行情或估價", weight: 11, pattern: /行情|估價|可以賣多少|值多少|附近成交|實價登錄/ },
  { label: "提供地址、權狀或物件資料", weight: 18, pattern: /權狀|謄本|地址是|門牌|建物坪數|土地坪數|照片.*(?:傳|給)|資料.*(?:傳|給)/ },
  { label: "透露開價或可售底價", weight: 15, pattern: /開價|售價|希望賣|想賣|底價|最低.*(?:萬|元)|低於.*不賣/ },
  { label: "討論委託方式或期間", weight: 22, pattern: /委託|專任|一般約|契約|服務費|仲介費|簽約/ },
  { label: "出售時程明確", weight: 12, pattern: /急售|急著賣|盡快賣|(?:這|下|本)(?:週|月)|月底前|年前.*賣|三個月內|半年內/ },
];

const SELLER_OBJECTION_RULES = [
  { label: "對仲介費／服務費有疑慮", pattern: /仲介費.*(?:太高|貴|不想付)|服務費.*(?:太高|貴|不想付)|不付仲介費/ },
  { label: "價格期待可能高於市場", pattern: /低於.*不賣|一定要賣到|行情太低|不接受議價|價格不能談/ },
  { label: "不願簽專任委託", pattern: /不要專任|不簽專任|只簽一般|不想被綁|多家仲介/ },
  { label: "目前沒有急售壓力", pattern: /不急|慢慢賣|賣不到就算了|先試試看/ },
  { label: "需共有人／家人同意", pattern: /共有人|兄弟姊妹|家人.*(?:同意|討論)|問.*(?:先生|太太|爸媽)|繼承人/ },
  { label: "稅費／貸款餘額疑慮", pattern: /房地合一|增值稅|稅費|貸款還有|貸款餘額|設定抵押/ },
  { label: "已有其他仲介接洽", pattern: /其他仲介|已經有仲介|別家仲介|有簽委託/ },
];

const TEAM_REQUEST_RULES = [
  ["客戶跟進", /客戶|買方|屋主|聯絡|回覆|追蹤|帶看/],
  ["物件資料", /物件|案件|照片|地址|開價|底價|權狀|上架|下架/],
  ["系統／權限", /系統|登入|權限|帳號|CRM|功能|錯誤|當機|打不開/],
  ["流程改善", /流程|表單|欄位|規則|改善|簡化|自動|重複輸入/],
  ["行銷素材", /廣告|文案|貼文|社群|LINE分享|影片|海報/],
  ["排班／人力", /排班|請假|代班|人手|支援|協助|分工/],
  ["教育訓練", /教學|不會用|怎麼用|訓練|示範|操作/],
];

const TEAM_BLOCKER_RULES = [
  ["缺少資料或資訊", /缺資料|資料不齊|沒有資料|資訊不足|找不到資料/],
  ["權限或帳號受阻", /沒權限|沒有權限|權限不足|無法登入|帳號.*(?:問題|不能)/],
  ["系統錯誤或操作受阻", /錯誤|當機|打不開|不能用|無法.*(?:新增|修改|儲存|上傳|開啟)/],
  ["時間或人力不足", /來不及|沒時間|人手不足|忙不過來|需要支援/],
  ["等待他人回覆／決策", /等.*回覆|等.*確認|還沒決定|主管確認|需要同意/],
  ["責任分工不明", /不知道找誰|誰負責|分工不清|沒人處理/],
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

function priceAfterLabel(text, labels) {
  const labelPattern = labels.join("|");
  const match = text.match(new RegExp(`(?:${labelPattern})[^\\d]{0,8}([\\d,]+(?:\\.\\d+)?)\\s*萬`));
  return match ? fieldValue(numberValue(match[1])) : "";
}

export function analyzeSellerConversation(messages, participant = "") {
  const selected = participant ? messages.filter((message) => message.sender === participant) : messages;
  const text = normalizeRegionText(selected.map((message) => message.text).join("\n"));
  const askingPrice = priceAfterLabel(text, ["開價", "售價", "希望賣", "想賣", "預計賣"]);
  const floorPrice = priceAfterLabel(text, ["底價", "最低", "至少要"]);
  const addressMatch = text.match(/([台臺][北中南東]市|新北市|桃園市|高雄市|新竹[市縣]|苗栗縣|彰化縣|南投縣|雲林縣|嘉義[市縣]|屏東縣|宜蘭縣|花蓮縣|基隆市)?[^，。\n]{0,18}(?:路|街|大道)[^，。\n]{0,12}(?:號)?/);
  const propertyAddress = (addressMatch?.[0] || "").trim();
  const categoryEntry = Object.entries(TYPE_KEYWORDS).find(([, keywords]) => keywords.some((keyword) => text.includes(keyword)));
  const motivationRules = [
    ["換屋", /換屋|買大換小|買小換大/], ["繼承處分", /繼承|遺產/], ["資金需求", /資金|週轉|缺錢|現金需求/],
    ["移居／搬遷", /移民|搬家|搬遷|調職|回鄉/], ["投資退場", /投資退場|獲利了結|不想收租|租客/], ["離婚／分產", /離婚|分產/],
  ];
  const motivations = motivationRules.filter(([, pattern]) => pattern.test(text)).map(([label]) => label);
  const timeline = /急售|急著賣|盡快賣/.test(text) ? "急售" : /三個月內|3個月內/.test(text) ? "3 個月內" : /半年內|6個月內/.test(text) ? "半年內" : /不急|慢慢賣/.test(text) ? "不急" : "未確認";
  const agreementPreference = /不要專任|不簽專任|只簽一般|一般委託/.test(text) ? "一般委託" : /專任/.test(text) ? "專任委託" : "未確認";
  const occupancy = /空屋|沒人住/.test(text) ? "空屋" : /出租|租客/.test(text) ? "出租中" : /自住|自己住|屋主住/.test(text) ? "自住中" : "未確認";
  const signals = SELLER_SIGNAL_RULES.filter((rule) => rule.pattern.test(text)).map((rule) => rule.label);
  const objections = SELLER_OBJECTION_RULES.filter((rule) => rule.pattern.test(text)).map((rule) => rule.label);
  const negative = /不賣了|暫時不賣|先不考慮賣|已經賣掉/.test(text);
  const detailScore = [askingPrice, floorPrice, propertyAddress, categoryEntry, motivations.length, timeline !== "未確認"].filter(Boolean).length * 3;
  const signalScore = SELLER_SIGNAL_RULES.filter((rule) => rule.pattern.test(text)).reduce((total, rule) => total + rule.weight, 0);
  const recentText = selected.slice(-5).map((message) => message.text).join(" ");
  const recentBonus = /現勘|到府|權狀|委託|簽約/.test(recentText) ? 8 : 0;
  const score = Math.max(5, Math.min(100, 24 + detailScore + signalScore + recentBonus - objections.length * 3 - (negative ? 45 : 0)));
  const intentLevel = score >= 75 ? "高" : score >= 50 ? "中" : "低";

  let nextStep = "先確認出售原因、期待價格、時間與產權狀況，再安排免費行情評估。";
  if (negative) nextStep = "先停止委託推進，記錄暫緩原因並確認適合再次聯絡的時間。";
  else if (signals.includes("討論委託方式或期間")) nextStep = "帶上行情比較與服務計畫，確認委託方式、開價及簽約時間。";
  else if (signals.includes("願意安排到府估價／現勘")) nextStep = "今天內敲定現勘時間，請屋主準備權狀並確認所有決策者能參與。";
  else if (objections.includes("價格期待可能高於市場")) nextStep = "準備同社區成交與在售競品，先對齊可成交價格區間與試售策略。";
  else if (objections.includes("對仲介費／服務費有疑慮")) nextStep = "用具體銷售計畫說明服務價值，再確認屋主可接受的委託條件。";
  else if (score >= 50) nextStep = "24 小時內提供初步行情範圍，邀請屋主安排到府現勘。";

  const summaryParts = [
    motivations.length ? `動機：${motivations.join("、")}` : "",
    askingPrice ? `開價：${askingPrice} 萬` : "",
    floorPrice ? `底價：${floorPrice} 萬` : "",
    timeline !== "未確認" ? `時程：${timeline}` : "",
    agreementPreference !== "未確認" ? `委託：${agreementPreference}` : "",
    occupancy !== "未確認" ? `使用：${occupancy}` : "",
  ].filter(Boolean);

  return {
    analysisType: "seller",
    participant,
    messageCount: selected.length,
    totalMessageCount: messages.length,
    score,
    intentLevel,
    signals,
    objections,
    nextStep,
    motivations,
    timeline,
    agreementPreference,
    occupancy,
    summary: summaryParts.join("｜") || "尚未抽取到明確售屋狀況，建議先補問動機、價格與時程。",
    listing: {
      title: propertyAddress || `${participant || "LINE 屋主"}・售屋追蹤`,
      propertyId: null,
      category: categoryEntry?.[0] || "公寓",
      store: "捷運樂善直營店",
      propertyUrl: "",
      propertyAddress,
      price: askingPrice,
      status: negative ? "expired" : "tracking",
      listingNo: "",
      agreementType: agreementPreference === "專任委託" ? "專任" : "一般",
      agreementStartDate: "",
      agreementEndDate: "",
      agreementEndSyncToCalendar: false,
      agreementEndGoogleEventId: null,
      agreementEndGoogleEventLink: null,
      askingPrice,
      floorPrice,
      adPlatforms: [],
      documents: [],
      sharedWith: [],
    },
  };
}

export function sellerAnalysisNotes(result) {
  return [
    `【LINE 屋主分析】委售意願 ${result.score} 分（${result.intentLevel}）`,
    result.summary,
    result.signals.length ? `委託訊號：${result.signals.join("、")}` : "委託訊號：尚未偵測到明確訊號",
    result.objections.length ? `主要異議：${result.objections.join("、")}` : "主要異議：尚未偵測到明確異議",
    `建議下一步：${result.nextStep}`,
  ].join("\n");
}

export function analyzeTeamConversation(messages, participant = "") {
  const selected = participant ? messages.filter((message) => message.sender === participant) : messages;
  const text = normalizeRegionText(selected.map((message) => message.text).join("\n"));
  const requestTypes = TEAM_REQUEST_RULES.filter(([, pattern]) => pattern.test(text)).map(([label]) => label);
  const blockers = TEAM_BLOCKER_RULES.filter(([, pattern]) => pattern.test(text)).map(([label]) => label);
  const requestSentences = unique(selected.flatMap((message) => message.text.split(/[。！？!?\n]/))
    .map((sentence) => sentence.trim())
    .filter((sentence) => sentence && /請|需要|希望|能不能|可不可以|麻煩|建議|想要|協助|幫忙/.test(sentence)))
    .slice(0, 6);
  const deadlineMatches = unique(text.match(/(?:今天|明天|後天|本週|這週|下週|月底前|[一二三四五六日天]前|\d{1,2}[/-]\d{1,2}(?:前)?|\d{1,2}月\d{1,2}日(?:前)?)/g) || []);
  const urgent = /緊急|很急|急件|馬上|立刻|今天.*(?:要|前)|盡快|來不及/.test(text);
  const repeated = /一直|常常|每次|又|反覆|重複/.test(text);
  const priorityScore = Math.max(10, Math.min(100, 24 + requestTypes.length * 7 + blockers.length * 8 + requestSentences.length * 5 + deadlineMatches.length * 7 + (urgent ? 22 : 0) + (repeated ? 8 : 0)));
  const intentLevel = priorityScore >= 75 ? "高" : priorityScore >= 50 ? "中" : "低";
  const signals = [
    ...requestTypes.map((type) => `訴求類型：${type}`),
    ...(requestSentences.length ? ["已有明確行動請求"] : []),
    ...(deadlineMatches.length ? [`提到時限：${deadlineMatches.join("、")}`] : []),
    ...(urgent ? ["語句顯示需要優先處理"] : []),
  ];

  let nextStep = "先向提出者確認期望結果、影響範圍與完成標準，再指定負責人。";
  if (blockers.includes("權限或帳號受阻") || blockers.includes("系統錯誤或操作受阻")) nextStep = "先收集畫面、帳號、發生時間與重現步驟，指定一人處理並回報預計完成時間。";
  else if (urgent && deadlineMatches.length) nextStep = `立即確認負責人與最小可交付結果，依「${deadlineMatches[0]}」回推處理節點。`;
  else if (blockers.includes("時間或人力不足")) nextStep = "重新排定優先順序，明確決定要增援、延後或縮小工作範圍。";
  else if (requestSentences.length) nextStep = "把訴求拆成一項可驗收任務，指定負責人與回覆期限後開始追蹤。";

  const headline = requestSentences[0] || requestTypes.map((type) => `${type}需求`).join("、") || "同事訴求待確認";
  const summaryParts = [
    requestTypes.length ? `類型：${requestTypes.join("、")}` : "",
    requestSentences.length ? `訴求：${requestSentences.join("；")}` : "",
    blockers.length ? `阻礙：${blockers.join("、")}` : "",
    deadlineMatches.length ? `時限：${deadlineMatches.join("、")}` : "",
  ].filter(Boolean);

  return {
    analysisType: "team",
    participant,
    messageCount: selected.length,
    totalMessageCount: messages.length,
    score: priorityScore,
    intentLevel,
    signals,
    objections: blockers,
    nextStep,
    requestTypes,
    requests: requestSentences,
    blockers,
    deadlines: deadlineMatches,
    summary: summaryParts.join("｜") || "尚未抽取到明確訴求，建議指定發言者或補充對話內容。",
    topic: {
      title: headline.slice(0, 80),
      counterpart: participant || "內部同事",
      statusTag: urgent ? "優先處理" : "進行中",
    },
  };
}

export function teamAnalysisNotes(result) {
  return [
    `【同事訴求分析】優先程度 ${result.score} 分（${result.intentLevel}）`,
    result.summary,
    result.requests.length ? `明確訴求：${result.requests.join("；")}` : "明確訴求：待確認",
    result.blockers.length ? `目前阻礙：${result.blockers.join("、")}` : "目前阻礙：尚未偵測到",
    `建議下一步：${result.nextStep}`,
  ].join("\n");
}
