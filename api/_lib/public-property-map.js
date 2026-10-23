const { createHash, timingSafeEqual } = require("node:crypto");

const PUBLIC_PROPERTY_FIELDS = Object.freeze([
  "websitePublished", "status", "websiteUrl", "title", "address", "publicAddress", "area",
  "category", "propertyType", "totalPrice", "titlePing", "mainBuildingPing",
  "auxiliaryBuildingPing", "commonAreaPing", "landPing", "layout",
]);
const OFFICIAL_HOSTS = new Set(["www.twhg.com.tw", "twhg.com.tw"]);

function text(value) {
  return typeof value === "string" ? value.trim() : "";
}

function validFeedToken(supplied, expected) {
  if (typeof supplied !== "string" || !supplied || typeof expected !== "string" || !expected) return false;
  // Hash both values to a fixed size so comparison does not branch on token length.
  const digest = (value) => createHash("sha256").update(value, "utf8").digest();
  return timingSafeEqual(digest(supplied), digest(expected));
}

function officialPropertyUrl(value) {
  if (typeof value !== "string") return null;
  try {
    const url = new URL(value.trim());
    if (url.protocol !== "https:" || !OFFICIAL_HOSTS.has(url.hostname) ||
        url.port || url.username || url.password || !/^\/buy\/[A-Za-z0-9]+$/.test(url.pathname)) return null;
    // The saved official listing URL is the source of truth; never infer an ID.
    // Agent IDs and any other saved query/hash data are not part of this feed.
    url.search = "";
    url.hash = "";
    return url.toString();
  } catch {
    return null;
  }
}

function normalizeAddress(value) {
  return text(value).normalize("NFKC").replace(/\s+/g, "")
    .replace(/^\d{3}(?:\d{2,3})?(?=\p{Script=Han})/u, "");
}

function addressParts(value) {
  let rest = normalizeAddress(value);
  let region = "";
  const city = rest.match(/^[\p{Script=Han}]{2,3}[縣市]/u);
  if (city) {
    region += city[0];
    rest = rest.slice(city[0].length);
  }
  // Parse the district first so 路竹區 cannot be mistaken for a street name.
  const district = rest.match(/^[\p{Script=Han}]{1,4}[區鄉鎮市]/u);
  if (district) {
    region += district[0];
    rest = rest.slice(district[0].length);
  }
  return { region, rest };
}

function publicPropertyAddress(property) {
  const source = text(property.publicAddress) || text(property.address);
  const { region, rest } = addressParts(source);
  const fallbackRegion = region || addressParts(property.area).region;
  const fallback = fallbackRegion ? `${fallbackRegion}｜位置待確認` : "位置待確認";
  const road = rest.match(/^([\p{Script=Han}\d]{1,40}?(?:大道|路|街))([東西南北]?[一二三四五六七八九十百\d]+段)?/u);
  if (!road || /[號樓巷弄室段]|地號|地段/.test(road[1])) return fallback;
  // 大路段123地號 is a cadastral segment, not a confirmed road named 大路.
  if (rest.slice(road[0].length).startsWith("段")) return fallback;
  return `${region}${road[0]}`;
}

function nonnegativeNumber(value) {
  if (typeof value !== "number" && typeof value !== "string") return null;
  const raw = typeof value === "string" ? value.trim().replace(/,/g, "") : value;
  if (raw === "" || (typeof raw === "string" && !/^(?:\d+(?:\.\d*)?|\.\d+)$/.test(raw))) return null;
  const result = Number(raw);
  return Number.isFinite(result) && result >= 0 ? result : null;
}

function toPublicMapProperty(id, property) {
  if (typeof id !== "string" || !id || id.includes("/") || !property ||
      typeof property !== "object" || Array.isArray(property) ||
      property.websitePublished !== true || (property.status || "active") !== "active") return null;
  const link = officialPropertyUrl(property.websiteUrl);
  if (!link) return null;
  const layout = text(property.layout);
  // CRM's Properties.js and needsMatch.js use the first layout number: 4+1/2/4 → 4.
  const firstRoom = layout.split("/")[0].match(/^\s*(\d+)/);
  return {
    id: `crm-${id}`,
    title: text(property.title),
    address: publicPropertyAddress(property),
    category: text(property.category),
    propertyType: text(property.propertyType),
    status: "出售",
    price: nonnegativeNumber(property.totalPrice),
    size: nonnegativeNumber(property.titlePing),
    mainBuildingSize: nonnegativeNumber(property.mainBuildingPing),
    auxBuildingSize: nonnegativeNumber(property.auxiliaryBuildingPing),
    commonAreaSize: nonnegativeNumber(property.commonAreaPing),
    landSize: nonnegativeNumber(property.landPing),
    layout,
    rooms: firstRoom ? nonnegativeNumber(firstRoom[1]) : null,
    link,
    linkStatus: "valid",
    displayed: true,
    lat: null,
    lng: null,
  };
}

function createPublicPropertyMapHandler(ensureFirebaseAdmin) {
  return async function handler(req, res) {
    res.setHeader("Cache-Control", "no-store");
    if (req.method !== "GET") {
      res.setHeader("Allow", "GET");
      return res.status(405).json({ error: "method_not_allowed" });
    }
    const expectedToken = process.env.PROPERTY_MAP_FEED_TOKEN;
    if (!text(expectedToken)) return res.status(503).json({ error: "property_map_feed_unavailable" });
    if (!validFeedToken(req.headers?.["x-property-map-token"], expectedToken)) {
      return res.status(401).json({ error: "unauthorized" });
    }
    try {
      const { firestore } = ensureFirebaseAdmin();
      const snapshot = await firestore.collection("properties")
        .where("websitePublished", "==", true)
        .select(...PUBLIC_PROPERTY_FIELDS)
        .get();
      if (!Array.isArray(snapshot?.docs)) throw new Error("Invalid property snapshot");
      const items = snapshot.docs.map((document) => {
        if (typeof document?.data !== "function") throw new Error("Invalid property document");
        return toPublicMapProperty(document.id, document.data());
      }).filter(Boolean);
      return res.status(200).json({ items });
    } catch {
      // Never include Firebase errors, credential details, or source documents.
      return res.status(502).json({ error: "property_map_feed_unavailable" });
    }
  };
}

module.exports = {
  PUBLIC_PROPERTY_FIELDS,
  validFeedToken,
  officialPropertyUrl,
  publicPropertyAddress,
  toPublicMapProperty,
  createPublicPropertyMapHandler,
};
