import { RENTAL_FORM_DEFAULTS, buildCompanyRentalShare, rentalMonthlyCost, rentalParkingText, rentalSavePayload, validateCompanyRental, rentalSearchRows, canEditCompanyRental, companyRentalUrl, companyRentalForm, companyRentalColleagues, rentalAgentKey, normalizeRentalFurniture, addRentalFurniture, rentalEquipmentChoices, RENTAL_FURNITURE } from "./companyRental";
import { mergeRentalPhotos } from "./companyRentalPhotos";
const form = { ...RENTAL_FORM_DEFAULTS, agentName: "小林", agentUid: "staff", title: "金捷市租賃", street: "樂善二路", doorAddress: "秘密門牌", landlordPhone: "0912345678", keyInfo: "秘密鑰匙", viewingInstructions: "請先預約", rent: "28000", mgmtMode: "另計", mgmt: 2000, parking: "坡道平面", parkMode: "另計", parkFee: 3000, motorbikeParking: "無機車位" };
test("monthly cost includes only separately charged known fees and never calls unknown fees zero", () => {
  expect(rentalMonthlyCost(form)).toEqual({ total: 33000, complete: true, missing: [] });
  expect(rentalMonthlyCost({ ...form, mgmtMode: "已含租金", parking: "無車位" }).total).toBe(28000);
  const unknown = { ...form, mgmt: "", parkFee: null };
  expect(rentalMonthlyCost(unknown)).toEqual({ total: 28000, complete: false, missing: ["管理費", "汽車位費用"] });
  expect(buildCompanyRentalShare(unknown)).toContain("目前已知每月費用");
});

test("car and motorcycle fees are independent and counted only when separately charged", () => {
  const both = { ...form, motorbikeParking: "有機車位", motorbikeParkMode: "另計", motorbikeParkFee: "300" };
  expect(rentalMonthlyCost(both)).toEqual({ total: 33300, complete: true, missing: [] });
  expect(rentalMonthlyCost({ ...both, motorbikeParkMode: "已含租金" }).total).toBe(33000);
  expect(rentalMonthlyCost({ ...both, parking: "無車位" }).total).toBe(30300);
  expect(rentalMonthlyCost({ ...both, parking: "無車位", motorbikeParking: "無機車位" }).total).toBe(30000);
  expect(rentalParkingText({ ...both, parking: "無車位" })).toBe("無汽車位");
});
test("unknown motorcycle information remains pending, and a zero motorcycle fee is valid", () => {
  const pending = { ...form, motorbikeParking: undefined };
  expect(rentalMonthlyCost(pending)).toEqual({ total: 33000, complete: false, missing: ["機車位費用"] });
  const motorcycle = { ...form, motorbikeParking: "有機車位", motorbikeParkMode: "另計", motorbikeParkFee: "" };
  expect(rentalParkingText(motorcycle, "motorbike")).toBe("有機車位，另計 待確認");
  expect(rentalMonthlyCost({ ...motorcycle, motorbikeParkFee: 0 })).toEqual({ total: 33000, complete: true, missing: [] });
  expect(validateCompanyRental({ ...motorcycle, motorbikeParkFee: -1 }, "draft")).not.toBe("");
  expect(validateCompanyRental({ ...motorcycle, motorbikeParking: "invalid" }, "draft")).toContain("機車位狀況");
});
test("old car parking and both private space numbers survive re-edit without leaking into customer text", () => {
  const old = { ...form, parkingNumber: undefined, motorbikeParking: undefined };
  delete old.motorbikeParking; delete old.motorbikeParkMode; delete old.motorbikeParkFee;
  const reopened = companyRentalForm(old, { parkingNumber: "汽車秘密B2-17", motorbikeParkingNumber: "機車秘密M28" }, { uid: "staff" });
  expect(reopened.parking).toBe("坡道平面"); expect(reopened.parkFee).toBe(3000); expect(reopened.motorbikeParking).toBe("待確認");
  const { listing, internal } = rentalSavePayload({ ...reopened, motorbikeParking: "有機車位", motorbikeParkMode: "已含租金" }, "available");
  expect(internal.motorbikeParkingNumber).toBe("機車秘密M28"); expect(internal.parkingNumber).toBe("汽車秘密B2-17");
  const share = buildCompanyRentalShare({ ...listing, ...internal });
  expect(share).toContain("汽車位：坡道平面，另計 3,000 元／月"); expect(share).toContain("機車位：有機車位，已含租金");
  expect(JSON.stringify(listing) + share).not.toMatch(/汽車秘密B2-17|機車秘密M28/);
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

test("buyer sharing and public payload exclude seller fees and unclassified legacy fees", () => {
  const input = { ...form, buyerServiceFee: "半個月租金", sellerServiceFee: "屋主私約 27,000 元", legacyServiceFee: "舊雙方合約", serviceFee: "舊雙方合約" };
  const { listing, internal } = rentalSavePayload(input, "available");
  expect(listing.buyerServiceFee).toBe("半個月租金");
  expect(listing).not.toHaveProperty("sellerServiceFee"); expect(listing).not.toHaveProperty("legacyServiceFee"); expect(listing).not.toHaveProperty("serviceFee");
  expect(internal.sellerServiceFee).toBe("屋主私約 27,000 元");
  const share = buildCompanyRentalShare({ ...input, ...listing, ...internal });
  expect(share).toContain("買方服務費：半個月租金");
  expect(share).not.toContain("屋主私約"); expect(share).not.toContain("27,000"); expect(share).not.toContain("舊雙方合約");
  expect(buildCompanyRentalShare({ ...form, serviceFee: "舊賣方費用" })).not.toContain("舊賣方費用");
});
test("legacy fee notes are retained internally until explicitly split", () => {
  const legacy = { ownerUid: "creator", agentName: "原業務", serviceFee: "雙方原約定" };
  const editable = companyRentalForm(legacy, {}, { uid: "manager" }, { name: "管理者" });
  expect(editable.legacyServiceFee).toBe("雙方原約定"); expect(editable.agentUid).toBe("creator");
  expect(editable.buyerServiceFee).toBe("請洽負責同事確認");
  const saved = rentalSavePayload(editable, "draft");
  expect(saved.internal.legacyServiceFee).toBe("雙方原約定"); expect(JSON.stringify(saved.listing)).not.toContain("雙方原約定");
});
test("staff picker includes every registered colleague and permits manual names without transferring ownership", () => {
  const staff = companyRentalColleagues([{ id: "b", name: "同事乙" }, { id: "c", name: "同事丙" }], { uid: "a" }, { name: "同事甲" });
  expect(staff.map(row => row.id).sort()).toEqual(["a", "b", "c"]);
  const record = { ...form, ownerUid: "creator", agentUid: "b", agentName: "同事乙" };
  expect(rentalSearchRows([record], { colleague: "b" })).toEqual([record]);
  expect(rentalSearchRows([record], { colleague: "mine", uid: "b" })).toEqual([]);
  expect(rentalSearchRows([record], { colleague: "mine", uid: "creator" })).toEqual([record]);
  expect(canEditCompanyRental(record, "b")).toBe(false);
  const manual = { ...record, agentUid: null, agentName: "外部業務" };
  expect(rentalSearchRows([manual], { colleague: rentalAgentKey(manual) })).toEqual([manual]);
});

test("custom equipment survives save, re-edit and customer sharing with duplicates removed", () => {
  const saved = rentalSavePayload({ ...form, furniture: ["冷氣", " 電視 ", "烘衣機", "ＴＶ", "tv"] }, "available");
  expect(saved.listing.furniture).toEqual(["冷氣", "電視", "烘衣機", "TV"]);
  const reopened = companyRentalForm(saved.listing, saved.internal, { uid: "staff" });
  expect(reopened.furniture).toEqual(saved.listing.furniture);
  expect(buildCompanyRentalShare(saved.listing)).toContain("家具設備：冷氣、電視、烘衣機、TV");
});
test("adding existing equipment selects it without duplicate choices, and invalid equipment is refused", () => {
  const duplicate = addRentalFurniture(RENTAL_FURNITURE, [], " 冷氣 ");
  expect(duplicate.added).toBe(false); expect(duplicate.options).toEqual(RENTAL_FURNITURE); expect(duplicate.furniture).toEqual(["冷氣"]);
  expect(() => addRentalFurniture([], [], "   ")).toThrow("請先輸入");
  expect(validateCompanyRental({ ...form, furniture: ["設".repeat(31)] }, "draft")).toContain("30 字");
  expect(validateCompanyRental({ ...form, furniture: Array.from({ length: 41 }, (_, i) => "設備" + i) }, "draft")).toContain("40 項");
  expect(validateCompanyRental({ ...form, furniture: [{}] }, "draft")).toContain("格式");
  expect(normalizeRentalFurniture([" 電視 ", "電視", "", "烘衣機"])).toEqual(["電視", "烘衣機"]);
});

test("company equipment options include other colleagues and inactive cases without duplicate names", () => {
  const choices = rentalEquipmentChoices([
    { ownerUid: "other", status: "rented", furniture: ["電視", "ＴＶ", "冷氣"] },
    { ownerUid: "third", status: "draft", furniture: [], equipmentCatalog: ["洗碗機", "tv", "設".repeat(31)] },
    { status: "paused", equipmentCatalog: ["烘衣機", " 電視 "] },
  ]);
  expect(choices.slice(0, RENTAL_FURNITURE.length)).toEqual(RENTAL_FURNITURE);
  expect(choices).toEqual(expect.arrayContaining(["電視", "TV", "洗碗機", "烘衣機"]));
  expect(choices.filter(name => name.toLowerCase() === "tv")).toHaveLength(1);
  expect(choices).not.toContain("設".repeat(31));
});
test("remembered equipment survives unchecking and re-editing but is never advertised as included", () => {
  const reopened = companyRentalForm({ furniture: ["電視"], equipmentCatalog: ["洗碗機"] }, {}, { uid: "staff" });
  const saved = rentalSavePayload({ ...form, ...reopened, furniture: ["冷氣"] }, "draft");
  expect(saved.listing.equipmentCatalog).toEqual(["洗碗機", "電視", "冷氣"]);
  expect(rentalEquipmentChoices([saved.listing])).toEqual(expect.arrayContaining(["洗碗機", "電視"]));
  const share = buildCompanyRentalShare(saved.listing);
  expect(share).toContain("家具設備：冷氣"); expect(share).not.toMatch(/洗碗機|電視/);
});
test("remembered equipment accepts only bounded lists and valid names", () => {
  expect(validateCompanyRental({ ...form, equipmentCatalog: {} }, "draft")).toContain("格式");
  expect(validateCompanyRental({ ...form, equipmentCatalog: ["設".repeat(31)] }, "draft")).toContain("30 字");
  expect(validateCompanyRental({ ...form, equipmentCatalog: Array.from({ length: 201 }, (_, i) => "設備" + i) }, "draft")).toContain("200 項");
});
