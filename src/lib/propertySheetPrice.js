// Coordinates are relative to the original file, from its top-left corner.
// The quote is read from the current property; metadata contains only the old
// printed price and its verified location, never a cached replacement price.
function priceNumber(value) {
  if (value == null || String(value).trim() === "") return null;
  const n = Number(String(value).normalize("NFKC").replace(/,/g, ""));
  return Number.isFinite(n) && n > 0 && n <= 100000000 ? n : null;
}

function formatSheetPrice(value) {
  const n = priceNumber(value);
  return n === null ? "售價待確認" : n.toLocaleString("en-US", { maximumFractionDigits: 2 });
}

function validPriceMark(mark) {
  if (!mark || mark.schema !== 1 || mark.page !== 0 || !/^[a-f0-9]{64}$/.test(mark.sourceHash || "")) return null;
  const { x, y, width, height } = mark.rect || {};
  if (![x, y, width, height].every(Number.isFinite) || x < 0 || y < 0 || width < 0.08 || height < 0.025 || width > 0.9 || height > 0.25 || x + width > 1 || y + height > 1 || priceNumber(mark.oldPrice) === null) return null;
  return { schema: 1, page: 0, sourceHash: mark.sourceHash, oldPrice: priceNumber(mark.oldPrice), rect: { x, y, width, height } };
}

function visionPriceCandidates(lines = []) {
  const items = lines.filter((l) => l && [l.x, l.y, l.width, l.height].every(Number.isFinite)).map((l) => ({ ...l, text: String(l.text || "").normalize("NFKC").replace(/\s/g, ""), top: 1 - l.y - l.height, bottom: 1 - l.y }));
  const labels = items.filter((l) => /^(?:售價|總價|開價|售|價)[:：]?$/.test(l.text));
  const loans = items.filter((l) => /現有貸款|貸款餘額|車位價/.test(l.text));
  return items.flatMap((line) => {
    const match = line.text.match(/^(?:(?:售價|總價|開價)[:：]?)?([0-9,]+(?:\.[0-9]+)?)(萬(?:元)?)?$/);
    if (!match || line.top < 0.06 || line.bottom > 0.5 || line.x > 0.65 || line.confidence < 0.5) return [];
    const oldPrice = priceNumber(match[1]);
    if (oldPrice === null) return [];
    const anchor = labels.find((label) => label.x <= line.x + 0.015 && line.x - label.x < 0.4 && Math.abs((label.top + label.bottom - line.top - line.bottom) / 2) < 0.09);
    if (!anchor) return [];
    if (loans.some((l) => l.x > anchor.x && l.x < line.x && Math.abs(l.top - line.top) < 0.1)) return [];
    const currency = items.find((l) => /^萬(?:元)?$/.test(l.text) && l.x >= line.x + line.width - 0.02 && l.x - line.x - line.width < 0.1 && Math.abs(l.bottom - line.bottom) < 0.04);
    if (!match[2] && !currency) return [];
    return [{ oldPrice, line, currency, items }];
  });
}

module.exports = { priceNumber, formatSheetPrice, validPriceMark, visionPriceCandidates };
