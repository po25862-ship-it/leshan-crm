import { nonNegativeNumber } from "./propertyUnitPrice";

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
  if (raw === undefined || raw === null || String(raw).trim() === "") return { monthlyRent: "" };
  const income = propertyRentalIncome(property);
  if (income.monthlyRent === null || income.annualRent === null) throw new Error("月租金請填 0 或正數，單位是元／月；未確認可留空。");
  return { monthlyRent: income.monthlyRent };
}

// Missing/empty rent in daily reports must preserve manual rent. A percentage
// from an imported report is ignored; it always uses the current asking price.
export function propertyRentalIncomeImportFields(headers, row) {
  const column = (headers || []).findIndex(label => /^月租金(?:$|[（(／/])/.test(String(label || "").normalize("NFKC").replace(/\s+/g, "")));
  const value = column >= 0 ? row[column] : undefined;
  if (value === null || value === undefined || String(value).trim() === "") return {};
  return propertyRentalIncomeFields({ monthlyRent: value });
}
