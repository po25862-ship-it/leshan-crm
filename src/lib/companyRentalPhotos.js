import { MAX_RENTAL_PHOTOS, MAX_RENTAL_PHOTO_BYTES } from "./companyRental";

async function decodePhoto(file) {
  if (typeof createImageBitmap === "function") {
    try { return await createImageBitmap(file); } catch { /* Safari can fall back to its native image decoder. */ }
  }
  const url = URL.createObjectURL(file);
  try {
    return await new Promise((resolve, reject) => {
      const image = new Image();
      image.onload = () => resolve(image);
      image.onerror = () => reject(new Error("這張照片無法讀取，請先轉成 JPG 或 PNG。"));
      image.src = url;
    });
  } finally { URL.revokeObjectURL(url); }
}
export async function compressRentalPhoto(file) {
  if (!["image/jpeg", "image/png", "image/webp", "image/heic", "image/heif"].includes(file.type)) throw new Error("請選擇 JPG、PNG、WebP 或 HEIC 照片。");
  if (file.size > 25000000 || file.size === 0) throw new Error("單張原圖需介於 1 位元組至 25MB。");
  const image = await decodePhoto(file);
  try {
    if (!(image.width > 0 && image.height > 0) || image.width * image.height > 100000000) throw new Error("照片尺寸過大，請先縮小後再上傳。");
    const canvas = document.createElement("canvas"), context = canvas.getContext("2d");
    if (!context) throw new Error("目前無法處理照片，請改用相簿連結。");
    let scale = Math.min(1, 1600 / Math.max(image.width, image.height)), quality = .82;
    for (let attempt = 0; attempt < 16; attempt++) {
      canvas.width = Math.max(1, Math.round(image.width * scale)); canvas.height = Math.max(1, Math.round(image.height * scale));
      context.fillStyle = "#fff"; context.fillRect(0, 0, canvas.width, canvas.height); context.drawImage(image, 0, 0, canvas.width, canvas.height);
      const blob = await new Promise(resolve => canvas.toBlob(resolve, "image/jpeg", quality));
      if (!blob) throw new Error("照片壓縮失敗，請換一張照片。");
      if (blob.size <= MAX_RENTAL_PHOTO_BYTES) {
        const hash = Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", await blob.arrayBuffer())), byte => byte.toString(16).padStart(2, "0")).join("");
        return { id: hash, sha256: hash, name: file.name.replace(/\.[^.]+$/, "") + ".jpg", size: blob.size, originalSize: file.size, type: "image/jpeg", blob, url: URL.createObjectURL(blob) };
      }
      if (quality > .5) quality -= .12; else { scale *= .8; quality = .72; }
    }
    throw new Error("照片壓縮後仍太大，請改用雲端相簿連結。");
  } finally { if (image.close) image.close(); }
}
export function mergeRentalPhotos(existing, incoming) {
  const merged = [...existing], hashes = new Set(existing.map(photo => photo.sha256 || photo.id));
  let duplicates = 0;
  incoming.forEach(photo => { if (hashes.has(photo.sha256 || photo.id)) duplicates++; else { hashes.add(photo.sha256 || photo.id); merged.push(photo); } });
  if (merged.length > MAX_RENTAL_PHOTOS) throw new Error("每案最多 10 張照片，請先移除不需要的照片。");
  return { photos: merged, duplicates };
}
