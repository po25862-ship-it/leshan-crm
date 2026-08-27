const COMMUNITY_NAMES = [
  "遠雄幸福成", "櫻花市鎮之櫻", "興富發鉑悅", "璟都未來城", "遠雄米蘭公園",
  "皇翔歡喜城", "詠勝市中欣", "富宇哈佛苑", "興富發鉑麗", "新潤鉑麗",
  "皇普MVP", "玄泰T1", "新潤翡麗", "豐邑氧森", "大內高手", "根津苑", "鴻廣新A7",
  "新凱悅", "長庚BOSS", "哈佛苑", "名軒", "佳林",
  "富御捷境", "遠雄文青", "和境心見", "文華天際", "大亮時代", "大亮泊",
  "金捷市", "新未來2", "新未來3", "欣時代", "大華旭", "禾悅花園",
  "頤昌璞岳", "頤昌筑岳", "頤昌澄岳", "頤昌", "捷市達", "寶佳登峰", "福樺水悅", "水悅", "華亞麗晶",
  "合遠友文化", "台北樂高", "歡喜樓", "橘園", "捷荷", "巴洛克",
  "城市經典", "遠雄夏沐", "良勳森悅", "安家秀", "君邑羅浮",
  "奇幻莊園", "和發大境", "台北豪景", "四季悅", "和發天鑽",
  "吾家麗", "永漢名人", "RV生活館", "G12摩登", "中悅知音",
  "比佛利加洲區", "比佛利加州區", "鼎藏苑", "新潤麗蒔", "巴賽隆納",
  "豐田大郡", "富堡菁英湛", "晴空大地", "龍躍", "得意人生2",
  "蒙馬特", "三發嵐海", "黃金印象", "菁英賞", "長虹天薈",
  "非常林口", "三井新世界", "東森新世界", "台北新都", "日安台北",
  "春城麗池", "希望之翼", "富堡晶林", "昕樂章", "幸福市",
  "太子苑", "宏錦W one", "宏錦W ONE", "鴻福園", "愛上仁愛",
  "忠孝苑", "美麗莊園", "盛德富", "長耀加", "璽來登日朗",
  "麗園", "全球家年華", "四季春", "富綠旺", "文林清境",
  "康橋薇閣", "捷仕堡", "大亮波波", "i夢想", "Rich", "華麗新貴",
].sort((a, b) => b.length - a.length);

const A7_ROADS = ["文青路", "文桃路", "文學路", "樂善二路", "樂善三路", "樂學路", "樂學三路", "牛角坡路", "華亞三路"];
const A8_ROADS = ["復興一路", "復興北路", "文化二路", "文昌一街", "文昌二街", "文興路", "文東三街", "文東五街"];

// 樂居將 A7 分為五個生活圈。社區對照優先於道路，避免跨區道路誤判。
const A7_LIFE_ZONES = [
  {
    area: "A7站重劃區-體育大學",
    communities: ["皇翔歡喜城", "遠雄文青", "遠雄合宜", "名軒快樂家", "麗寶快樂家", "竹城明治", "竹城宇治", "富宇天匯", "櫻花澍", "和煦隆陞"],
  },
  {
    area: "A7站重劃區-中心商業區",
    communities: ["新潤翡麗", "新潤鉑麗", "文華天際", "欣時代", "華悅城", "華悦城", "大亮時代", "大亮泊", "捷市達", "鴻築捷市達", "金捷市", "鴻築金捷市", "甲子園", "水悅青青", "水悦青青", "富宇悅峰", "合遠友文化", "君邑羅浮", "根津苑"],
  },
  {
    area: "A7站重劃區-文青國小",
    communities: ["富宇哈佛苑", "哈佛苑", "鴻廣新A7", "遠雄新未來2", "遠雄新未來3", "新未來2", "新未來3", "和洲金剛", "詠勝市中欣", "玄泰T1", "智匯學", "富御捷境", "興富發鉑悅", "興富發鉑悦", "維特魯威", "君邑丘比特", "頤昌筑岳"],
  },
  {
    area: "A7站重劃區-郵政物流",
    communities: ["禾悅花園", "富宇上城", "富宇富御", "大頂森木", "頤昌璞岳", "頤昌", "英倫花都", "和境心見"],
  },
  {
    area: "A7站重劃區-樂善國小",
    communities: ["豐邑氧森", "皇普MVP", "大華旭", "奇幻莊園", "和耀恆美", "鴻築鴻典", "玄泰V1", "富宇天玥", "樂捷綻", "台北國際村", "鴻築玥", "頤昌澄岳"],
  },
];

function matchingA7Zone(text) {
  const normalized = compact(text).toLowerCase();
  return A7_LIFE_ZONES
    .flatMap((zone) => zone.communities.map((name) => ({ zone, name })))
    .filter(({ name }) => normalized.includes(compact(name).toLowerCase()))
    .sort((left, right) => right.name.length - left.name.length)[0]?.zone;
}

function decodeEntities(value) {
  return String(value || "")
    .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
    .replace(/&amp;/g, "&")
    .replace(/\uFFFD/g, "")
    .trim();
}

function compact(value) {
  return decodeEntities(value).replace(/[\s｜|【】\[\]]/g, "").trim();
}

function districtArea(address) {
  const normalized = decodeEntities(address).replace(/\s/g, "");
  const county = normalized.match(/^(.{2,4}[縣市])(.{1,5}[區鄉鎮市])/);
  if (county) return `${county[1]}${county[2]}`;
  const cityOnly = normalized.match(/^(.{2,4}市)/);
  return cityOnly?.[1] || "";
}

function streetNumber(address, street) {
  const normalized = decodeEntities(address).replace(/[\s０-９]/g, (character) => {
    if (character === " ") return "";
    const code = character.charCodeAt(0);
    return code >= 0xff10 && code <= 0xff19 ? String(code - 0xff10) : character;
  });
  const match = normalized.match(new RegExp(`${street}(\\d+)號`));
  return match ? Number(match[1]) : null;
}

function inferA7LifeZone(record) {
  const title = compact(record?.title);
  const address = compact(record?.address);
  const community = compact(record?.communityName);
  const text = `${community}${title}${address}`.toLowerCase();
  const confirmedZone = matchingA7Zone(text);
  if (confirmedZone) return confirmedZone.area;

  if (/文青路/.test(address)) return "A7站重劃區-體育大學";
  if (/華亞三路|文化一路/.test(address)) return "A7站重劃區-中心商業區";
  if (/文吉路|牛角坡路|樂善一路/.test(address)) return "A7站重劃區-文青國小";
  if (/文禾路/.test(address)) return "A7站重劃區-郵政物流";
  if (/文達路|長慶一街|長慶二街|樂學一路|樂學三路/.test(address)) return "A7站重劃區-樂善國小";
  if (/樂善三路/.test(address)) return "A7站重劃區-中心商業區";
  if (/樂捷段/.test(address)) return "A7站重劃區-中心商業區";

  const literatureNumber = streetNumber(address, "文學路");
  if (literatureNumber !== null) return literatureNumber >= 200 ? "A7站重劃區-體育大學" : "A7站重劃區-中心商業區";
  const leshanSecondNumber = streetNumber(address, "樂善二路");
  if (leshanSecondNumber !== null) return leshanSecondNumber >= 400 ? "A7站重劃區-文青國小" : "A7站重劃區-中心商業區";
  const lexueNumber = streetNumber(address, "樂學路");
  if (lexueNumber !== null) return lexueNumber >= 500 ? "A7站重劃區-樂善國小" : "A7站重劃區-郵政物流";
  const wentaoNumber = streetNumber(address, "文桃路");
  if (wentaoNumber !== null && ((wentaoNumber >= 330 && wentaoNumber <= 459) || wentaoNumber === 489)) return "A7站重劃區-文青國小";
  return "A7重劃區";
}

function inferArea(record) {
  const title = compact(record?.title);
  const address = compact(record?.address);
  const community = compact(record?.communityName);
  const text = `${community}${title}${address}`;
  const confirmedA7Zone = matchingA7Zone(text);
  if (confirmedA7Zone) return confirmedA7Zone.area;
  const station = text.match(/A(?:7|8|9|10|18|19|20|21|22)\b/i)?.[0]?.toUpperCase();
  if (station === "A9" || /新北市林口區|林口/.test(text)) return "A9林口生活圈";
  if (station === "A7" || A7_ROADS.some((road) => address.includes(road))) return inferA7LifeZone(record);
  if (station === "A8" || A8_ROADS.some((road) => address.includes(road)) || /長庚特區|長庚商業區/.test(text)) return "A8長庚生活圈";
  if (station) return `${station}生活圈`;
  return districtArea(address);
}

function directCommunityFromAddress(address) {
  const value = decodeEntities(address)
    .replace(/[Ａ-Ｚａ-ｚ]/g, (char) => String.fromCharCode(char.charCodeAt(0) - 0xfee0))
    .replace(/\s+[A-Za-zＡ-Ｚａ-ｚ]?\d.*$/i, "")
    .replace(/[A-Za-zＡ-Ｚａ-ｚ]\d+(?:-\d+)?F.*$/i, "")
    .trim();
  if (!value || value.length > 16) return "";
  if (/[縣市區鄉鎮路街巷弄號段地坪]/.test(value)) return "";
  return value;
}

function inferCommunityName(record) {
  const existing = decodeEntities(record?.communityName);
  if (existing) return existing;
  const title = compact(record?.title);
  const address = compact(record?.address);
  const match = COMMUNITY_NAMES.find((name) => title.toLowerCase().includes(compact(name).toLowerCase()) || address.toLowerCase().includes(compact(name).toLowerCase()));
  if (match) return match === "比佛利加洲區" ? "比佛利加州區" : match;
  return directCommunityFromAddress(record?.address);
}

function inferPropertyLocation(record) {
  const existingArea = decodeEntities(record?.area);
  const shouldRefineA7 = existingArea === "A7重劃區";
  return {
    communityName: inferCommunityName(record),
    area: shouldRefineA7 ? inferArea({ ...record, area: "" }) : existingArea || inferArea(record),
  };
}

module.exports = { inferPropertyLocation, inferCommunityName, inferArea, inferA7LifeZone, districtArea };
