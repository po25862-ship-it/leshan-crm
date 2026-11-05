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

export function websiteVerificationPatch(property, result) {
  if (result?.listingNo !== property.listingNo || !["live", "unlisted"].includes(result?.status) || !Number.isFinite(Date.parse(result.checkedAt))) return null;
  if (result.url !== `https://www.twhg.com.tw/buy/${property.listingNo}`) return null;
  return { websitePublished: result.status === "live", websiteUrl: result.url, officialStatusCheckedAt: result.checkedAt, officialStatusSource: "officialPage" };
}

// A form may have been opened before the daily scan. Never write its stale scan flags back.
export function withoutWebsiteScanFields(form) {
  const { websitePublished, officialStatusCheckedAt, officialViewCount, officialStatusSource, ...editable } = form;
  return editable;
}

export async function verifyPropertyWebsite(user, property) {
  const response = await fetch("/api/property-website", {
    method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${await user.getIdToken()}` },
    body: JSON.stringify({ listingNo: property.listingNo }), signal: AbortSignal.timeout(25000),
  });
  if (!response.ok) throw new Error("官網暫時無法核對，原有狀態未更動。");
  const result = await response.json();
  return websiteVerificationPatch(property, result);
}
