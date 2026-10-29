function normalizeArea(value) {
  return String(value || "").normalize("NFKC").replace(/\s+/g, "").replace(/[‐‑–—－]/g, "-").toUpperCase();
}

function stationZone(value) {
  return normalizeArea(value).match(/A([789])(?!\d)/)?.[0] || "";
}

export function propertyBusinessAreaOptions(properties) {
  const areas = new Map();
  properties.forEach((property) => {
    const label = String(property.area || "").trim();
    if (label) areas.set(normalizeArea(label), label);
  });
  return [...areas].sort((a, b) => a[0].localeCompare(b[0], "zh-Hant")).map(([key, label]) => ({ value: `area:${key}`, label }));
}

export function matchesPropertyBusinessArea(property, selected) {
  if (!selected) return true;
  if (selected === "missing") return !normalizeArea(property.area);
  if (selected.startsWith("zone:")) {
    // An explicit business zone takes precedence over a station mentioned in the title.
    return (stationZone(property.area) || stationZone(property.title)) === selected.slice(5);
  }
  return selected === `area:${normalizeArea(property.area)}`;
}
