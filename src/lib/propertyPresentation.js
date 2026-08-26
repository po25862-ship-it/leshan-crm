export function getPropertyImage(property) {
  const direct = property?.imageUrl || property?.photoUrl || property?.coverImageUrl;
  if (direct) return direct;
  const imageFile = (property?.sheetFiles || []).find((file) =>
    String(file.type || "").startsWith("image/") || /\.(jpe?g|png|webp|heic)(\?|$)/i.test(String(file.url || file.name || ""))
  );
  return imageFile?.url || "";
}

export function propertyParkingText(property) {
  if (String(property?.parkingDescription || "").trim()) return property.parkingDescription;
  if (Number(property?.parkingCount || 0) > 0) return `${property.parkingCount} 車位`;
  if (Number(property?.parkingPing || 0) > 0) return `車位 ${property.parkingPing} 坪`;
  return "未提供";
}

export function timestampToMillis(value) {
  if (!value) return 0;
  if (typeof value.toMillis === "function") return value.toMillis();
  if (value.seconds) return value.seconds * 1000;
  const parsed = new Date(value).getTime();
  return Number.isFinite(parsed) ? parsed : 0;
}
