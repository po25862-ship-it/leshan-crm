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
