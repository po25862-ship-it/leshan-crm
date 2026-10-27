function pingNumber(value) {
  if ((typeof value !== "number" && typeof value !== "string") || String(value).trim() === "") return null;
  const number = Number(String(value).replace(/,/g, ""));
  return Number.isFinite(number) && number >= 0 ? number : null;
}

export function propertyAreaWithoutParking(property) {
  const total = pingNumber(property?.titlePing);
  let parking = pingNumber(property?.parkingPing);
  if (total === null) return null;
  if (parking === null) {
    const description = String(property?.parkingDescription || "").trim();
    const confirmedNoParking = description === "無" || (!description && pingNumber(property?.parkingCount) === 0);
    if (!confirmedNoParking) return null;
    parking = 0;
  }
  if (parking > total) return null;
  return Math.round((total - parking + Number.EPSILON) * 100) / 100;
}

export function formatPropertyAreaWithoutParking(property) {
  const area = propertyAreaWithoutParking(property);
  return area === null ? "未提供" : `${area} 坪`;
}
