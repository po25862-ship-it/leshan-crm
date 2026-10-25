import { hasOfficialWebsite, matchesWebsiteFilter } from "./propertyWebsite";

test("只有確認上架且有官網連結的物件算有官網", () => {
  expect(hasOfficialWebsite({ websitePublished: true, websiteUrl: "https://example.com/house" })).toBe(true);
  expect(hasOfficialWebsite({ websitePublished: false, websiteUrl: "https://example.com/house" })).toBe(false);
  expect(hasOfficialWebsite({ websitePublished: true, websiteUrl: "  " })).toBe(false);
  expect(hasOfficialWebsite({ websiteUrl: "https://example.com/house" })).toBe(false);
});

test("官網篩選可分別顯示已上架和未上架", () => {
  const published = { websitePublished: true, websiteUrl: "https://example.com/house" };
  const unpublished = { websitePublished: false, websiteUrl: "https://example.com/house" };
  expect(matchesWebsiteFilter(published, "published")).toBe(true);
  expect(matchesWebsiteFilter(unpublished, "published")).toBe(false);
  expect(matchesWebsiteFilter(published, "unpublished")).toBe(false);
  expect(matchesWebsiteFilter(unpublished, "unpublished")).toBe(true);
  expect(matchesWebsiteFilter(unpublished, "all")).toBe(true);
});
