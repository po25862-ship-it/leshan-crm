import { RENTAL_FORM_DEFAULTS, buildCompanyRentalShare, rentalMonthlyCost, rentalSavePayload, validateCompanyRental, rentalSearchRows, canEditCompanyRental, companyRentalUrl } from "./companyRental";
import { mergeRentalPhotos } from "./companyRentalPhotos";
const form = { ...RENTAL_FORM_DEFAULTS, title: "金捷市租賃", street: "樂善二路", doorAddress: "秘密門牌", landlordPhone: "0912345678", keyInfo: "秘密鑰匙", viewingInstructions: "請先預約", rent: "28000", mgmtMode: "另計", mgmt: 2000, parking: "坡道平面", parkMode: "另計", parkFee: 3000 };
test("monthly cost includes only separately charged known fees and never calls unknown fees zero", () => {
  expect(rentalMonthlyCost(form)).toEqual({ total: 33000, complete: true, missing: [] });
  expect(rentalMonthlyCost({ ...form, mgmtMode: "已含租金", parking: "無車位" }).total).toBe(28000);
  const unknown = { ...form, mgmt: "", parkFee: null };
  expect(rentalMonthlyCost(unknown)).toEqual({ total: 28000, complete: false, missing: ["管理費", "車位費用"] });
  expect(buildCompanyRentalShare(unknown)).toContain("目前已知每月費用");
});
test("public payload and customer share never contain private address, owner phone, keys or original URL tracking", () => {
  const { listing, internal } = rentalSavePayload({ ...form, websiteUrl: "https://www.twhg.com.tw/buy/DE001?agid=12345", albumUrl: "https://drive.google.com/a", shareAlbum: false }, "available");
  expect(internal.landlordPhone).toBe("0912345678");
  const publicText = JSON.stringify(listing) + buildCompanyRentalShare({ ...listing, ...internal }, "67890");
  ["秘密門牌", "0912345678", "秘密鑰匙", "12345"].forEach(secret => expect(publicText).not.toContain(secret));
  const share = buildCompanyRentalShare({ ...listing, ...internal }, "67890");
  expect(share).toContain("agid=67890"); expect(share).not.toContain("drive.google.com");
  expect(listing).not.toHaveProperty("doorAddress"); expect(listing).not.toHaveProperty("landlordPhone");
});
test("URL validation rejects scripts and credentials, preserves 591 URLs, and prevents incomplete publication", () => {
  expect(companyRentalUrl("javascript:alert(1)")).toBe("");
  expect(companyRentalUrl("https://name:password@example.com")).toBe("");
  expect(companyRentalUrl("https://rent.591.com.tw/123", "67890")).toBe("https://rent.591.com.tw/123");
  expect(validateCompanyRental(form, "available")).toBe("");
  expect(validateCompanyRental({ ...form, doorAddress: "" }, "available")).not.toBe("");
  expect(validateCompanyRental(RENTAL_FORM_DEFAULTS, "draft")).toBe("");
  expect(validateCompanyRental({ ...form, rent: -1 }, "draft")).not.toBe("");
  expect(validateCompanyRental(form, "available", [{ size: 300001, type: "image/jpeg" }])).not.toBe("");
});
test("identical compressed content is skipped and eleven unique photos are refused", () => {
  const first = { id: "same", sha256: "same" };
  expect(mergeRentalPhotos([first], [{ ...first }, { id: "other" }])).toEqual({ photos: [first, { id: "other" }], duplicates: 1 });
  expect(() => mergeRentalPhotos(Array.from({ length: 10 }, (_, i) => ({ id: String(i) })), [{ id: "new" }])).toThrow("10");
});
test("search spans names, community, roads, area and colleague, while edit rights remain owner/admin", () => {
  const rows = [{ ...form, id: "a", ownerUid: "a", agentName: "小林", area: "A7" }, { ...form, id: "b", title: "A9套房", street: "文化路", area: "A9", ownerUid: "b" }];
  expect(rentalSearchRows(rows, { keyword: "ａ７ 樂善" }).map(row => row.id)).toEqual(["a"]);
  expect(rentalSearchRows(rows, { colleague: "mine", uid: "b" }).map(row => row.id)).toEqual(["b"]);
  expect(canEditCompanyRental(rows[0], "b")).toBe(false);
});
