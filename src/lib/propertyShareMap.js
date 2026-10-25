import { truncateAddress } from "./address";

const CACHE_KEY = "leshan-property-share-road-positions-v1";
const MANUAL_KEY = "leshan-property-share-manual-positions-v1";
const DAY = 24 * 60 * 60 * 1000;
// Verified public-road reference points. Keep these district-specific: the same
// street name can exist elsewhere in Taoyuan, and a road point is not a doorplate.
const ROAD_FALLBACKS = {
  "桃園市龜山區文化二路": { lat: 25.0605444, lng: 121.364725 },
  "桃園市龜山區文三三街": { lat: 25.0566579, lng: 121.3591297 },
  "桃園市龜山區文青路": { lat: 25.0393629, lng: 121.3920594 },
  "桃園市龜山區文桃路": { lat: 25.0474222, lng: 121.3910019 },
  "桃園市龜山區文學路": { lat: 25.0419414, lng: 121.3879232 },
  "桃園市龜山區樂善二路": { lat: 25.0464529, lng: 121.3846699 },
  "桃園市龜山區樂善三路": { lat: 25.0482299, lng: 121.3829474 },
  "桃園市龜山區樂學路": { lat: 25.0522371, lng: 121.3839594 },
  "桃園市龜山區樂學三路": { lat: 25.0511008, lng: 121.3832505 },
  "桃園市龜山區牛角坡路": { lat: 25.0451248, lng: 121.3892141 },
  "桃園市龜山區華亞三路": { lat: 25.046347, lng: 121.3777678 },
  "桃園市龜山區文化七路": { lat: 25.0523612, lng: 121.3687089 },
};
let lastGeocodeRequestAt = 0;
let geocodeQueue = Promise.resolve();

export function publicRoadParts(address) {
  const publicAddress = truncateAddress(String(address || "").trim()).replace(/\s+/g, "");
  const city = publicAddress.match(/^(.+?[縣市])/)?.[1] || "";
  const afterCity = publicAddress.slice(city.length);
  const district = afterCity.match(/^(.+?[區鄉鎮市])/)?.[1] || "";
  const road = afterCity.slice(district.length);
  if (!city || !/(?:大道|路|街)/.test(road)) return null;
  return { city, district, road, publicAddress };
}

export function chooseRoadPosition(features, parts) {
  const roadName = parts.road.replace(/[一二三四五六七八九十\d]+段$/, "");
  const matching = (features || []).find((feature) => {
    const { properties = {}, geometry = {} } = feature;
    const [lng, lat] = geometry.coordinates || [];
    return properties.countrycode === "TW"
      && String(properties.city || "").replace(/臺/g, "台") === parts.city.replace(/臺/g, "台")
      && String(properties.name || "").replace(/臺/g, "台") === roadName.replace(/臺/g, "台")
      && Number.isFinite(lat) && Number.isFinite(lng)
      && lat > 21 && lat < 26 && lng > 119 && lng < 123;
  });
  if (!matching) return null;
  const [lng, lat] = matching.geometry.coordinates;
  return { lat, lng };
}

function loadCache() {
  try { return JSON.parse(localStorage.getItem(CACHE_KEY) || "{}"); }
  catch { return {}; }
}

function saveCache(cache) {
  try { localStorage.setItem(CACHE_KEY, JSON.stringify(cache)); }
  catch { /* Private browsing may disable storage; the map can still be made. */ }
}

function validPoint(point) {
  return Number.isFinite(point?.lat) && Number.isFinite(point?.lng)
    && point.lat > 21 && point.lat < 26 && point.lng > 119 && point.lng < 123;
}

function manualPositions() {
  try { return JSON.parse(localStorage.getItem(MANUAL_KEY) || "{}"); }
  catch { return {}; }
}

export function getManualSharePoint(property) {
  if (!property?.id) return null;
  const saved = manualPositions()[property.id];
  return saved?.address === String(property.address || "").trim() && validPoint(saved.point)
    ? saved.point : null;
}

export function saveManualSharePoint(property, point) {
  if (!property?.id || !validPoint(point)) return false;
  try {
    const saved = manualPositions();
    saved[property.id] = { address: String(property.address || "").trim(), point };
    localStorage.setItem(MANUAL_KEY, JSON.stringify(saved));
    return true;
  } catch { return false; }
}

export function clearManualSharePoint(property) {
  if (!property?.id) return;
  try {
    const saved = manualPositions();
    delete saved[property.id];
    localStorage.setItem(MANUAL_KEY, JSON.stringify(saved));
  } catch { /* The current image can still be used without storage. */ }
}

function queuedGeocode(parts) {
  const run = geocodeQueue.catch(() => {}).then(async () => {
    const wait = Math.max(0, 1100 - (Date.now() - lastGeocodeRequestAt));
    if (wait) await new Promise((resolve) => setTimeout(resolve, wait));
    lastGeocodeRequestAt = Date.now();
    const query = `${parts.road.replace(/[一二三四五六七八九十\d]+段$/, "")} ${parts.city}`;
    const params = new URLSearchParams({ q: query, limit: "8" });
    const response = await fetch(`https://photon.komoot.io/api/?${params}`, { referrerPolicy: "strict-origin-when-cross-origin" });
    if (!response.ok) throw new Error("地圖定位服務暫時無法使用");
    const data = await response.json();
    return chooseRoadPosition(data.features, parts);
  });
  geocodeQueue = run.catch(() => {});
  return run;
}

export async function locateSharedProperties(properties, onProgress = () => {}) {
  const cache = loadCache();
  const known = new Map();
  let serviceFailed = false;
  const partsList = properties.map((property) => publicRoadParts(property.address));
  const unique = [...new Map(partsList.filter(Boolean).map((parts) => [parts.publicAddress, parts])).values()];

  for (let index = 0; index < unique.length; index += 1) {
    const parts = unique[index];
    onProgress(`正在定位路段 ${index + 1}/${unique.length}…`);
    const cached = cache[parts.publicAddress];
    let point = ROAD_FALLBACKS[parts.publicAddress] || null;
    if (!point && cached?.point && cached.expiresAt > Date.now()) {
      point = cached.point;
    } else if (!point) {
      try {
        point = await queuedGeocode(parts);
        if (point) {
          cache[parts.publicAddress] = { point, expiresAt: Date.now() + 90 * DAY };
          saveCache(cache);
        }
      } catch {
        serviceFailed = true;
        point = null;
      }
    }
    known.set(parts.publicAddress, point);
  }

  const locations = properties.map((property, index) => {
    const parts = partsList[index];
    const manualPoint = getManualSharePoint(property);
    return {
      number: index + 1,
      title: property.title || "未命名物件",
      price: property.totalPrice,
      area: property.area || "",
      road: parts?.publicAddress || "地址待確認",
      point: manualPoint || (parts ? known.get(parts.publicAddress) || null : null),
      manual: Boolean(manualPoint),
    };
  });
  if (unique.length > 0 && locations.every((item) => !item.point) && serviceFailed) {
    throw new Error("定位服務暫時無法連線，路段地址仍在；請稍後按「重試製作位置圖」。");
  }
  return locations;
}

export function mercatorPoint(lat, lng, zoom) {
  const scale = 256 * 2 ** zoom;
  const radians = lat * Math.PI / 180;
  return {
    x: (lng + 180) / 360 * scale,
    y: (1 - Math.asinh(Math.tan(radians)) / Math.PI) / 2 * scale,
  };
}
