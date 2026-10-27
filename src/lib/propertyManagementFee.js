const isManagementFeeLabel = (label) => /^管理費(?:$|[（(/／：:])/.test(String(label || "").replace(/\s+/g, ""));

export function getPropertyManagementFee(property) {
  if (Object.prototype.hasOwnProperty.call(property || {}, "managementFee")) return property.managementFee ?? "";
  const legacy = (property?.customFields || []).find((field) => isManagementFeeLabel(field?.label));
  return legacy?.value ?? "";
}

export function formatPropertyManagementFee(property) {
  const text = String(getPropertyManagementFee(property)).trim();
  if (!text) return "";
  const amount = text.normalize("NFKC").replace(/[,，\s]/g, "");
  return /^\d+(?:\.\d+)?$/.test(amount) && Number.isFinite(Number(amount))
    ? `${Number(amount).toLocaleString("zh-TW", { maximumFractionDigits: 20 })} 元／月`
    : text;
}

// Older exports have no fee column. Missing/blank cells must preserve manual fees.
export function managementFeeImportFields(headers, row) {
  const column = (headers || []).findIndex(isManagementFeeLabel);
  const value = column >= 0 ? row[column] : undefined;
  return value !== null && value !== undefined && String(value).trim() !== ""
    ? { managementFee: String(value).trim() }
    : {};
}
