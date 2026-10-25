import { mercatorPoint } from "./propertyShareMap";
import { getShareMapLayout, SHARE_MAP_ROW_HEIGHT } from "./shareMapLayout";
import { getMapBackgroundStyle } from "./shareMapStyles";

const TILE_SIZE = 256;
const tileCache = new Map();

function loadTile(zoom, x, y) {
  const key = `${zoom}/${x}/${y}`;
  if (tileCache.has(key)) return tileCache.get(key);
  const request = new Promise((resolve, reject) => {
    const image = new Image();
    image.crossOrigin = "anonymous";
    image.referrerPolicy = "strict-origin-when-cross-origin";
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("地圖底圖暫時無法載入，請稍後重試。"));
    image.src = `https://tile.openstreetmap.org/${key}.png`;
  }).catch((error) => {
    tileCache.delete(key);
    throw error;
  });
  tileCache.set(key, request);
  if (tileCache.size > 128) tileCache.delete(tileCache.keys().next().value);
  return request;
}

async function drawMapTiles(ctx, section, mapStyle) {
  const { zoom, left, top } = section.viewport;
  const style = getMapBackgroundStyle(mapStyle);
  ctx.save();
  ctx.beginPath();
  ctx.rect(section.mapX, section.mapY, section.mapWidth, section.mapHeight);
  ctx.clip();
  ctx.fillStyle = "#E9EFEB";
  ctx.fillRect(section.mapX, section.mapY, section.mapWidth, section.mapHeight);
  if (style.styleUrl) {
    const { drawOpenFreeMapSnapshot } = await import("./openFreeMapSnapshot");
    await drawOpenFreeMapSnapshot(ctx, section, style.styleUrl, mapStyle);
  } else {
    const worldTiles = 2 ** zoom;
    const requests = [];
    for (let x = Math.floor(left / TILE_SIZE); x <= Math.floor((left + section.mapWidth) / TILE_SIZE); x += 1) {
      for (let y = Math.floor(top / TILE_SIZE); y <= Math.floor((top + section.mapHeight) / TILE_SIZE); y += 1) {
        if (x >= 0 && x < worldTiles && y >= 0 && y < worldTiles) {
          requests.push({ x, y, image: loadTile(zoom, x, y) });
        }
      }
    }
    const tiles = await Promise.all(requests.map(async (tile) => ({ ...tile, image: await tile.image })));
    for (const tile of tiles) {
      ctx.drawImage(tile.image,
        section.mapX + tile.x * TILE_SIZE - left,
        section.mapY + tile.y * TILE_SIZE - top);
    }
  }

  ctx.fillStyle = "rgba(255,255,255,.95)";
  ctx.fillRect(section.mapX + 13, section.mapY + 13, 326, 39);
  ctx.fillStyle = "#284A3B";
  ctx.font = "bold 19px 'Noto Sans TC', sans-serif";
  ctx.fillText("路段示意位置・非實際門牌", section.mapX + 27, section.mapY + 41);

  const groups = new Map();
  for (const item of section.items) {
    if (!item.point) continue;
    const key = `${item.point.lat.toFixed(6)},${item.point.lng.toFixed(6)}`;
    if (!groups.has(key)) groups.set(key, { point: item.point, numbers: [] });
    groups.get(key).numbers.push(item.number);
  }
  for (const group of groups.values()) {
    const projected = mercatorPoint(group.point.lat, group.point.lng, zoom);
    const x = section.mapX + projected.x - left;
    const y = section.mapY + projected.y - top;
    const label = group.numbers.join("、");
    const radius = Math.max(31, 14 + label.length * 9);
    ctx.beginPath();
    ctx.arc(x, y, radius + 6, 0, Math.PI * 2);
    ctx.fillStyle = "rgba(255,255,255,.96)";
    ctx.fill();
    ctx.beginPath();
    ctx.arc(x, y, radius, 0, Math.PI * 2);
    ctx.fillStyle = "#DE5B1E";
    ctx.fill();
    ctx.lineWidth = 3;
    ctx.strokeStyle = "#FFFFFF";
    ctx.stroke();
    ctx.fillStyle = "#FFFFFF";
    ctx.font = "bold 28px 'Noto Sans TC', sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(label, x, y);
    ctx.textAlign = "start";
    ctx.textBaseline = "alphabetic";
  }
  ctx.restore();
  ctx.strokeStyle = "#D4DED7";
  ctx.lineWidth = 2;
  ctx.strokeRect(section.mapX, section.mapY, section.mapWidth, section.mapHeight);
}

function drawTitle(ctx, title, x, y, maxWidth) {
  let rest = String(title || "未命名物件");
  ctx.font = "bold 31px 'Noto Sans TC', sans-serif";
  for (let line = 0; line < 2 && rest; line += 1) {
    let length = 1;
    while (length < rest.length && ctx.measureText(rest.slice(0, length + 1)).width <= maxWidth) length += 1;
    if (line === 1 && length < rest.length) {
      while (length > 1 && ctx.measureText(`${rest.slice(0, length)}…`).width > maxWidth) length -= 1;
      ctx.fillText(`${rest.slice(0, length)}…`, x, y + line * 36);
    } else {
      ctx.fillText(rest.slice(0, length), x, y + line * 36);
    }
    rest = rest.slice(length);
  }
}

function drawSectionList(ctx, section) {
  section.items.forEach((item, index) => {
    const y = section.listY + index * SHARE_MAP_ROW_HEIGHT;
    ctx.fillStyle = index % 2 === 0 ? "#FFFFFF" : "#F9FBF8";
    ctx.fillRect(section.mapX, y, section.mapWidth, SHARE_MAP_ROW_HEIGHT - 4);
    ctx.strokeStyle = "#E0E7E1";
    ctx.strokeRect(section.mapX, y, section.mapWidth, SHARE_MAP_ROW_HEIGHT - 4);
    ctx.beginPath();
    ctx.arc(section.mapX + 44, y + 61, 29, 0, Math.PI * 2);
    ctx.fillStyle = item.point ? "#DE5B1E" : "#929D95";
    ctx.fill();
    ctx.fillStyle = "#FFFFFF";
    ctx.font = "bold 28px 'Noto Sans TC', sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(String(item.number), section.mapX + 44, y + 61);
    ctx.textAlign = "start";
    ctx.textBaseline = "alphabetic";

    ctx.fillStyle = "#182D24";
    drawTitle(ctx, item.title, section.mapX + 91, y + 39, section.mapWidth - 113);
    ctx.fillStyle = "#AF491B";
    ctx.font = "bold 27px 'Noto Sans TC', sans-serif";
    const price = item.price === "" || item.price === null || item.price === undefined
      ? "價格未提供" : `總價 ${item.price} 萬`;
    ctx.fillText(price, section.mapX + 91, y + 121);
    ctx.fillStyle = item.point ? "#526B5B" : "#A0473D";
    ctx.font = "22px 'Noto Sans TC', sans-serif";
    const road = item.point ? item.road : "位置待確認・地圖未標記";
    ctx.fillText(road, section.mapX + 330, y + 121, section.mapWidth - 350);
  });
}

export async function renderPropertyShareMap(locations, viewportOverrides = {}, mapStyle = "standard") {
  const layout = getShareMapLayout(locations, viewportOverrides);
  const canvas = document.createElement("canvas");
  canvas.width = layout.width;
  canvas.height = layout.height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("這個瀏覽器無法製作位置圖");

  ctx.fillStyle = "#F3F7F3";
  ctx.fillRect(0, 0, layout.width, layout.height);
  ctx.fillStyle = "#205C46";
  ctx.fillRect(0, 0, layout.width, 90);
  ctx.fillStyle = "#FFFFFF";
  ctx.font = "bold 42px 'Noto Sans TC', sans-serif";
  ctx.fillText(`物件位置圖｜共 ${locations.length} 間`, 28, 59);

  for (const section of layout.sections) {
    ctx.fillStyle = "#FFFFFF";
    ctx.fillRect(section.mapX, section.titleY, section.mapWidth, 54);
    ctx.fillStyle = "#205C46";
    ctx.font = "bold 35px 'Noto Sans TC', sans-serif";
    ctx.fillText(section.label, section.mapX + 14, section.titleY + 39);
    ctx.fillStyle = "#596F61";
    ctx.font = "22px 'Noto Sans TC', sans-serif";
    ctx.textAlign = "right";
    ctx.fillText(`${section.items.length} 間物件`, section.mapX + section.mapWidth - 14, section.titleY + 37);
    ctx.textAlign = "start";
    await drawMapTiles(ctx, section, mapStyle);
    drawSectionList(ctx, section);
  }

  ctx.fillStyle = "#315342";
  ctx.font = "20px 'Noto Sans TC', sans-serif";
  ctx.fillText("位置依公開路段示意，並非實際門牌；同路段物件可能共用標記。", 28, layout.height - 42);
  ctx.fillStyle = "#5D7165";
  ctx.font = "18px 'Noto Sans TC', sans-serif";
  const credits = getMapBackgroundStyle(mapStyle).styleUrl
    ? "OpenFreeMap © OpenMapTiles · Data from OpenStreetMap · 定位資料 © OpenStreetMap / Photon"
    : "地圖資料 © OpenStreetMap contributors · 定位資料 © OpenStreetMap / Photon";
  ctx.fillText(credits, 28, layout.height - 17);

  return new Promise((resolve, reject) => {
    try {
      canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error("圖片產生失敗，請稍後重試。")), "image/png");
    } catch {
      reject(new Error("瀏覽器無法匯出地圖圖片，請稍後重試。"));
    }
  });
}
