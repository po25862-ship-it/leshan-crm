export function displayPropertyAgent(value) {
  const text = String(value ?? "").replace(/&#(?:x([0-9a-f]+)|([0-9]+));/gi, (match, hex, decimal) => {
    const codePoint = Number.parseInt(hex || decimal, hex ? 16 : 10);
    return codePoint > 0 && codePoint <= 0x10ffff ? String.fromCodePoint(codePoint) : match;
  }).replace(/&nbsp;/gi, " ").trim();

  return text || "尚未填寫";
}
