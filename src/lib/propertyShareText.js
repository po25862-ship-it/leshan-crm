import { truncateAddress } from "./address";
import { buildMapSearchUrl } from "./googleMaps";
import { withAgid } from "./url";

function shareableMapAddress(address) {
  const roadAddress = truncateAddress(String(address || "").trim()).trim();
  return /路|街|大道/.test(roadAddress) ? roadAddress : "";
}

export function buildPropertyShareText(properties, intro, agid, includeMaps = true) {
  return [
    intro,
    "",
    ...properties.flatMap((property, index) => {
      const publicAddress = truncateAddress(property.address);
      const description = [property.title, property.communityName, property.area, publicAddress,
        property.totalPrice ? `${property.totalPrice}萬` : ""]
        .filter(Boolean)
        .join("・");
      const lines = [`${index + 1}. ${description}`];
      if (property.websiteUrl) lines.push(withAgid(property.websiteUrl, agid));
      if (includeMaps) {
        const mapAddress = shareableMapAddress(property.address);
        lines.push(mapAddress ? `📍位置（路段參考）：${buildMapSearchUrl(mapAddress)}` : "📍位置：地址待確認");
      }
      return [...lines, ""];
    }),
  ].join("\n").trim();
}
