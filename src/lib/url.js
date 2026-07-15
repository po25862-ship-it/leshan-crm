// 在網址後面加上業務員代碼參數（開啟連結時才加，不改動存進資料庫的原始網址）
export function withAgid(url) {
  if (!url) return url;
  if (url.includes("agid=")) return url; // 已經有了就不重複加
  const hasQuery = url.includes("?");
  return url + (hasQuery ? "&" : "?") + "agid=06459";
}
