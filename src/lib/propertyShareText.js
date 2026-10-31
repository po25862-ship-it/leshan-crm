import { truncateAddress } from "./address";
import { buildMapSearchUrl } from "./googleMaps";
import { withAgid } from "./url";
import { nonNegativeNumber, resolvePropertyParkingPrice } from "./propertyUnitPrice";

export const DEFAULT_PROPERTY_SHARE_INTRO = "幫您挑了幾間物件，整理重點給您比較看看：";

const numberText = (value) => value.toLocaleString("zh-TW", { maximumFractionDigits: 2 });

function shareParking(property) {
  const description = String(property.parkingDescription || property.parkingType || "").normalize("NFKC").trim();
  const count = nonNegativeNumber(property.parkingCount);
  const area = nonNegativeNumber(property.parkingPing);
  const hasEvidence = area > 0 || count > 0 || nonNegativeNumber(property.parkingPrice) > 0 || Boolean(property.parkingNumber)
    || (description && !/^(無|無車位|沒有車位|不含車位)$/.test(description));
  const noParking = /^(無|無車位|沒有車位|不含車位)$/.test(description);
  if ((noParking || count === 0) && hasEvidence) return { state: "unknown", contradictory: true };
  if (noParking || count === 0) return { state: "none", area: 0 };

  // Customer-facing estimates require an explicit quantity. Do not infer one
  // space from an identifier, title, or the internal comparison's fallback.
  if (!(count > 0) || !Number.isInteger(count)) return { state: "unknown", area };
  const preset = resolvePropertyParkingPrice({ ...property, parkingPrice: "" });
  if (preset.source !== "preset") return { state: "unknown", area };
  return { state: "included", area, ...preset, ...resolvePropertyParkingPrice(property) };
}

function propertyShareDetails(property) {
  const lines = [];
  const price = nonNegativeNumber(property.totalPrice);
  const totalArea = nonNegativeNumber(property.titlePing);
  const mainArea = nonNegativeNumber(property.mainBuildingPing);
  const parking = shareParking(property);
  const parkingArea = !parking.contradictory && parking.area > 0
    && (!(totalArea > 0) || parking.area < totalArea) ? parking.area : null;
  const calculatedNetArea = totalArea > 0 && parkingArea > 0 ? totalArea - parkingArea : null;
  const netArea = calculatedNetArea > 0 && !(mainArea > calculatedNetArea) ? calculatedNetArea : null;
  const calculatedNetUnit = parking.state === "included" && netArea > 0
    && parking.price > 0 && price > parking.price ? (price - parking.price) / netArea : null;
  const netUnit = Number.isFinite(calculatedNetUnit) ? calculatedNetUnit : null;
  const parkingLabel = parking.state === "none" ? "（無車位）"
    : parking.state === "included" ? `（含${parking.count > 1 ? `${parking.count}個` : ""}${parking.kind}車位）` : "";

  if (price > 0) lines.push(`售價｜${numberText(price)} 萬${parkingLabel}`);
  const areas = [];
  if (mainArea > 0 && (!(totalArea > 0) || mainArea <= totalArea)) areas.push(`主建${numberText(mainArea)}坪`);
  if (netArea > 0) areas.push(`扣車後${numberText(netArea)}坪`);
  else if (totalArea > 0) areas.push(`權狀${numberText(totalArea)}坪`);
  if (areas.length) lines.push(areas.join("｜"));
  const parkingLine = [];
  if (parkingArea > 0) parkingLine.push(`車位${numberText(parkingArea)}坪`);
  if (netUnit !== null) {
    parkingLine.push(`扣車單價約${netUnit.toFixed(2)}萬／坪${parking.source === "entered" ? `（車位總價${numberText(parking.price)}萬試算）` : ""}`);
  } else if (parking.state === "none" && price > 0 && totalArea > 0 && Number.isFinite(price / totalArea)) {
    parkingLine.push(`單價約${(price / totalArea).toFixed(2)}萬／坪`);
  }
  if (parkingLine.length) lines.push(parkingLine.join("｜"));
  return { lines, parking, hasNetArea: netArea > 0, hasNetUnit: netUnit !== null };
}

function shareableMapAddress(address) {
  const roadAddress = truncateAddress(String(address || "").trim()).trim();
  return /路|街|大道/.test(roadAddress) ? roadAddress : "";
}

function publicPropertyAddress(address) {
  const road = shareableMapAddress(address);
  if (road) return road;
  return String(address || "").match(/^.*?[縣市].*?[區鄉鎮市]/)?.[0] || "";
}

export function buildPropertyShareText(properties, intro, agid, includeMaps = true) {
  const details = properties.map(propertyShareDetails);
  const presets = [...new Set(details.filter((detail) => detail.hasNetUnit && detail.parking.source === "preset")
    .map(({ parking }) => `${parking.kind}車位每個${parking.perSpace}萬`))];
  const notes = [];
  if (presets.length) notes.push(`扣車單價採${presets.join("、")}預設試算，非實際分列車價`);
  if (details.some((detail) => detail.hasNetArea)) notes.push("扣車後面積仍包含附屬建物與公設");
  return [
    intro,
    "",
    ...properties.flatMap((property, index) => {
      const publicAddress = publicPropertyAddress(property.address);
      const location = [...new Set([property.communityName, property.area, publicAddress].filter(Boolean))]
        .join("・");
      const lines = [`${index + 1}. ${property.title || "物件"}`, ...details[index].lines];
      if (location) lines.push(location);
      if (property.websiteUrl) lines.push(withAgid(property.websiteUrl, agid));
      if (includeMaps) {
        const mapAddress = shareableMapAddress(property.address);
        lines.push(mapAddress ? `📍位置（路段參考）：${buildMapSearchUrl(mapAddress)}` : "📍位置：地址待確認");
      }
      return [...lines, ""];
    }),
    ...(notes.length ? [`※${notes.join("；")}。`, ""] : []),
    ...(properties.length ? ["有想了解的物件，回覆編號就可以。"] : []),
  ].join("\n").trim();
}
