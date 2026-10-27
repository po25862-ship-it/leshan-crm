const EXCLUDING_PARKING = "excluding-parking";

function areaNumber(value) {
  if (value === null || value === undefined || String(value).trim() === "") return null;
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? number : null;
}

// Company reports include the explicitly listed parking area in their 公設 figure.
// CRM commonAreaPing is exclusive of parking; retain the source and basis so a
// new snapshot imported again can never subtract parking for a second time.
function companyCommonAreaFields(record) {
  const area = areaNumber(record.commonAreaPing);
  if (area === null) return {};
  if (record.commonAreaBasis === EXCLUDING_PARKING) {
    const fields = { commonAreaPing: area, commonAreaBasis: EXCLUDING_PARKING };
    const gross = areaNumber(record.commonAreaGrossPing);
    if (gross !== null) fields.commonAreaGrossPing = gross;
    return fields;
  }
  const parking = areaNumber(record.parkingPing);
  if (parking !== null && parking > 0 && parking <= area) {
    return {
      commonAreaPing: Math.round((area - parking + Number.EPSILON) * 100) / 100,
      commonAreaGrossPing: area,
      commonAreaBasis: EXCLUDING_PARKING,
    };
  }
  // Missing parking area is not zero. Contradictory figures are left as reported.
  return { commonAreaPing: area, commonAreaGrossPing: area, commonAreaBasis: parking > area ? "unverified" : "as-reported" };
}

module.exports = { EXCLUDING_PARKING, companyCommonAreaFields };
