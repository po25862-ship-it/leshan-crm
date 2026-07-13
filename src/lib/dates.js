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
