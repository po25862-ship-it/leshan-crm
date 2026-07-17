// 在網址後面加上業務員代碼參數。
// 這個函式在「顯示/開啟連結」跟「寫入資料庫」兩種情境都會用到，
// 已經有 agid 的網址會直接跳過，不會重複疊加。
export function withAgid(url) {
  if (!url) return url;
  if (url.includes("agid=")) return url; // 已經有了就不重複加
  const hasQuery = url.includes("?");
  return url + (hasQuery ? "&" : "?") + "agid=06459";
}
