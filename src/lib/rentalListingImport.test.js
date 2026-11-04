import { RENTAL_FORM_DEFAULTS } from "./companyRental";
import { applyRentalListingImport, defaultRentalImportKeys, rentalImportFields } from "./rentalListingImport";

const info = { url: "https://rent.591.com.tw/22268405", status: "live", expiresOn: "2026-12-01", checkedAt: "2026-11-04T13:00:00Z", listing: { title: "兩房車", rent: 29000, city: "新北市", furniture: ["冷氣"], ownerUid: "source-owner", agentName: "網站刊登人", sellerServiceFee: "秘密", photos: ["https://example.test/a.jpg"] } };
test("only importable listing fields are offered; ownership, fees for sellers and photos are excluded", () => {
  expect(rentalImportFields(info).map(item => item.key)).toEqual(["title", "city", "rent", "furniture"]);
  expect(rentalImportFields({ ...info, status: "unlisted" })).toEqual([]);
  expect(rentalImportFields({ ...info, url: "http://127.0.0.1/private" })).toEqual([]);
});
test("defaults and blank values are selected while existing custom values are preserved", () => {
  const form = { ...RENTAL_FORM_DEFAULTS, title: "自己取的案名", rent: "28000", furniture: ["冰箱"] };
  expect(defaultRentalImportKeys(form, info)).toEqual(["city"]);
  const next = applyRentalListingImport(form, info, ["city"]);
  expect(next).toEqual(expect.objectContaining({ title: "自己取的案名", rent: "28000", city: "新北市", furniture: ["冰箱"], websiteUrl: info.url, websiteExpiresOn: "2026-12-01" }));
});
test("explicit selection may replace a field but cannot change colleague assignment or internal data", () => {
  const form = { ...RENTAL_FORM_DEFAULTS, title: "舊案名", ownerUid: "me", agentName: "我", landlordPhone: "internal", doorAddress: "完整門牌" };
  const next = applyRentalListingImport(form, info, ["title", "rent", "ownerUid", "agentName", "sellerServiceFee", "photos"]);
  expect(next).toEqual(expect.objectContaining({ title: "兩房車", rent: 29000, ownerUid: "me", agentName: "我", landlordPhone: "internal", doorAddress: "完整門牌" }));
  expect(next.photos).toBeUndefined(); expect(next.sellerServiceFee).toBe("");
});
test("a new URL resets unrelated website dates but preserves mandate dates; same URL preserves manual expiry", () => {
  const form = { ...RENTAL_FORM_DEFAULTS, websiteUrl: "https://rent.591.com.tw/12345678", websiteExpiresOn: "2027-01-01", websiteExpirySource: "manual", websiteUnavailable: true, mandateExpiresOn: "2027-06-01" };
  expect(applyRentalListingImport(form, info, ["title"])).toEqual(expect.objectContaining({ websiteExpiresOn: "2026-12-01", websiteExpirySource: "591", websiteUnavailable: false, mandateExpiresOn: "2027-06-01" }));
  expect(applyRentalListingImport({ ...form, websiteUrl: info.url }, info, ["title"]).websiteExpiresOn).toBe("2027-01-01");
  expect(applyRentalListingImport(form, info, [])).toBe(form);
});
