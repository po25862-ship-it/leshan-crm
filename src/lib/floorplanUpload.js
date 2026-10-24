const MAX_FLOORPLAN_BYTES = 10 * 1024 * 1024;
const ALLOWED_IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "image/heic"]);

export function validateFloorplanFiles(files) {
  if (files.some((file) => !ALLOWED_IMAGE_TYPES.has(file.type))) {
    return "格局圖請選擇 JPG、PNG、WebP 或 HEIC 圖片。";
  }
  if (files.some((file) => file.size > MAX_FLOORPLAN_BYTES)) {
    return "每張格局圖不能超過 10 MB。";
  }
  return null;
}
