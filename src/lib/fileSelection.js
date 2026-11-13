export function fileSelectionProblem(files, { accept = "", multiple = true, maxFiles, maxBytes } = {}) {
  if (!files.length) return "請拖入或選擇本機檔案。";
  if ((!multiple && files.length > 1) || (maxFiles && files.length > maxFiles)) return `一次最多選擇 ${multiple ? maxFiles : 1} 份檔案。`;
  const allowed = accept.toLowerCase().split(",").map(value => value.trim()).filter(Boolean);
  for (const file of files) {
    if (!file.size) return `「${file.name}」是空白檔案，請重新選擇。`;
    if (allowed.length && !allowed.some(type => type.startsWith(".") ? file.name.toLowerCase().endsWith(type) : type.endsWith("/*") ? (file.type || "").toLowerCase().startsWith(type.slice(0, -1)) : (file.type || "").toLowerCase() === type)) return `「${file.name}」格式不支援，請依上方說明選擇檔案。`;
    if (maxBytes && file.size > maxBytes) return `「${file.name}」超過每份 ${Math.round(maxBytes / 1000000)} MB 的限制。`;
  }
  return "";
}
