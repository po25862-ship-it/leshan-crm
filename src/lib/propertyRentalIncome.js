import { todayTaipeiStr } from "./dates";
import { nonNegativeNumber } from "./propertyUnitPrice";

export function leaseDateValue(value) {
  if (value === undefined || value === null || String(value).trim() === "") return "";
  let text = String(value).normalize("NFKC").trim();
  if (typeof value === "number" && value >= 43831 && value <= 109574) text = new Date(Date.UTC(1899, 11, 30) + Math.floor(value) * 86400000).toISOString().slice(0, 10);
  const match = text.match(/^(\d{2,4})[-/.](\d{1,2})[-/.](\d{1,2})$/);
  if (!match) return null;
  let year = Number(match[1]); if (match[1].length <= 3) year += 1911;
  const month = Number(match[2]), day = Number(match[3]), date = new Date(Date.UTC(year, month - 1, day));
  if (year < 1912 || year > 2199 || date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return null;
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

export function propertyLeaseEnded(property = {}, today = todayTaipeiStr()) {
  const end = leaseDateValue(property.leaseEndDate);
  return Boolean(end && end < today);
}

export function formatPropertyLease(property = {}, today = todayTaipeiStr()) {
  const start = leaseDateValue(property.leaseStartDate), end = leaseDateValue(property.leaseEndDate);
  if (start === null || end === null || (start && end && start > end)) return "租期待確認";
  const note = String(property.leaseTermNote || "").trim();
  const show = value => value.replace(/-/g, "/");
  let label = start && end ? `${show(start)}～${show(end)}` : end ? `至 ${show(end)}（起日待確認）` : start ? `${show(start)} 起（到期待確認）` : note || "租期待確認";
  if ((start || end) && note) label += `・${note}`;
  if (propertyLeaseEnded(property, today)) label += "（表載租期已到期，續租待確認）";
  return label;
}

export const propertyRentFeeNote = property => String(property?.rentFeeNote || "").trim() || "包含費用待確認";
export const isIncomeProperty = property => propertyRentalIncome(property).monthlyRent > 0;
export const hasPropertyRentalInfo = property => propertyRentalIncome(property).monthlyRent !== null || Boolean(property?.leaseStartDate || property?.leaseEndDate || property?.leaseTermNote);

export function propertyRentalIncome(property = {}) {
  const monthlyRent = nonNegativeNumber(property.monthlyRent);
  const priceWan = nonNegativeNumber(property.totalPrice);
  const annualRent = monthlyRent !== null && Number.isFinite(monthlyRent * 12) ? monthlyRent * 12 : null;
  const annualYield = annualRent !== null && priceWan > 0 && Number.isFinite(priceWan * 10000)
    ? annualRent / (priceWan * 10000) * 100 : null;
  return { monthlyRent, annualRent, annualYield: Number.isFinite(annualYield) ? annualYield : null };
}

export function formatPropertyMonthlyRent(property) {
  const rent = propertyRentalIncome(property).monthlyRent;
  return rent === null ? "未填寫" : `${rent.toLocaleString("zh-TW", { maximumFractionDigits: 2 })} 元／月`;
}

export function formatPropertyRentalYield(property) {
  const income = propertyRentalIncome(property);
  if (income.monthlyRent === null) return "待填月租金";
  return income.annualYield === null ? "待填有效總價" : `${income.annualYield.toFixed(2)}%`;
}

export function propertyRentalIncomeFields(property) {
  const raw = property?.monthlyRent;
  const blank = raw === undefined || raw === null || String(raw).trim() === "";
  const income = propertyRentalIncome(property);
  if (!blank && (income.monthlyRent === null || income.annualRent === null)) throw new Error("月租金請填 0 或正數，單位是元／月；未確認可留空。");
  const leaseStartDate = leaseDateValue(property?.leaseStartDate), leaseEndDate = leaseDateValue(property?.leaseEndDate);
  if (leaseStartDate === null || leaseEndDate === null) throw new Error("租約起訖日期不正確，請填有效日期；未確認可留空。");
  if (leaseStartDate && leaseEndDate && leaseStartDate > leaseEndDate) throw new Error("租約到期日不能早於起日。");
  const rentFeeNote = String(property?.rentFeeNote || "").trim();
  if (rentFeeNote.length > 100) throw new Error("租金費用說明請縮短至 100 字內。");
  const leaseTermNote = String(property?.leaseTermNote || "").trim();
  if (leaseTermNote.length > 150) throw new Error("租期補充請縮短至 150 字內。");
  return { monthlyRent: blank ? "" : income.monthlyRent, leaseStartDate, leaseEndDate, rentFeeNote, leaseTermNote };
}

// Missing/empty rent in daily reports must preserve manual rent. A percentage
// from an imported report is ignored; it always uses the current asking price.
export function propertyRentalIncomeImportFields(headers, row) {
  const labels = (headers || []).map(label => String(label || "").normalize("NFKC").replace(/\s+/g, ""));
  const draft = {};
  for (const [key, test] of [["monthlyRent", /^月租金(?:$|[（(／/])/], ["leaseStartDate", /^(?:租約起日|租期起日|租約開始日)$/], ["leaseEndDate", /^(?:租約到期日|租約迄日|租期迄日)$/], ["rentFeeNote", /^租金費用說明$/], ["leaseTermNote", /^租期補充$/]]) {
    const column = labels.findIndex(label => test.test(label)), value = row[column];
    if (column >= 0 && value !== null && value !== undefined && String(value).trim() !== "") draft[key] = value;
  }
  if (!Object.keys(draft).length) return {};
  const normalized = propertyRentalIncomeFields(draft);
  return Object.fromEntries(Object.keys(draft).map(key => [key, normalized[key]]));
}
