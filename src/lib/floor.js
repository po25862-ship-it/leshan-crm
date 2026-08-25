// 樓別欄位的共用解析工具。案件控台的物件搜尋、客需的系統配對都會用到，
// 抽成共用檔避免兩邊各寫一份、改一邊忘了改另一邊。
// 樓別格式通常是「5/5」（所在樓層/總樓層），也可能直接打「頂樓」文字。

// 取所在樓層數字，給樓層搜尋用
export function parseFloor(floor) {
  if (!floor) return null;
  const m = String(floor).match(/-?\d+/);
  return m ? parseInt(m[0], 10) : null;
}

// 判斷是不是頂樓：樓別欄位裡直接打「頂樓」文字，或是「5/5」這種所在樓層等於總樓層的格式
export function isTopFloor(floor) {
  if (!floor) return false;
  const s = String(floor);
  if (s.includes("頂")) return true;
  const parts = s.split("/").map((p) => p.trim());
  if (parts.length >= 2) {
    const cur = parseInt(parts[0], 10);
    const total = parseInt(parts[1], 10);
    if (Number.isFinite(cur) && Number.isFinite(total) && total > 0) {
      return cur === total;
    }
  }
  return false;
}
