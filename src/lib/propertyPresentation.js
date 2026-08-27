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

export function getRecentPriceDrop(property, days = 14, now = Date.now()) {
  const change = property?.lastPriceChange;
  const oldPrice = Number(change?.oldPrice);
  const newPrice = Number(change?.newPrice);
  const changedAt = timestampToMillis(change?.date || change?.createdAt);
  if (!oldPrice || !newPrice || newPrice >= oldPrice || !changedAt) return null;
  if (changedAt < now - days * 86400000) return null;
  const amount = oldPrice - newPrice;
  return {
    oldPrice,
    newPrice,
    amount,
    percent: Math.round((amount / oldPrice) * 1000) / 10,
    date: change.date || "",
  };
}
