const COMMUNITY_NAMES = [
  "遠雄幸福成", "櫻花市鎮之櫻", "興富發鉑悅", "璟都未來城", "遠雄米蘭公園",
  "富御捷境", "遠雄文青", "和境心見", "文華天際", "大亮時代", "大亮泊",
  "金捷市", "新未來2", "新未來3", "欣時代", "大華旭", "禾悅花園",
  "頤昌", "捷市達", "寶佳登峰", "福樺水悅", "水悅", "華亞麗晶",
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

function inferArea(record) {
  const title = compact(record?.title);
  const address = compact(record?.address);
  const text = `${title}${address}`;
  const station = text.match(/A(?:7|8|9|10|18|19|20|21|22)\b/i)?.[0]?.toUpperCase();
  if (station === "A9" || /新北市林口區|林口/.test(text)) return "A9林口生活圈";
  if (station === "A7" || A7_ROADS.some((road) => address.includes(road))) return "A7重劃區";
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
  return {
    communityName: inferCommunityName(record),
    area: decodeEntities(record?.area) || inferArea(record),
  };
}

module.exports = { inferPropertyLocation, inferCommunityName, inferArea, districtArea };
