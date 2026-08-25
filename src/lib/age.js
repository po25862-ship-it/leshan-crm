// 屋齡欄位的共用解析工具。案件控台的物件搜尋、客需的系統配對都會用到，
// 抽成共用檔避免兩邊各寫一份、改一邊忘了改另一邊（跟 floor.js 是同樣的做法）。
// 屋齡格式通常是「12年3個月」這種自由輸入文字，優先取「年」前面的數字，
// 找不到「年」的話就取字串裡第一個數字（例如直接填 "15"）。
export function parseAge(age) {
  if (!age && age !== 0) return null;
  const s = String(age);
  const yearMatch = s.match(/(\d+(?:\.\d+)?)\s*年/);
  if (yearMatch) return parseFloat(yearMatch[1]);
  const m = s.match(/\d+(?:\.\d+)?/);
  return m ? parseFloat(m[0]) : null;
}
