const fs = require("fs");
const path = require("path");
const zlib = require("zlib");
const iconv = require("iconv-lite");
const { decode } = require("html-entities");

const upperVillages = new Set(["大崗里", "大湖里", "大華里", "公西里", "文化里", "長庚里", "樂善里", "文青里", "文桃里", "文樂里", "文藝里", "長樂里", "舊路里"]);
const coverageText = fs.readFileSync(path.join(__dirname, "road-coverage.txt"), "utf8");
const sections = coverageText.split(/^([一二三四]、[^\n]+)$/m);
function section(prefix) {
  const index = sections.findIndex((part) => part.startsWith(prefix));
  if (index < 0) throw new Error(`路段清單缺少 ${prefix}`);
  return sections[index + 1].split("\n").filter((line) => line.startsWith("・"))
    .map((line) => line.slice(1).split("｜")[0].trim());
}
const targets = [
  ...[...section("一、"), ...section("二、")].map((road) => ({ district: "林口區", districtCode: "244", road })),
  ...[...section("三、"), ...section("四、")].map((road) => ({ district: "龜山區", districtCode: "333", road })),
];
if (targets.length !== 244 || new Set(targets.map((item) => `${item.districtCode}:${item.road}`)).size !== 244) {
  throw new Error(`路段清單應有 244 筆不重複查詢，目前 ${targets.length} 筆`);
}
const linkou = [...section("一、"), ...section("二、")].sort((a, b) => b.length - a.length);
const guishanOnly = section("三、").sort((a, b) => b.length - a.length);
const guishanMixed = section("四、").sort((a, b) => b.length - a.length);
const doorplates = new Map();
const doorplateData = zlib.gunzipSync(Buffer.from(fs.readFileSync(path.join(__dirname, "mixed-road-doorplates-11509.b64"), "utf8").trim(), "base64")).toString("utf8");
for (const line of doorplateData.trim().split("\n")) {
  const [rawAddress, village] = line.split("\t");
  const address = normalize(rawAddress);
  if (!doorplates.has(address)) doorplates.set(address, new Set());
  doorplates.get(address).add(village);
}

function normalize(value) {
  return String(value || "").normalize("NFKC").replace(/臺/g, "台").replace(/[\s\u00a0]/g, "").trim();
}
function textFromHtml(value) {
  return decode(String(value || "").replace(/<br\s*\/?\s*>/gi, " ").replace(/<[^>]+>/g, " "))
    .replace(/\u00a0/g, " ").replace(/\s+/g, " ").trim();
}
function numberOrNull(value) {
  const text = String(value ?? "").trim();
  if (!text) return null;
  const number = Number(text);
  return Number.isFinite(number) ? number : null;
}
function parseReport(buffer, target) {
  const html = iconv.decode(buffer, "big5");
  if (!html.includes("物件查詢表") || !/class=['"]obj_table['"]/.test(html) || /user_pass1|form_login/i.test(html)) {
    throw new Error(`${target.district}${target.road} 報表無效或登入失效`);
  }
  const rows = [];
  for (const rowHtml of html.match(/<tr\b[\s\S]*?<\/tr>/gi) || []) {
    const cells = [...rowHtml.matchAll(/<td\b[^>]*>([\s\S]*?)<\/td>/gi)].map((match) => match[1]);
    if (cells.length < 15) continue;
    const cell = (index) => textFromHtml(cells[index]);
    const listingNo = cell(1).match(/\b[A-Z]{1,3}\d{7,10}\b/)?.[0];
    if (!listingNo) continue;
    const href = cells[14].match(/href=['"]([^'"]*\/buy\/[^'"]*)['"]/i)?.[1] || "";
    const notes = decode(cells[15]?.match(/<textarea\b[^>]*>([\s\S]*?)<\/textarea>/i)?.[1] || "").trim();
    rows.push({
      listingNo, title: cell(1).replace(listingNo, "").trim(), address: cell(2),
      landPing: numberOrNull(cell(3)), titlePing: numberOrNull(cell(4)),
      floor: cell(5), orientation: cell(6), age: cell(7), layout: cell(8),
      parkingCount: numberOrNull(cell(9)), totalPrice: numberOrNull(cell(10)),
      occupancy: cell(11), laneWidth: cell(12), agentInfo: cell(13),
      websiteUrl: href || `https://www.twhg.com.tw/buy/${listingNo}`,
      websitePublished: Boolean(href), officialViewCount: numberOrNull(cell(14)),
      officialStatusCheckedAt: new Date().toISOString(), notes,
      sourceRoad: target.road, sourceDistrict: target.district,
    });
  }
  return rows;
}

function classifyAddress(rawAddress) {
  const address = normalize(rawAddress);
  const match = address.match(/^(?:新北市林口區|桃園市龜山區)/);
  if (!match) return { accepted: false, reason: "地址不在林口區或龜山區" };
  const district = match[0].endsWith("林口區") ? "林口區" : "龜山區";
  const local = address.slice(match[0].length).replace(/^[^里]{1,8}里/, "");
  if (district === "林口區") {
    const road = linkou.find((name) => local.startsWith(name));
    return road ? { accepted: true, district, road } : { accepted: false, reason: "林口地址不在核對路段／地名清單" };
  }
  const road = guishanOnly.find((name) => local.startsWith(name));
  if (road) return { accepted: true, district, road };
  const mixed = guishanMixed.find((name) => local.startsWith(name));
  if (!mixed) return { accepted: false, reason: "龜山地址不在上龜山路段清單" };
  const house = local.match(/^.+?號/)?.[0] || "";
  const villages = doorplates.get(house);
  if (!villages || villages.size !== 1) return { accepted: false, reason: "跨里道路門牌無法唯一對應上龜山里別" };
  const village = [...villages][0];
  return upperVillages.has(village)
    ? { accepted: true, district, road: mixed, village }
    : { accepted: false, reason: `跨里道路門牌屬${village}` };
}

function detailMetadata(buffer) {
  const lines = decode(iconv.decode(buffer, "big5")
    .replace(/<script[\s\S]*?<\/script>/gi, " ").replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<br\s*\/?\s*>/gi, "\n").replace(/<[^>]+>/g, "\n"))
    .replace(/\u00a0/g, " ").split("\n").map((line) => line.replace(/\s+/g, " ").trim()).filter(Boolean);
  const categoryIndex = lines.findIndex((line) => /^房屋型式[：:]$/.test(line));
  const storeIndex = lines.findIndex((line) => /^店長[：:]$/.test(line));
  return {
    category: categoryIndex >= 0 ? lines[categoryIndex + 1] || "" : "",
    store: storeIndex > 0 ? lines[storeIndex - 1] : "",
  };
}

function formEncodeBig5(value) {
  return [...iconv.encode(value, "big5")].map((byte) => `%${byte.toString(16).toUpperCase().padStart(2, "0")}`).join("");
}

module.exports = { targets, parseReport, classifyAddress, detailMetadata, formEncodeBig5, normalize };
