import { mercatorPoint } from "./propertyShareMap";

const WIDTH = 1200;
const MAP_X = 28;
const MAP_Y = 105;
const MAP_WIDTH = 760;
const TILE_SIZE = 256;

function loadTile(zoom, x, y) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.crossOrigin = "anonymous";
    image.referrerPolicy = "strict-origin-when-cross-origin";
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("地圖底圖暫時無法載入，請稍後重試。"));
    image.src = `https://tile.openstreetmap.org/${zoom}/${x}/${y}.png`;
  });
}

function chooseViewport(locations, mapHeight) {
  const points = locations.filter((item) => item.point).map((item) => item.point);
  if (!points.length) throw new Error("目前沒有可定位的路段，請先確認物件地址。 ");
  for (let zoom = points.length === 1 ? 14 : 16; zoom >= 5; zoom -= 1) {
    const projected = points.map((point) => mercatorPoint(point.lat, point.lng, zoom));
    const xs = projected.map((point) => point.x);
    const ys = projected.map((point) => point.y);
    const minX = Math.min(...xs);
    const maxX = Math.max(...xs);
    const minY = Math.min(...ys);
    const maxY = Math.max(...ys);
    if (zoom === 5 || (maxX - minX <= MAP_WIDTH - 170 && maxY - minY <= mapHeight - 170)) {
      return { zoom, left: (minX + maxX - MAP_WIDTH) / 2, top: (minY + maxY - mapHeight) / 2 };
    }
  }
  throw new Error("無法計算地圖範圍");
}

function wrapText(ctx, text, x, y, maxWidth, lineHeight, maxLines = 2) {
  let remaining = String(text || "");
  let line = 0;
  while (remaining && line < maxLines) {
    let count = 1;
    while (count < remaining.length && ctx.measureText(remaining.slice(0, count + 1)).width < maxWidth) count += 1;
    const lastLine = line === maxLines - 1 && count < remaining.length;
    ctx.fillText(lastLine ? `${remaining.slice(0, Math.max(1, count - 1))}…` : remaining.slice(0, count), x, y + line * lineHeight);
    remaining = remaining.slice(count);
    line += 1;
  }
}

export async function renderPropertyShareMap(locations) {
  const height = Math.max(850, 180 + locations.length * 73);
  const mapHeight = height - 180;
  const viewport = chooseViewport(locations, mapHeight);
  const canvas = document.createElement("canvas");
  canvas.width = WIDTH;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("這個瀏覽器無法製作位置圖");

  ctx.fillStyle = "#F5F8F5";
  ctx.fillRect(0, 0, WIDTH, height);
  ctx.fillStyle = "#205C46";
  ctx.fillRect(0, 0, WIDTH, 83);
  ctx.fillStyle = "#FFFFFF";
  ctx.font = "bold 30px 'Noto Sans TC', sans-serif";
  ctx.fillText(`物件位置圖  ·  ${locations.length} 間`, 30, 52);
  ctx.font = "15px 'Noto Sans TC', sans-serif";
  ctx.fillText("地圖編號與右側案名對照", 820, 51);

  const minTileX = Math.floor(viewport.left / TILE_SIZE);
  const maxTileX = Math.floor((viewport.left + MAP_WIDTH) / TILE_SIZE);
  const minTileY = Math.floor(viewport.top / TILE_SIZE);
  const maxTileY = Math.floor((viewport.top + mapHeight) / TILE_SIZE);
  const tileRequests = [];
  const worldTiles = 2 ** viewport.zoom;
  for (let x = minTileX; x <= maxTileX; x += 1) {
    for (let y = minTileY; y <= maxTileY; y += 1) {
      if (x >= 0 && x < worldTiles && y >= 0 && y < worldTiles) {
        tileRequests.push({ x, y, promise: loadTile(viewport.zoom, x, y) });
      }
    }
  }
  const tiles = await Promise.all(tileRequests.map(async ({ x, y, promise }) => ({ x, y, image: await promise })));
  ctx.save();
  ctx.beginPath();
  ctx.rect(MAP_X, MAP_Y, MAP_WIDTH, mapHeight);
  ctx.clip();
  for (const tile of tiles) {
    ctx.drawImage(tile.image, MAP_X + tile.x * TILE_SIZE - viewport.left, MAP_Y + tile.y * TILE_SIZE - viewport.top);
  }
  ctx.fillStyle = "rgba(255,255,255,.92)";
  ctx.fillRect(MAP_X + 13, MAP_Y + 12, 275, 34);
  ctx.fillStyle = "#234638";
  ctx.font = "bold 14px 'Noto Sans TC', sans-serif";
  ctx.fillText("示意位置・依公開路段定位", MAP_X + 25, MAP_Y + 35);

  const groups = new Map();
  for (const item of locations) {
    if (!item.point) continue;
    const key = `${item.point.lat.toFixed(6)},${item.point.lng.toFixed(6)}`;
    if (!groups.has(key)) groups.set(key, { point: item.point, numbers: [] });
    groups.get(key).numbers.push(item.number);
  }
  for (const group of groups.values()) {
    const projected = mercatorPoint(group.point.lat, group.point.lng, viewport.zoom);
    const x = MAP_X + projected.x - viewport.left;
    const y = MAP_Y + projected.y - viewport.top;
    const label = group.numbers.join("、");
    const radius = Math.max(23, 12 + label.length * 7);
    ctx.beginPath();
    ctx.arc(x, y, radius + 5, 0, Math.PI * 2);
    ctx.fillStyle = "rgba(255,255,255,.9)";
    ctx.fill();
    ctx.beginPath();
    ctx.arc(x, y, radius, 0, Math.PI * 2);
    ctx.fillStyle = "#DE5B1E";
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = "#FFFFFF";
    ctx.stroke();
    ctx.fillStyle = "#FFFFFF";
    ctx.font = "bold 18px 'Noto Sans TC', sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(label, x, y);
    ctx.textAlign = "start";
    ctx.textBaseline = "alphabetic";
  }
  ctx.restore();

  ctx.fillStyle = "#FFFFFF";
  ctx.fillRect(810, MAP_Y, 360, mapHeight);
  ctx.strokeStyle = "#D8E4DC";
  ctx.strokeRect(810, MAP_Y, 360, mapHeight);
  locations.forEach((item, index) => {
    const y = MAP_Y + 31 + index * 73;
    ctx.beginPath();
    ctx.arc(839, y, 18, 0, Math.PI * 2);
    ctx.fillStyle = item.point ? "#DE5B1E" : "#A7AAA6";
    ctx.fill();
    ctx.fillStyle = "#FFFFFF";
    ctx.font = "bold 17px 'Noto Sans TC', sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(String(item.number), 839, y);
    ctx.textAlign = "start";
    ctx.textBaseline = "alphabetic";
    ctx.fillStyle = "#182D24";
    ctx.font = "bold 16px 'Noto Sans TC', sans-serif";
    wrapText(ctx, item.title, 867, y - 7, 280, 20);
    ctx.fillStyle = item.point ? "#66776C" : "#A0473D";
    ctx.font = "12px 'Noto Sans TC', sans-serif";
    wrapText(ctx, item.point ? item.road : "位置待確認・地圖未標記", 867, y + 32, 280, 14, 1);
    if (index < locations.length - 1) {
      ctx.strokeStyle = "#E7ECE8";
      ctx.beginPath();
      ctx.moveTo(825, y + 40);
      ctx.lineTo(1154, y + 40);
      ctx.stroke();
    }
  });

  ctx.fillStyle = "#315342";
  ctx.font = "bold 16px 'Noto Sans TC', sans-serif";
  ctx.fillText("路段位置僅供參考，並非實際門牌；同路段案件可能共用標記。", 28, height - 39);
  ctx.fillStyle = "#5D7165";
  ctx.font = "14px 'Noto Sans TC', sans-serif";
  ctx.fillText("地圖資料 © OpenStreetMap contributors · 定位資料 © OpenStreetMap contributors / Photon", 28, height - 15);

  return new Promise((resolve, reject) => {
    try {
      canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error("圖片產生失敗，請稍後重試。")), "image/png");
    } catch {
      reject(new Error("瀏覽器無法匯出地圖圖片，請稍後重試。"));
    }
  });
}
