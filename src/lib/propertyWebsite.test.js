import { hasOfficialWebsite, matchesWebsiteFilter, propertyWebsiteStatus, websiteVerificationPatch, withoutWebsiteScanFields } from "./propertyWebsite";

test("只有確認上架且有官網連結的物件算有官網", () => {
  expect(hasOfficialWebsite({ websitePublished: true, websiteUrl: "https://example.com/house" })).toBe(true);
  expect(hasOfficialWebsite({ websitePublished: false, websiteUrl: "https://example.com/house" })).toBe(false);
  expect(hasOfficialWebsite({ websitePublished: true, websiteUrl: "  " })).toBe(false);
  expect(hasOfficialWebsite({ websiteUrl: "https://example.com/house" })).toBe(false);
});

test("舊資料沒有布林紀錄顯示待確認，不誤算成未上架", () => {
  const p = { websiteUrl: "https://www.twhg.com.tw/buy/DE02505030" };
  expect(propertyWebsiteStatus(p)).toBe("unknown");
  expect(matchesWebsiteFilter(p, "unpublished")).toBe(false);
  expect(matchesWebsiteFilter(p, "unknown")).toBe(true);
});
test("只儲存同一委託號的明確官網結果；檢查失敗不覆寫狀態", () => {
  const p = { listingNo: "DE02505030" };
  const result = { listingNo: p.listingNo, url: `https://www.twhg.com.tw/buy/${p.listingNo}`, status: "live", checkedAt: "2026-11-05T04:00:00Z" };
  expect(websiteVerificationPatch(p, result).websitePublished).toBe(true);
  expect(websiteVerificationPatch(p, { ...result, status: "unknown" })).toBeNull();
  expect(websiteVerificationPatch(p, { ...result, listingNo: "DD02505030" })).toBeNull();
});
test("儲存舊編輯表單時不回寫同步器的官網欄位", () => {
  expect(withoutWebsiteScanFields({ title: "改案名", websitePublished: false, officialStatusCheckedAt: "old", officialViewCount: 0, officialStatusSource: "old", tags: ["邊間"] })).toEqual({ title: "改案名", tags: ["邊間"] });
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
