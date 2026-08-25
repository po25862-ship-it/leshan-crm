// 手機上原本沿用桌機的小字級距（9~13px 居多）看起來太小，這裡統一放大一點，
// 讓「客需」相關頁面在手機上比較容易看清楚。桌機（isMobile === false）維持原本大小。
export function mobileFontSize(px, isMobile) {
  if (!isMobile) return px;
  if (px <= 10) return px + 4;
  if (px <= 12) return px + 3;
  return px + 2;
}
