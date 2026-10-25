import { truncateAddress } from "./address";

const CACHE_KEY = "leshan-property-share-road-positions-v1";
const DAY = 24 * 60 * 60 * 1000;
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
  const partsList = properties.map((property) => publicRoadParts(property.address));
  const unique = [...new Map(partsList.filter(Boolean).map((parts) => [parts.publicAddress, parts])).values()];

  for (let index = 0; index < unique.length; index += 1) {
    const parts = unique[index];
    onProgress(`正在定位路段 ${index + 1}/${unique.length}…`);
    const cached = cache[parts.publicAddress];
    let point;
    if (cached && cached.expiresAt > Date.now()) {
      point = cached.point;
    } else {
      try {
        point = await queuedGeocode(parts);
        cache[parts.publicAddress] = { point, expiresAt: Date.now() + (point ? 90 * DAY : 60 * 60 * 1000) };
        saveCache(cache);
      } catch {
        point = null;
      }
    }
    known.set(parts.publicAddress, point);
  }

  return properties.map((property, index) => {
    const parts = partsList[index];
    return {
      number: index + 1,
      title: property.title || "未命名物件",
      road: parts?.publicAddress || "地址待確認",
      point: parts ? known.get(parts.publicAddress) || null : null,
    };
  });
}

export function mercatorPoint(lat, lng, zoom) {
  const scale = 256 * 2 ** zoom;
  const radians = lat * Math.PI / 180;
  return {
    x: (lng + 180) / 360 * scale,
    y: (1 - Math.asinh(Math.tan(radians)) / Math.PI) / 2 * scale,
  };
}
