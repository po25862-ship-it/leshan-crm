// Shared by the CRM and the Mac daily sync. Keep matching strict: a road or
// community name alone must never cause a floor plan to be reused.
function normalizeFloorplanAddress(value) {
  return String(value || "")
    .normalize("NFKC")
    .replace(/\s+/g, "")
    .replace(/台/g, "臺")
    .replace(/[，,]/g, "");
}

function floorplanAddressKey(value) {
  const address = normalizeFloorplanAddress(value);
  const hasCityAndDistrict = /^.{2,4}[縣市].{1,10}[區鄉鎮市]/.test(address);
  const hasStreetAndNumber = /[路街巷道].*[0-9一二三四五六七八九十百零〇兩]+號/.test(address);
  return hasCityAndDistrict && hasStreetAndNumber ? address : "";
}

function mergeFloorplanFiles(...groups) {
  const seen = new Set();
  const result = [];
  for (const group of groups) {
    if (!Array.isArray(group)) continue;
    for (const file of group) {
      if (!file || !file.url || seen.has(file.url)) continue;
      seen.add(file.url);
      result.push(file);
    }
  }
  return result;
}

function indexRememberedFloorplans(properties) {
  const result = new Map();
  for (const property of properties) {
    const key = floorplanAddressKey(property.address);
    if (key) result.set(key, mergeFloorplanFiles(result.get(key), property.floorplanAddressFiles));
  }
  return result;
}

module.exports = { normalizeFloorplanAddress, floorplanAddressKey, mergeFloorplanFiles, indexRememberedFloorplans };
