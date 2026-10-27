function managementFeeFromLines(lines) {
  const index = lines.findIndex((line) => /^管理費\s*[：:]/.test(line));
  if (index < 0) return "";
  let value = lines[index].replace(/^管理費\s*[：:]\s*/, "").trim();
  if (!value && /^(?:[\d０-９]|無|免|依|按|另計|面議|含|每)/.test(lines[index + 1] || "") && !/[：:]/.test(lines[index + 1])) value = lines[index + 1];
  value = value.split(/(?:有無車位|有無天然瓦斯|附贈物|鄰近門顯店名)\s*[：:]/)[0].trim();
  if (!value || /^(?:[-—–\s]*(?:元(?:\s*[/／]\s*(?:月|年|季))?)?|不詳|未提供|未填|待確認|無資料)$/.test(value)) return "";
  return value;
}

module.exports = { managementFeeFromLines };
