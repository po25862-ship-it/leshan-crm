export function buildMapSearchUrl(address) {
  const params = new URLSearchParams({ api: "1", query: address || "" });
  return `https://www.google.com/maps/search/?${params.toString()}`;
}

export function buildDirectionsUrl(stops) {
  const clean = stops.map((stop) => String(stop || "").trim()).filter(Boolean);
  if (clean.length < 2) return "";
  const params = new URLSearchParams({
    api: "1",
    origin: clean[0],
    destination: clean[clean.length - 1],
    travelmode: "driving",
  });
  if (clean.length > 2) params.set("waypoints", clean.slice(1, -1).join("|"));
  return `https://www.google.com/maps/dir/?${params.toString()}`;
}
