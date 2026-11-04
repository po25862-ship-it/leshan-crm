const { parseFragment } = require("parse5");

function plain(value, limit = 500) {
  if (typeof value !== "string") return "";
  const root = parseFragment(value.slice(0, 50000));
  function text(node) {
    if (["script", "style", "iframe", "template"].includes(node.nodeName)) return "";
    if (node.nodeName === "#text") return node.value;
    if (node.nodeName === "br") return "\n";
    const children = (node.childNodes || []).map(text).join("");
    return /^(p|div|h[1-6]|li|ul|ol)$/.test(node.nodeName) ? `${children}\n` : children;
  }
  return text(root).normalize("NFKC").replace(/[\t \u00a0]+/g, " ").replace(/ *\n */g, "\n").replace(/\n{3,}/g, "\n\n").trim().slice(0, limit);
}
const rows = value => Array.isArray(value) ? value.slice(0, 100) : [];
function number(value) {
  const text = typeof value === "number" ? String(value) : plain(value).replace(/,/g, "");
  return /^\d+(?:\.\d+)?$/.test(text) && Number(text) <= 100000000 ? Number(text) : undefined;
}
function months(value) {
  const text = plain(value).replace(/租金$/, "").trim();
  if (text === "半個月" || text === "半月") return .5;
  const match = text.match(/^([0-9]+(?:\.5)?|[零一二兩三四五六七八九十])(?:個)?月$/);
  if (!match) return undefined;
  return number(match[1]) ?? ({ 零: 0, 一: 1, 二: 2, 兩: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9, 十: 10 })[match[1]];
}
function rentalListingFields(ctx) {
  const fields = {};
  const put = (key, value, limit) => { const clean = plain(value, limit); if (clean) fields[key] = clean; };
  const putNumber = (key, value) => { const n = number(value); if (n !== undefined) fields[key] = n; };
  const info = key => rows(ctx.info).find(item => item?.key === key);
  const detail = key => plain(rows(ctx.infoData?.data).find(item => item?.key === key)?.value);
  const cost = key => plain(rows(ctx.costData?.data).find(item => item?.key === key)?.value);
  const condition = label => plain(rows(ctx.service?.descData).find(item => item?.label === label)?.value);
  const breadcrumb = key => plain(rows(ctx.breadcrumb).find(item => item?.query === key)?.name);
  put("title", ctx.title, 120);
  put("community", ctx.positionRound?.communityName, 120);
  const kind = breadcrumb("kind");
  if (["整層住家", "獨立套房", "分租套房", "雅房", "店面", "辦公室", "車位"].includes(kind)) fields.type = kind;
  const city = breadcrumb("region"), district = breadcrumb("section");
  if (/^[\u4e00-\u9fff]{2,4}[市縣]$/.test(city)) fields.city = city;
  if (/^[\u4e00-\u9fff]{1,5}[區市鎮鄉]$/.test(district)) fields.district = district;
  let address = plain(ctx.positionRound?.address, 200);
  if (city && address.startsWith(city)) address = address.slice(city.length);
  if (district && address.startsWith(district)) address = address.slice(district.length);
  const street = address.match(/^(.{1,50}?(?:大道|路|街)(?:[一二三四五六七八九十0-9]+段)?)/)?.[1];
  if (street) fields.street = street;
  // A public street is never expanded into a guessed private door number.
  if (street && /[0-9一二三四五六七八九十百千]+(?:之[0-9]+)?號/.test(address)) fields.doorAddress = `${city}${district}${address}`;
  const areaText = `${plain(ctx.title)} ${plain(ctx.communityInfo?.shop_name)}`;
  const areas = [...new Set([...areaText.matchAll(/\bA([789])(?:站|區|重劃|生活|\b)/gi)].map(match => `A${match[1]}`))];
  if (areas.length === 1) fields.area = areas[0];
  const layout = plain(info("layout")?.value);
  for (const [key, suffix] of [["rooms", "房"], ["living", "廳"], ["baths", "衛"]]) {
    const match = layout.match(new RegExp(`(\\d+(?:\\.\\d+)?)${suffix}`));
    if (match) putNumber(key, match[1]);
  }
  const size = info("area"), sizeText = plain(size?.value);
  const sizeMatch = sizeText.match(/^(\d+(?:\.\d+)?)\s*坪$/);
  if (sizeMatch) {
    putNumber("size", sizeMatch[1]);
    fields.sizeBasis = /使用/.test(plain(size?.name)) ? "591 刊登使用坪數" : "其他，請見介紹";
  }
  put("floor", plain(info("floor")?.value).replace(/F/gi, ""), 40);
  if (!/坪|日|天|週/.test(plain(ctx.priceUnit))) putNumber("rent", ctx.price);
  const deposit = months(ctx.deposit || cost("deposit"));
  if (deposit !== undefined) fields.deposit = deposit;
  const calculation = ctx.rent_calculation_data || {};
  const includes = `${cost("priceContainText")} ${plain(calculation.price_contain_text)}`;
  const management = plain(calculation.manage_fee_text);
  if (/管理費/.test(includes) || /(?:含租金|租金內|已含|包含)/.test(management)) fields.mgmtMode = "已含租金";
  else if (/^(?:無管理費|免管理費)$/.test(management)) fields.mgmtMode = "無管理費";
  else if (number(calculation.manage_fee) > 0 && !/無數據|待確認|不詳/.test(management)) {
    fields.mgmtMode = "另計"; putNumber("mgmt", calculation.manage_fee);
  }
  const facilities = rows(ctx.service?.facility).filter(item => item?.active === 1);
  const parking = detail("carInfo") || plain(facilities.find(item => item.key === "park")?.name);
  if (/坡道平面/.test(parking)) fields.parking = "坡道平面";
  else if (/坡道機械/.test(parking)) fields.parking = "坡道機械";
  else if (/升降機械/.test(parking)) fields.parking = "升降機械";
  else if (/平面/.test(parking)) fields.parking = "平面車位";
  else if (/機械/.test(parking)) fields.parking = "機械車位";
  else if (/^(無|無車位|無汽車位)$/.test(parking)) fields.parking = "無車位";
  if (fields.parking && fields.parking !== "無車位") {
    if (calculation.price_has_carport === true || /車位/.test(includes) || /含租金|租金內|已含/.test(plain(calculation.carport_price_text))) fields.parkMode = "已含租金";
    else if (number(calculation.carport_price) > 0) { fields.parkMode = "另計"; putNumber("parkFee", calculation.carport_price); }
  }
  const term = condition("最短租期"), leaseMonths = months(term);
  if (["一年", "兩年", "半年", "可談"].includes(term)) fields.minLease = term;
  else if ([6, 12, 24].includes(leaseMonths)) fields.minLease = ({6:"半年",12:"一年",24:"兩年"})[leaseMonths];
  const moveIn = condition("可遷入日");
  if (/隨時|隨即/.test(moveIn)) fields.moveIn = "隨時入住";
  const pets = condition("養寵物"), cook = condition("開伙");
  if (["可養寵物", "不可養寵物", "寵物可談"].includes(pets)) fields.pets = pets;
  if (["可開伙", "不可開伙"].includes(cook)) fields.cook = cook;
  if (/可申請租金補貼/.test(cost("rentPrice")) || /租金補貼|租屋補助/.test(detail("tags"))) fields.subsidy = "可申請租補";
  put("buyerServiceFee", cost("serviceFee"), 200);
  const equipmentKeys = new Set(["fridge", "washer", "tv", "cold", "heater", "bed", "closet", "fourth", "net", "gas", "sofa", "table_chairs"]);
  const furniture = [...new Set(facilities.filter(item => equipmentKeys.has(item.key)).map(item => plain(item.name, 30)).filter(Boolean))];
  if (furniture.length) fields.furniture = furniture;
  const description = plain(ctx.remark?.content, 3900);
  put("description", [description, moveIn && !fields.moveIn ? `591 刊登入住時間：${moveIn}` : ""].filter(Boolean).join("\n\n"), 4000);
  return fields;
}
module.exports = { rentalListingFields };
