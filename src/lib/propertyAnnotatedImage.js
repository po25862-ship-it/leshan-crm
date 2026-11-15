import { renderPropertyPricePng } from "./propertyPriceCanvas";
import { renderPropertyRentalPng } from "./propertyRentalCanvas";
import { hasPropertyRentalInfo } from "./propertyRentalIncome";
import { validPriceMark } from "./propertySheetPrice";
import { loadSheetRaster, matchingSheetMark, rentalCellForCanvas } from "./propertySheetRaster";

export async function renderAnnotatedPropertyImage(property, file, loaded) {
  const bytes = loaded instanceof Uint8Array ? loaded : new Uint8Array(loaded.bytes);
  if (bytes.length > 30 * 1024 * 1024) throw new Error("圖片超過 30MB，請改用 PDF");
  const source = await loadSheetRaster(bytes, loaded.contentType || file.type || "image/*");
  const valid = validPriceMark(file.priceMark), priceMark = await matchingSheetMark(valid, bytes) ? valid : null;
  const hasRent = hasPropertyRentalInfo(property), rentRect = hasRent ? rentalCellForCanvas(source) : null;
  const priceBand = priceMark ? 0 : Math.round(source.width * .17), rentBand = hasRent && !rentRect ? Math.round(source.width * .14) : 0;
  const canvas = document.createElement("canvas"); canvas.width = source.width; canvas.height = source.height + priceBand + rentBand;
  const ctx = canvas.getContext("2d"); if (!ctx) throw new Error("瀏覽器無法製作分享圖片");
  ctx.fillStyle = "#FFFFFF"; ctx.fillRect(0, 0, canvas.width, canvas.height); ctx.drawImage(source, 0, priceBand + rentBand);
  async function draw(png, rect) { const image = await loadSheetRaster(png, "image/png"); ctx.drawImage(image, rect.x, rect.y, rect.width, rect.height); }
  if (priceMark) { const r = priceMark.rect; await draw(await renderPropertyPricePng({ property, oldPrice: priceMark.oldPrice, aspectRatio: source.width * r.width / (source.height * r.height) }), { x: source.width * r.x, y: priceBand + rentBand + source.height * r.y, width: source.width * r.width, height: source.height * r.height }); }
  else await draw(await renderPropertyPricePng({ property, header: true, aspectRatio: canvas.width / priceBand }), { x: 0, y: 0, width: canvas.width, height: priceBand });
  if (hasRent) {
    const rect = rentRect ? { x: source.width * rentRect.x, y: priceBand + rentBand + source.height * rentRect.y, width: source.width * rentRect.width, height: source.height * rentRect.height } : { x: 0, y: priceBand, width: canvas.width, height: rentBand };
    await draw(await renderPropertyRentalPng({ property, aspectRatio: rect.width / rect.height }), rect);
  }
  const blob = await new Promise((resolve, reject) => canvas.toBlob(value => value ? resolve(value) : reject(new Error("分享圖片製作失敗")), "image/png"));
  return { bytes: new Uint8Array(await blob.arrayBuffer()), rentalPlacement: !hasRent ? "none" : rentRect ? "cell" : "header" };
}
