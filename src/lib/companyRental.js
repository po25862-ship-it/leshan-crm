import { MAIN_OWNER_UID, withAgid, withoutAgid } from "./url";
import { visibleColleagueOptions } from "./colleagueVisibility";

export const COMPANY_RENTAL_STATUSES = { available: "招租中", rented: "已出租", paused: "暫停招租", draft: "草稿" };
export const COMPANY_RENTAL_TYPES = ["整層住家", "獨立套房", "分租套房", "雅房", "店面", "辦公室", "車位"];
export const MOTORBIKE_PARKING_OPTIONS = ["待確認", "無機車位", "有機車位", "社區先到先停", "其他"];
export const RENTAL_PARKING_FEE_OPTIONS = ["待確認", "已含租金", "另計"];
export const RENTAL_FURNITURE = ["冷氣", "冰箱", "洗衣機", "熱水器", "床", "衣櫃", "沙發", "桌椅", "天然瓦斯", "網路"];
export const MAX_RENTAL_FURNITURE = 40;
export const MAX_RENTAL_FURNITURE_NAME = 30;
export const MAX_RENTAL_EQUIPMENT_CATALOG = 200;
const furnitureName = value => typeof value === "string" ? value.normalize("NFKC").trim().replace(/\s+/g, " ") : "";
const furnitureKey = value => furnitureName(value).toLowerCase();
export function normalizeRentalFurniture(values) {
  const seen = new Set();
  return (Array.isArray(values) ? values : []).map(furnitureName).filter(name => {
    const key = furnitureKey(name);
    if (!key || seen.has(key)) return false;
    seen.add(key); return true;
  });
}
// Reuse the already-loaded company list, including drafts and paused/rented cases.
// Remembered options are separate from the equipment actually included in a case.
export function rentalEquipmentChoices(rows = []) {
  const remembered = normalizeRentalFurniture(rows.flatMap(row => [
    ...normalizeRentalFurniture(row.equipmentCatalog), ...normalizeRentalFurniture(row.furniture),
  ])).filter(name => name.length <= MAX_RENTAL_FURNITURE_NAME && !RENTAL_FURNITURE.some(preset => furnitureKey(preset) === furnitureKey(name)));
  return [...RENTAL_FURNITURE, ...remembered.sort((a, b) => a.localeCompare(b, "zh-Hant"))];
}
export function addRentalFurniture(options, selected, input) {
  const name = furnitureName(input);
  if (!name) throw new Error("請先輸入設備名稱。");
  if (name.length > MAX_RENTAL_FURNITURE_NAME) throw new Error("設備名稱請在 30 字以內。");
  const choices = normalizeRentalFurniture(options);
  const existing = choices.find(item => furnitureKey(item) === furnitureKey(name));
  const displayName = existing || name;
  const furniture = normalizeRentalFurniture([...(selected || []), displayName]);
  if (furniture.length > MAX_RENTAL_FURNITURE) throw new Error("每間物件最多勾選 40 項設備，請先取消不需要的項目。");
  return { options: existing ? choices : [...choices, displayName], furniture, name: displayName, added: !existing };
}
export const MAX_RENTAL_PHOTOS = 10;
export const MAX_RENTAL_PHOTO_BYTES = 300000;
export const RENTAL_FORM_DEFAULTS = {
  title: "", community: "", type: "整層住家", area: "A7", city: "桃園市", district: "龜山區", street: "", floor: "",
  rooms: "", living: "", baths: "", size: "", sizeBasis: "室內使用，不含車位", rent: "", deposit: 2,
  mgmtMode: "待確認", mgmt: "", parking: "待確認", parkMode: "待確認", parkFee: "", parkingNumber: "",
  motorbikeParking: "待確認", motorbikeParkMode: "待確認", motorbikeParkFee: "", motorbikeParkingNumber: "",
  minLease: "一年", moveIn: "待確認", availableDate: "", pets: "待確認", cook: "待確認", subsidy: "待確認",
  websiteUrl: "", albumUrl: "", shareWebsite: true, shareAlbum: false, furniture: [], equipmentCatalog: [], description: "", buyerServiceFee: "請洽負責同事確認", sellerServiceFee: "", legacyServiceFee: "",
  agentUid: null, agentName: "", agentPhone: "", branch: "",
  viewingStatus: "待確認", doorAddress: "", landlordName: "", landlordPhone: "", keyInfo: "", internalNotes: "", viewingInstructions: "",
};
const textFields = ["title", "community", "type", "area", "city", "district", "street", "floor", "sizeBasis", "mgmtMode", "parking", "parkMode", "motorbikeParking", "motorbikeParkMode", "minLease", "moveIn", "availableDate", "pets", "cook", "subsidy", "description", "buyerServiceFee", "viewingStatus", "agentName", "agentPhone", "branch"];
const numericFields = ["rooms", "living", "baths", "size", "rent", "deposit", "mgmt", "parkFee", "motorbikeParkFee"];
export const INTERNAL_RENTAL_FIELDS = ["doorAddress", "landlordName", "landlordPhone", "keyInfo", "internalNotes", "viewingInstructions", "parkingNumber", "motorbikeParkingNumber", "sellerServiceFee", "legacyServiceFee"];
// Keep older unclassified fee notes internal until a colleague splits them explicitly.
export function companyRentalForm(original, internal, user, profile = {}) {
  return { ...RENTAL_FORM_DEFAULTS, ...original, ...internal,
    furniture: normalizeRentalFurniture(original?.furniture),
    equipmentCatalog: normalizeRentalFurniture([...normalizeRentalFurniture(original?.equipmentCatalog), ...normalizeRentalFurniture(original?.furniture)]),
    buyerServiceFee: original?.buyerServiceFee ?? RENTAL_FORM_DEFAULTS.buyerServiceFee,
    sellerServiceFee: internal?.sellerServiceFee || "",
    legacyServiceFee: internal?.legacyServiceFee || original?.serviceFee || "",
    agentUid: original ? (Object.hasOwn(original, "agentUid") ? original.agentUid : original.ownerUid || null) : user.uid,
    agentName: original?.agentName || profile.name || user.displayName || "同事",
    agentPhone: original?.agentPhone ?? profile.phone ?? "",
    branch: original?.branch ?? profile.branch ?? "",
  };
}
export function companyRentalColleagues(rows, user, profile = {}, original) {
  const map = new Map(visibleColleagueOptions(rows).filter(row => row.id && row.name?.trim()).map(row => [row.id, row]));
  if (!map.has(user.uid)) map.set(user.uid, rows.find(row => row.id === user.uid && row.name?.trim()) || { id: user.uid, name: profile.name || user.displayName || "我（目前登入）", phone: profile.phone || "", branch: profile.branch || "" });
  const previousUid = original?.agentUid || (!Object.hasOwn(original || {}, "agentUid") && original?.ownerUid);
  if (previousUid && !map.has(previousUid)) map.set(previousUid, rows.find(row => row.id === previousUid && row.name?.trim()) || { id: previousUid, name: original.agentName || "原負責同事", phone: original.agentPhone || "", branch: original.branch || "" });
  return [...map.values()].sort((a, b) => a.name.localeCompare(b.name, "zh-Hant"));
}
export function rentalAgentKey(rental) {
  if (rental.agentUid) return rental.agentUid;
  if (!Object.hasOwn(rental, "agentUid") && rental.ownerUid) return rental.ownerUid;
  return "manual:" + String(rental.agentName || "").normalize("NFKC").trim();
}
export const rentalNumber = value => value === "" || value == null ? null : Number(String(value).normalize("NFKC").replace(/,/g, ""));
export const rentalMoney = value => Number(value || 0).toLocaleString("zh-TW", { maximumFractionDigits: 2 });
export function safeRentalUrl(value) {
  if (!String(value || "").trim()) return "";
  try {
    const url = new URL(String(value).trim());
    return ["https:", "http:"].includes(url.protocol) && !url.username && !url.password && url.href.length <= 2000 ? url.href : "";
  } catch { return ""; }
}
export function companyRentalUrl(value, agid = "") {
  const clean = safeRentalUrl(value);
  if (!clean) return "";
  const url = new URL(clean);
  return ["www.twhg.com.tw", "twhg.com.tw"].includes(url.hostname.toLowerCase()) ? withAgid(clean, agid) : clean;
}
export function storedRentalUrl(value) {
  const clean = safeRentalUrl(value);
  if (!clean) return "";
  return ["www.twhg.com.tw", "twhg.com.tw"].includes(new URL(clean).hostname.toLowerCase()) ? withoutAgid(clean) : clean;
}
export function canEditCompanyRental(rental, uid) { return !!uid && (rental.ownerUid === uid || uid === MAIN_OWNER_UID); }
export function rentalPublicAddress(rental) { return [rental.city, rental.district, rental.street].filter(Boolean).join(""); }
export function rentalParkingText(rental, kind = "car") {
  const motorcycle = kind === "motorbike", parking = (motorcycle ? rental.motorbikeParking : rental.parking) || "待確認";
  if (parking === (motorcycle ? "無機車位" : "無車位")) return motorcycle ? "無機車位" : "無汽車位";
  const mode = motorcycle ? rental.motorbikeParkMode : rental.parkMode, fee = rentalNumber(motorcycle ? rental.motorbikeParkFee : rental.parkFee);
  return `${parking}${mode === "已含租金" ? "，已含租金" : mode === "另計" ? `，另計 ${fee !== null && Number.isFinite(fee) && fee >= 0 ? rentalMoney(fee) + " 元／月" : "待確認"}` : "，費用待確認"}`;
}
export function rentalMonthlyCost(rental) {
  const rent = rentalNumber(rental.rent), missing = [];
  let total = Number.isFinite(rent) ? rent : 0;
  if (!(rent > 0)) missing.push("月租金");
  if (rental.mgmtMode === "另計") {
    const fee = rentalNumber(rental.mgmt);
    if (fee === null || !Number.isFinite(fee) || fee < 0) missing.push("管理費"); else total += fee;
  } else if (!["已含租金", "無管理費"].includes(rental.mgmtMode)) missing.push("管理費");
  for (const [parking, mode, amount, none, label] of [
    [rental.parking, rental.parkMode, rental.parkFee, "無車位", "汽車位費用"],
    [rental.motorbikeParking, rental.motorbikeParkMode, rental.motorbikeParkFee, "無機車位", "機車位費用"],
  ]) {
    if (parking === none) continue;
    if (!parking || parking === "待確認") missing.push(label);
    else if (mode === "另計") {
      const fee = rentalNumber(amount);
      if (fee === null || !Number.isFinite(fee) || fee < 0) missing.push(label); else total += fee;
    } else if (mode !== "已含租金") missing.push(label);
  }
  return { total, complete: missing.length === 0, missing };
}
export function validateCompanyRental(form, status, photos = []) {
  if (!Object.hasOwn(COMPANY_RENTAL_STATUSES, status)) return "請選擇有效的招租狀態。";
  for (const field of numericFields) {
    const n = rentalNumber(form[field]);
    if (n !== null && (!Number.isFinite(n) || n < 0 || n > 100000000)) return "金額、面積與格局請填寫有效的非負數字。";
  }
  if (form.motorbikeParking && !MOTORBIKE_PARKING_OPTIONS.includes(form.motorbikeParking)) return "請選擇有效的機車位狀況。";
  if (form.motorbikeParkMode && !RENTAL_PARKING_FEE_OPTIONS.includes(form.motorbikeParkMode)) return "請選擇有效的機車位費用方式。";
  if (form.furniture != null && (!Array.isArray(form.furniture) || form.furniture.some(item => typeof item !== "string"))) return "設備清單格式不正確，請重新勾選。";
  const furniture = normalizeRentalFurniture(form.furniture);
  if (furniture.length > MAX_RENTAL_FURNITURE) return "每間物件最多勾選 40 項設備。";
  if (furniture.some(name => name.length > MAX_RENTAL_FURNITURE_NAME)) return "設備名稱請在 30 字以內。";
  if (form.equipmentCatalog != null && (!Array.isArray(form.equipmentCatalog) || form.equipmentCatalog.some(item => typeof item !== "string"))) return "共用設備清單格式不正確，請重新開啟案件。";
  const catalog = normalizeRentalFurniture([...normalizeRentalFurniture(form.equipmentCatalog), ...furniture]);
  if (catalog.length > MAX_RENTAL_EQUIPMENT_CATALOG) return "這筆案件記住的設備已達 200 項，請聯繫管理者整理。";
  if (catalog.some(name => name.length > MAX_RENTAL_FURNITURE_NAME)) return "設備名稱請在 30 字以內。";
  if ((form.title || "").trim().length > 120) return "案名請在 120 字以內。";
  for (const field of ["websiteUrl", "albumUrl"]) if (form[field] && !safeRentalUrl(form[field])) return "網址請填寫完整的 http 或 https 連結。";
  if (photos.length > MAX_RENTAL_PHOTOS) return "每案最多 10 張照片。";
  if (photos.some(photo => photo.size > MAX_RENTAL_PHOTO_BYTES || photo.type !== "image/jpeg")) return "照片請先壓縮至每張 300KB 內的 JPG。";
  if (form.moveIn === "另約日期" && form.availableDate && !validRentalDate(form.availableDate)) return "請填寫有效的可入住日期。";
  if (status !== "draft") {
    if (![form.title, form.city, form.district, form.street, form.doorAddress].every(value => String(value || "").trim())) return "請填寫案名、縣市、行政區、路段與門牌／樓層。";
    if (!String(form.agentName || "").trim()) return "請選擇案件負責人或自行輸入業務姓名。";
    if (!(rentalNumber(form.rent) > 0)) return "請填寫月租金後再加入招租清單。";
    if (!String(form.viewingInstructions || "").trim()) return "請填寫帶看方式，方便同事聯繫。";
  }
  return "";
}
export function rentalSavePayload(form, status) {
  const listing = {};
  textFields.forEach(key => { listing[key] = String(form[key] || "").trim().slice(0, key === "description" ? 6000 : 2000); });
  numericFields.forEach(key => { listing[key] = rentalNumber(form[key]); });
  listing.motorbikeParking = listing.motorbikeParking || "待確認";
  listing.motorbikeParkMode = listing.motorbikeParkMode || "待確認";
  listing.agentUid = typeof form.agentUid === "string" && form.agentUid.trim() ? form.agentUid.trim().slice(0, 128) : null;
  listing.title = listing.title || "未命名租賃草稿";
  listing.status = status;
  listing.websiteUrl = storedRentalUrl(form.websiteUrl);
  listing.albumUrl = safeRentalUrl(form.albumUrl);
  listing.shareWebsite = form.shareWebsite === true;
  listing.shareAlbum = form.shareAlbum === true;
  listing.furniture = normalizeRentalFurniture(form.furniture);
  listing.equipmentCatalog = normalizeRentalFurniture([...normalizeRentalFurniture(form.equipmentCatalog), ...listing.furniture]);
  const internal = {};
  INTERNAL_RENTAL_FIELDS.forEach(key => { internal[key] = String(form[key] || "").trim().slice(0, 6000); });
  return { listing, internal };
}
export function buildCompanyRentalShare(rental, agid = "") {
  const cost = rentalMonthlyCost(rental), website = companyRentalUrl(rental.websiteUrl, agid), album = safeRentalUrl(rental.albumUrl), furniture = normalizeRentalFurniture(rental.furniture);
  return [rental.title, [rental.community, rentalPublicAddress(rental)].filter(Boolean).join("｜"),
    `${rental.rooms ?? "—"}房${rental.living ?? "—"}廳${rental.baths ?? "—"}衛｜${rental.size ? rentalMoney(rental.size) + " 坪（" + rental.sizeBasis + "）" : "面積待確認"}${rental.floor ? "｜" + rental.floor + " 樓" : ""}`, "",
    `月租：${rental.rent ? rentalMoney(rental.rent) + " 元" : "待確認"}`,
    `管理費：${rental.mgmtMode === "另計" ? (rental.mgmt == null ? "待確認" : rentalMoney(rental.mgmt) + " 元／月") : rental.mgmtMode || "待確認"}`,
    `汽車位：${rentalParkingText(rental)}`,
    `機車位：${rentalParkingText(rental, "motorbike")}`,
    `${cost.complete ? "每月固定費用" : "目前已知每月費用"}：${rentalMoney(cost.total)} 元（不含水電等依用量計收費用）`,
    ...(cost.complete ? [] : [`另待確認：${cost.missing.join("、")}`]),
    `押金：${rental.deposit == null || !rental.rent ? "待確認" : rental.deposit + " 個月，" + rentalMoney(rental.rent * rental.deposit) + " 元"}`, "",
    `最短租期：${rental.minLease || "待確認"}｜入住：${rental.moveIn === "另約日期" ? rental.availableDate || "另約日期" : rental.moveIn || "待確認"}`,
    [`寵物：${rental.pets || "待確認"}`, `開伙：${rental.cook || "待確認"}`, `租補：${rental.subsidy || "待確認"}`].filter(Boolean).join("｜"), furniture.length ? `家具設備：${furniture.join("、")}` : "", rental.description || "",
    ...(rental.shareWebsite && website ? ["物件網址：" + website] : []), ...(rental.shareAlbum && album ? ["照片相簿：" + album] : []),
    "", `買方服務費：${rental.buyerServiceFee || "請洽負責同事確認"}`, "有興趣可以聯繫我安排看屋。"].join("\n");
}
export function validRentalDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value || "")) return false;
  const date = new Date(value + "T00:00:00Z");
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}
export function rentalSearchRows(rows, { keyword = "", area = "", colleague = "", uid = "" } = {}) {
  const words = keyword.normalize("NFKC").toLowerCase().trim().split(/\s+/).filter(Boolean);
  return rows.filter(row => (!area || row.area === area) && (!colleague || (colleague === "mine" ? row.ownerUid === uid : rentalAgentKey(row) === colleague)) && words.every(word => [row.title, row.community, row.city, row.district, row.street, row.area, row.agentName].join(" ").normalize("NFKC").toLowerCase().includes(word)));
}
