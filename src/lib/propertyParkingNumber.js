export function getPropertyParkingNumber(property) {
  const entered = String(property?.parkingNumber || "").trim();
  if (entered && entered !== "—") return entered;
  // Older records can have a clearly labelled space number in the free-text description.
  const labelled = String(property?.parkingDescription || "").match(/(?:車位|車格)\s*(?:編號|號碼)\s*[：:#]?\s*([^\s，,；;。]+)/);
  return labelled?.[1] || "";
}
