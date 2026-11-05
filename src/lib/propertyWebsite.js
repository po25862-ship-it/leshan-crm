export function propertyWebsiteStatus(property = {}) {
  if (property.websitePublished === true && String(property.websiteUrl || "").trim()) return "published";
  if (property.websitePublished === false) return "unpublished";
  return "unknown";
}

export function hasOfficialWebsite(property) {
  return propertyWebsiteStatus(property) === "published";
}

export function matchesWebsiteFilter(property, filter) {
  if (filter === "published") return hasOfficialWebsite(property);
  if (filter === "unpublished") return propertyWebsiteStatus(property) === "unpublished";
  if (filter === "unknown") return propertyWebsiteStatus(property) === "unknown";
  return true;
}

// A form may have been opened before the daily scan. Never write its stale scan flags back.
export function withoutWebsiteScanFields(form) {
  const { websitePublished, officialStatusCheckedAt, officialViewCount, officialStatusSource, ...editable } = form;
  return editable;
}
