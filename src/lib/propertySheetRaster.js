import { detectBlankRentalCell } from "./propertyRentalCell";

export async function loadSheetRaster(bytes, contentType = "image/*") {
  if (typeof document === "undefined") throw new Error("圖片標示需要在瀏覽器中製作");
  const url = URL.createObjectURL(new Blob([bytes], { type: contentType }));
  try {
    const image = new Image();
    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error("圖片讀取逾時，請重試")), 20000);
      image.onload = () => { clearTimeout(timer); resolve(); }; image.onerror = () => { clearTimeout(timer); reject(new Error("這份檔案無法製作分享圖片，請改用 PDF")); }; image.src = url;
    });
    const scale = Math.min(1, 3200 / Math.max(image.naturalWidth, image.naturalHeight));
    const canvas = document.createElement("canvas"); canvas.width = Math.round(image.naturalWidth * scale); canvas.height = Math.round(image.naturalHeight * scale);
    const ctx = canvas.getContext("2d"); if (!ctx) throw new Error("瀏覽器無法處理圖片"); ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
    return canvas;
  } finally { URL.revokeObjectURL(url); }
}
export function rentalCellForCanvas(canvas) {
  const scale = Math.min(1, 800 / canvas.width), sample = document.createElement("canvas"); sample.width = Math.round(canvas.width * scale); sample.height = Math.round(canvas.height * scale);
  const ctx = sample.getContext("2d"); ctx.drawImage(canvas, 0, 0, sample.width, sample.height);
  return detectBlankRentalCell(ctx.getImageData(0, 0, sample.width, sample.height));
}
export async function matchingSheetMark(mark, bytes) {
  if (!mark || !globalThis.crypto?.subtle) return false;
  const digest = new Uint8Array(await globalThis.crypto.subtle.digest("SHA-256", bytes));
  return Array.from(digest, n => n.toString(16).padStart(2, "0")).join("") === mark.sourceHash;
}
