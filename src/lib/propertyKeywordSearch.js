const SEARCH_FIELDS = ["title", "communityName", "area", "address", "listingNo", "store"];

function normalizeSearchText(value) {
  return String(value || "")
    .normalize("NFKC")
    .replace(/臺/g, "台")
    .toLowerCase();
}

export function matchesPropertyKeyword(property, keyword) {
  const terms = normalizeSearchText(keyword).trim().split(/\s+/).filter(Boolean);
  if (terms.length === 0) return true;
  const searchableText = SEARCH_FIELDS.map((field) => normalizeSearchText(property?.[field])).join(" ");
  return terms.every((term) => searchableText.includes(term));
}
