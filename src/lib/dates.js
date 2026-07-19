// 計算兩個日期字串（YYYY-MM-DD）之間相差的天數
export function daysSince(dateStr) {
  if (!dateStr) return null;
  const then = new Date(dateStr + "T00:00:00");
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  const diff = Math.floor((now - then) / (1000 * 60 * 60 * 24));
  return diff;
}

export function daysUntil(dateStr) {
  if (!dateStr) return null;
  return -daysSince(dateStr);
}

export function todayStr() {
  const d = new Date();
  return d.toISOString().slice(0, 10);
}

export function formatDate(dateStr) {
  if (!dateStr) return "—";
  const [y, m, d] = dateStr.split("-");
  return `${m}/${d}`;
}

// 民國年的簡短格式，例如 2026-11-14 -> 116/11/14
export function formatDateRoc(dateStr) {
  if (!dateStr) return "—";
  const [y, m, d] = dateStr.split("-");
  const rocYear = Number(y) - 1911;
  if (!rocYear || rocYear <= 0) return `${m}/${d}`;
  return `${rocYear}/${m}/${d}`;
}

// 把 YYYY-MM-DD 轉成「民國OO年O月O日」文字，給日期欄位旁邊當參考用
export function toRocDateStr(dateStr) {
  if (!dateStr) return "";
  const parts = dateStr.split("-").map(Number);
  const y = parts[0], m = parts[1], d = parts[2];
  if (!y || !m || !d) return "";
  const rocYear = y - 1911;
  if (rocYear <= 0) return "";
  return `民國${rocYear}年${m}月${d}日`;
}

// 給一個「每月第幾號」，算出下一次到期的日期字串（YYYY-MM-DD）
// 如果這個月的日期還沒到，就回傳這個月；已經過了，就回傳下個月
export function nextMonthlyDueDate(day) {
  if (!day) return null;
  const n = Number(day);
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  let candidate = new Date(now.getFullYear(), now.getMonth(), n);
  if (candidate < now) {
    candidate = new Date(now.getFullYear(), now.getMonth() + 1, n);
  }
  const pad = (x) => String(x).padStart(2, "0");
  return `${candidate.getFullYear()}-${pad(candidate.getMonth() + 1)}-${pad(candidate.getDate())}`;
}
