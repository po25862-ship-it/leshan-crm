export function hasOfficialWebsite(property) {
  return property.websitePublished === true && Boolean(String(property.websiteUrl || "").trim());
}

export function matchesWebsiteFilter(property, filter) {
  if (filter === "published") return hasOfficialWebsite(property);
  if (filter === "unpublished") return !hasOfficialWebsite(property);
  return true;
}
