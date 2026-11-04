import { RENTAL_FORM_DEFAULTS } from "./companyRental";
import { isRental591Url, rentalWebsiteKey, rentalWebsitePatch } from "./companyRentalWebsite";

export const RENTAL_IMPORT_LABELS = {
  title: "案名", community: "社區", type: "租賃類型", area: "生活圈", city: "縣市", district: "行政區", street: "公開路段", doorAddress: "完整門牌（內部）",
  floor: "樓層", rooms: "房數", living: "廳數", baths: "衛數", size: "坪數", sizeBasis: "坪數說明", rent: "月租金（元）", deposit: "押金（月）",
  mgmtMode: "管理費方式", mgmt: "管理費（元／月）", parking: "汽車位", parkMode: "汽車位費用", parkFee: "汽車位費用（元／月）",
  minLease: "最短租期", moveIn: "入住時間", pets: "寵物", cook: "開伙", subsidy: "租屋補助", buyerServiceFee: "買方服務費", furniture: "設備", description: "房屋介紹",
};
const numeric = new Set(["rooms", "living", "baths", "size", "rent", "deposit", "mgmt", "parkFee"]);
export function rentalImportFields(info) {
  if (info?.status !== "live" || !isRental591Url(info.url) || !info.listing || typeof info.listing !== "object") return [];
  return Object.entries(RENTAL_IMPORT_LABELS).flatMap(([key, label]) => {
    let value = info.listing[key];
    if (key === "furniture") {
      value = Array.isArray(value) ? [...new Set(value.filter(item => typeof item === "string" && item.trim() && item.length <= 30).map(item => item.trim()))].slice(0, 40) : [];
      return value.length ? [{ key, label, value }] : [];
    }
    if (numeric.has(key)) return typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= 100000000 ? [{ key, label, value }] : [];
    return typeof value === "string" && value.trim() ? [{ key, label, value: value.trim().slice(0, key === "description" ? 4000 : key === "doorAddress" ? 500 : 120) }] : [];
  });
}
const empty = value => value == null || value === "" || value === "待確認" || (Array.isArray(value) && !value.length);
export function defaultRentalImportKeys(form, info) {
  return rentalImportFields(info).filter(({ key }) => empty(form[key]) || String(form[key]) === String(RENTAL_FORM_DEFAULTS[key])).map(({ key }) => key);
}
export function applyRentalListingImport(form, info, selectedKeys) {
  const fields = rentalImportFields(info).filter(({ key }) => selectedKeys.includes(key));
  if (!fields.length) return form;
  const next = { ...form, ...Object.fromEntries(fields.map(({ key, value }) => [key, value])), websiteUrl: rentalWebsiteKey(info.url) };
  if (rentalWebsiteKey(form.websiteUrl) !== next.websiteUrl) Object.assign(next, { websiteExpiresOn: "", websiteExpirySource: "", websiteCheckStatus: "unchecked", websiteCheckedUrl: "", websiteCheckedAt: 0, websiteUnavailable: false });
  return { ...next, ...rentalWebsitePatch(next, info) };
}
