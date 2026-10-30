import { formatSheetPrice, priceNumber } from "./propertySheetPrice";

const TC = '"PingFang TC", "Microsoft JhengHei", sans-serif';
const BLACK = '"Arial Black", Arial, sans-serif';
const RED = "#D52616";

function fitFont(ctx, value, maxSize, maxWidth, family, weight = 900) {
  let size = maxSize;
  do { ctx.font = `${weight} ${size}px ${family}`; if (ctx.measureText(value).width <= maxWidth) break; size -= 1; } while (size > 12);
  return size;
}

export async function renderPropertyPricePng({ property, oldPrice = null, aspectRatio = 3, header = false }) {
  if (typeof document === "undefined") throw new Error("售價標示需要在瀏覽器中製作");
  await document.fonts?.ready;
  const canvas = document.createElement("canvas");
  canvas.width = 1200;
  canvas.height = Math.max(100, Math.round(1200 / aspectRatio));
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("瀏覽器無法製作最新售價");
  const W = canvas.width, H = canvas.height;
  ctx.fillStyle = "#FFFFFF"; ctx.fillRect(0, 0, W, H);
  const current = priceNumber(property.totalPrice);
  const crossed = !header && current !== null && priceNumber(oldPrice) !== null && current !== priceNumber(oldPrice);
  const left = header ? 20 : crossed ? W * 0.285 : W * 0.04;
  const numericWidth = header ? W * 0.45 : W - left - W * 0.12;
  const topFont = Math.min(H * 0.14, 56);
  ctx.fillStyle = RED; ctx.font = `700 ${topFont}px ${TC}`;
  ctx.fillText("最新售價", left, H * 0.2);
  const priceText = formatSheetPrice(property.totalPrice);
  const size = fitFont(ctx, priceText, H * 0.65, numericWidth, current === null ? TC : BLACK);
  ctx.fillStyle = RED; ctx.strokeStyle = RED; ctx.lineWidth = Math.max(0.5, size * 0.006);
  ctx.fillText(priceText, left, H * 0.86);
  ctx.strokeText(priceText, left, H * 0.86);
  const amountWidth = ctx.measureText(priceText).width;
  if (current !== null) {
    ctx.font = `900 ${size * 0.34}px ${TC}`;
    ctx.fillText("萬", left + amountWidth + W * 0.015, H * 0.84);
  }
  if (crossed) {
    const oldText = formatSheetPrice(oldPrice), x = W * 0.015;
    ctx.fillStyle = "#777777"; ctx.font = `500 ${topFont * 0.85}px ${TC}`;
    ctx.fillText("舊價（萬）", x, H * 0.2);
    const oldSize = fitFont(ctx, oldText, H * 0.25, W * 0.22, TC, 600);
    ctx.fillText(oldText, x, H * 0.67);
    const width = ctx.measureText(oldText).width;
    ctx.strokeStyle = "#C9362B"; ctx.lineWidth = H * 0.032;
    ctx.beginPath(); ctx.moveTo(x, H * 0.67 - oldSize * 0.95); ctx.lineTo(x + width, H * 0.7); ctx.moveTo(x, H * 0.7); ctx.lineTo(x + width, H * 0.67 - oldSize * 0.95); ctx.stroke();
  }
  if (header) {
    ctx.fillStyle = "#555555"; ctx.font = `600 ${H * 0.17}px ${TC}`;
    ctx.fillText(property.listingNo || "", W * 0.62, H * 0.3);
    ctx.font = `500 ${H * 0.15}px ${TC}`;
    ctx.fillText("原表售價若不同，請以本欄為準", W * 0.57, H * 0.67);
  }
  const blob = await new Promise((resolve, reject) => canvas.toBlob((v) => v ? resolve(v) : reject(new Error("售價標示製作失敗")), "image/png"));
  return new Uint8Array(await blob.arrayBuffer());
}
