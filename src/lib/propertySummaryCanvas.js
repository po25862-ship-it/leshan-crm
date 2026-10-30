import { getPropertyParkingNumber } from "./propertyParkingNumber";
import { formatPropertyManagementFee } from "./propertyManagementFee";
import { formatSheetPrice } from "./propertySheetPrice";

const PAGE_WIDTH = 595.28;
const PAGE_HEIGHT = 841.89;
const SCALE = 2;
const FONT = '"PingFang TC", "Microsoft JhengHei", sans-serif';

function valueOrMissing(value) {
  const text = String(value ?? "").trim();
  return text && text !== "—" ? text : "未提供";
}

function ping(value) {
  const number = Number(value);
  return value != null && String(value).trim() !== "" && Number.isFinite(number) && number >= 0 ? `${value} 坪` : "未提供";
}

export function buildPropertySummary(property, date = new Date()) {
  const status = { active: "在售", onHold: "暫時不賣", sold: "已售出" }[property.status] || "未提供";
  const price = Number(property.totalPrice);
  const layout = String(property.layout || "").trim();
  return {
    title: valueOrMissing(property.title),
    listingNo: valueOrMissing(property.listingNo),
    status,
    generatedAt: date.toLocaleDateString("zh-TW", { year: "numeric", month: "2-digit", day: "2-digit" }),
    basic: [
      ["最新售價", Number.isFinite(price) && price > 0 ? `${formatSheetPrice(price)} 萬` : "未提供"],
      ["格局", layout && !/^0\s*\/\s*0\s*\/\s*0$/.test(layout) ? layout : "未提供"],
      ["物件類型", valueOrMissing(property.category)],
      ["樓別／座向", valueOrMissing([property.floor, property.orientation].filter(Boolean).join("・"))],
    ],
    areas: [
      ["權狀坪數", ping(property.titlePing)],
      ["主建物", ping(property.mainBuildingPing)],
      ["附屬建物", ping(property.auxiliaryBuildingPing)],
      ["公設（不含車位）", ping(property.commonAreaPing)],
      ["車位面積", ping(property.parkingPing)],
      ["地坪", ping(property.landPing)],
      ["屋齡", valueOrMissing(property.age)],
      ["使用狀況", valueOrMissing(property.occupancy)],
      ["管理費", formatPropertyManagementFee(property) || "未提供"],
    ],
    location: [
      ["社區", valueOrMissing(property.communityName)],
      ["商圈／區域", valueOrMissing(property.area)],
      ["地址", valueOrMissing(property.address)],
      ["負責業務", valueOrMissing(property.agentInfo)],
      ["車位編號", valueOrMissing(getPropertyParkingNumber(property))],
    ],
  };
}

function drawLines(ctx, text, x, y, width, maxLines, lineHeight) {
  const lines = [];
  let line = "";
  for (const character of Array.from(String(text))) {
    if (ctx.measureText(line + character).width > width && line) {
      lines.push(line);
      line = character;
    } else {
      line += character;
    }
  }
  if (line) lines.push(line);
  const visible = lines.slice(0, maxLines);
  if (lines.length > maxLines) {
    let last = visible[maxLines - 1];
    while (ctx.measureText(`${last}…`).width > width && last) last = last.slice(0, -1);
    visible[maxLines - 1] = `${last}…`;
  }
  visible.forEach((item, index) => ctx.fillText(item, x, y + index * lineHeight));
}

function drawCard(ctx, x, y, width, height, label, value, fontSize = 14) {
  ctx.fillStyle = "#FFFFFF";
  ctx.fillRect(x, y, width, height);
  ctx.strokeStyle = "#DCE4DF";
  ctx.strokeRect(x + 0.5, y + 0.5, width - 1, height - 1);
  ctx.fillStyle = "#65756E";
  ctx.font = `600 10px ${FONT}`;
  ctx.fillText(label, x + 13, y + 20);
  ctx.fillStyle = value === "未提供" ? "#89958F" : "#1A2C25";
  ctx.font = `600 ${fontSize}px ${FONT}`;
  drawLines(ctx, value, x + 13, y + 40, width - 26, 2, 15);
}

export async function renderPropertySummaryPng(property) {
  if (typeof document === "undefined") throw new Error("系統摘要需要在瀏覽器中製作");
  await document.fonts?.ready;
  const summary = buildPropertySummary(property);
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(PAGE_WIDTH * SCALE);
  canvas.height = Math.round(PAGE_HEIGHT * SCALE);
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("瀏覽器無法製作系統摘要");
  ctx.scale(SCALE, SCALE);
  ctx.fillStyle = "#F5F7F4";
  ctx.fillRect(0, 0, PAGE_WIDTH, PAGE_HEIGHT);

  ctx.fillStyle = "#214C3F";
  ctx.fillRect(0, 0, PAGE_WIDTH, 140);
  ctx.fillStyle = "#DCEDE4";
  ctx.font = `600 11px ${FONT}`;
  ctx.fillText("樂善房仲 CRM  /  帶看資料", 36, 36);
  ctx.fillStyle = "#FFFFFF";
  ctx.font = `700 22px ${FONT}`;
  drawLines(ctx, summary.title, 36, 75, PAGE_WIDTH - 72, 2, 29);
  ctx.fillStyle = "#F5C593";
  ctx.font = `600 11px ${FONT}`;
  ctx.fillText(`案號 ${summary.listingNo}    ·    ${summary.status}`, 36, 126);

  ctx.fillStyle = "#FFF1E6";
  ctx.fillRect(36, 154, PAGE_WIDTH - 72, 49);
  ctx.fillStyle = "#A0481B";
  ctx.font = `700 12px ${FONT}`;
  ctx.fillText("系統帶看摘要 · 非原始物調表", 49, 174);
  ctx.font = `11px ${FONT}`;
  ctx.fillText("此物件尚未上傳資料表，下列內容取自 CRM 現有欄位；空白資料不推測。", 49, 193);

  ctx.fillStyle = "#214C3F";
  ctx.font = `700 14px ${FONT}`;
  ctx.fillText("基本資料", 36, 229);
  const basicX = [36, 303];
  summary.basic.forEach(([label, value], index) => {
    drawCard(ctx, basicX[index % 2], 243 + Math.floor(index / 2) * 70, 256, 62, label, value);
    if (index === 0) {
      ctx.fillStyle = "#FFFFFF"; ctx.fillRect(49, 268, 230, 32);
      ctx.fillStyle = "#D52616";
      let fontSize = 29;
      do { ctx.font = `900 ${fontSize}px "Arial Black", ${FONT}`; if (ctx.measureText(value).width <= 230) break; fontSize--; } while (fontSize > 12);
      ctx.fillText(value, 49, 295);
    }
  });

  ctx.fillStyle = "#214C3F";
  ctx.font = `700 14px ${FONT}`;
  ctx.fillText("面積與現況", 36, 405);
  const areaX = [36, 214, 392];
  summary.areas.forEach(([label, value], index) => {
    drawCard(ctx, areaX[index % 3], 419 + Math.floor(index / 3) * 69, 167, 61, label, value, 13);
  });

  ctx.fillStyle = "#214C3F";
  ctx.font = `700 14px ${FONT}`;
  ctx.fillText("位置與聯絡", 36, 642);
  ctx.fillStyle = "#FFFFFF";
  ctx.fillRect(36, 655, PAGE_WIDTH - 72, 151);
  ctx.strokeStyle = "#DCE4DF";
  ctx.strokeRect(36.5, 655.5, PAGE_WIDTH - 73, 150);
  summary.location.forEach(([label, value], index) => {
    const y = 676 + index * 27;
    ctx.fillStyle = "#65756E";
    ctx.font = `600 10px ${FONT}`;
    ctx.fillText(label, 49, y);
    ctx.fillStyle = value === "未提供" ? "#89958F" : "#1A2C25";
    ctx.font = `12px ${FONT}`;
    drawLines(ctx, value, 135, y, 410, 2, 13);
  });

  ctx.fillStyle = "#65756E";
  ctx.font = `10px ${FONT}`;
  ctx.fillText("資料來源：CRM 物件欄位", 36, 825);
  ctx.textAlign = "right";
  ctx.fillText("實際現況請以最新委託資料確認", PAGE_WIDTH - 36, 825);

  const blob = await new Promise((resolve, reject) => {
    canvas.toBlob((value) => value ? resolve(value) : reject(new Error("系統摘要製作失敗")), "image/png");
  });
  return new Uint8Array(await blob.arrayBuffer());
}
