import { mercatorPoint } from "./propertyShareMap";

export const SHARE_MAP_WIDTH = 900;
export const SHARE_MAP_X = 26;
export const SHARE_MAP_WIDTH_INNER = 848;
export const SHARE_MAP_HEIGHT = 440;
export const SHARE_MAP_ROW_HEIGHT = 150;
const GROUP_DISTANCE_METERS = 2500;

function distanceMeters(a, b) {
  const meanLat = (a.lat + b.lat) / 2 * Math.PI / 180;
  const north = (a.lat - b.lat) * 111_195;
  const east = (a.lng - b.lng) * 111_195 * Math.cos(meanLat);
  return Math.hypot(north, east);
}

function areaName(item) {
  const station = String(item.area || "").match(/A[789]/i)?.[0]?.toUpperCase();
  return station || "";
}

export function groupShareMapLocations(locations) {
  const groups = [];
  for (const item of locations.filter((entry) => entry.point)) {
    const closest = groups
      .map((group) => ({ group, distance: distanceMeters(group.center, item.point) }))
      .sort((a, b) => a.distance - b.distance)[0];
    if (closest && closest.distance <= GROUP_DISTANCE_METERS) {
      const group = closest.group;
      group.center = {
        lat: (group.center.lat * group.items.length + item.point.lat) / (group.items.length + 1),
        lng: (group.center.lng * group.items.length + item.point.lng) / (group.items.length + 1),
      };
      group.items.push(item);
    } else {
      groups.push({ center: { ...item.point }, items: [item] });
    }
  }
  if (!groups.length) throw new Error("目前沒有可定位的路段，請先確認物件地址。");

  for (const item of locations.filter((entry) => !entry.point)) {
    const area = areaName(item);
    const matching = groups.find((group) => area && group.items.some((entry) => areaName(entry) === area));
    (matching || groups[0]).items.push(item);
  }

  return groups
    .map((group) => ({ ...group, items: group.items.sort((a, b) => a.number - b.number) }))
    .sort((a, b) => a.items[0].number - b.items[0].number)
    .map((group, index) => {
      const station = group.items.map(areaName).find(Boolean);
      const label = station === "A7" ? "A7 重劃區"
        : station === "A8" ? "A8 長庚生活圈"
          : station === "A9" ? "A9 林口生活圈" : `第 ${index + 1} 區`;
      return { ...group, key: `section-${index}`, label };
    });
}

function chooseViewport(items) {
  const points = items.filter((item) => item.point).map((item) => item.point);
  for (let zoom = 16; zoom >= 5; zoom -= 1) {
    const projected = points.map((point) => mercatorPoint(point.lat, point.lng, zoom));
    const xs = projected.map((point) => point.x);
    const ys = projected.map((point) => point.y);
    const minX = Math.min(...xs);
    const maxX = Math.max(...xs);
    const minY = Math.min(...ys);
    const maxY = Math.max(...ys);
    if (zoom === 5 || (maxX - minX <= SHARE_MAP_WIDTH_INNER - 160
      && maxY - minY <= SHARE_MAP_HEIGHT - 130)) {
      return {
        zoom,
        left: (minX + maxX - SHARE_MAP_WIDTH_INNER) / 2,
        top: (minY + maxY - SHARE_MAP_HEIGHT) / 2,
      };
    }
  }
  throw new Error("無法計算地圖範圍");
}

export function getShareMapLayout(locations, viewportOverrides = {}) {
  let nextY = 114;
  const sections = groupShareMapLocations(locations).map((group) => {
    const section = {
      ...group,
      titleY: nextY,
      mapX: SHARE_MAP_X,
      mapY: nextY + 64,
      mapWidth: SHARE_MAP_WIDTH_INNER,
      mapHeight: SHARE_MAP_HEIGHT,
      listY: nextY + 64 + SHARE_MAP_HEIGHT + 12,
      viewport: viewportOverrides[group.key] || chooseViewport(group.items),
    };
    nextY = section.listY + group.items.length * SHARE_MAP_ROW_HEIGHT + 30;
    return section;
  });
  return { width: SHARE_MAP_WIDTH, height: nextY + 70, sections };
}

export function shareMapSectionAt(layout, x, y) {
  return layout.sections.find((section) => x >= section.mapX && x <= section.mapX + section.mapWidth
    && y >= section.mapY && y <= section.mapY + section.mapHeight) || null;
}

function clampViewport(section, viewport) {
  const worldSize = 256 * 2 ** viewport.zoom;
  return {
    ...viewport,
    left: Math.min(Math.max(0, viewport.left), worldSize - section.mapWidth),
    top: Math.min(Math.max(0, viewport.top), worldSize - section.mapHeight),
  };
}

export function panShareMapViewport(layout, sectionKey, dx, dy) {
  const section = layout.sections.find((item) => item.key === sectionKey);
  if (!section) return null;
  return clampViewport(section, {
    ...section.viewport,
    left: section.viewport.left - dx,
    top: section.viewport.top - dy,
  });
}

export function zoomShareMapViewport(layout, sectionKey, change) {
  const section = layout.sections.find((item) => item.key === sectionKey);
  if (!section) return null;
  const old = section.viewport;
  const zoom = Math.min(18, Math.max(5, old.zoom + change));
  const factor = 2 ** (zoom - old.zoom);
  return clampViewport(section, {
    zoom,
    left: (old.left + section.mapWidth / 2) * factor - section.mapWidth / 2,
    top: (old.top + section.mapHeight / 2) * factor - section.mapHeight / 2,
  });
}

export function pointFromShareMapClick(layout, x, y) {
  const section = shareMapSectionAt(layout, x, y);
  if (!section) return null;
  const { zoom, left, top } = section.viewport;
  const scale = 256 * 2 ** zoom;
  const worldX = left + x - section.mapX;
  const worldY = top + y - section.mapY;
  const point = {
    lat: Math.atan(Math.sinh(Math.PI * (1 - 2 * worldY / scale))) * 180 / Math.PI,
    lng: worldX / scale * 360 - 180,
  };
  return point.lat > 21 && point.lat < 26 && point.lng > 119 && point.lng < 123 ? point : null;
}
