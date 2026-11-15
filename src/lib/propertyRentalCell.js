// Find an empty grid cell beside a large red quote. Scan the current image,
// never cached coordinates. Non-empty/ambiguous layouts use a separate header.
export function detectBlankRentalCell({ width: W, height: H, data }) {
  if (!(W >= 160 && H > W && H < W * 2.2) || !data || data.length < W * H * 4) return null;
  const pixel = (x, y) => (Math.max(0, Math.min(H - 1, Math.round(y))) * W + Math.max(0, Math.min(W - 1, Math.round(x)))) * 4;
  const dark = (x, y) => { const p = pixel(x, y), hi = Math.max(data[p], data[p + 1], data[p + 2]), lo = Math.min(data[p], data[p + 1], data[p + 2]); return hi < 210 && hi - lo < 65; };
  const grouped = values => {
    const groups = []; values.forEach(value => { const last = groups[groups.length - 1]; if (!last || value - last[last.length - 1] > 3) groups.push([value]); else last.push(value); });
    return groups.map(group => Math.round((group[0] + group[group.length - 1]) / 2));
  };
  const horizontal = [];
  for (let y = Math.round(H * .09); y <= H * .34; y++) {
    let count = 0, total = 0;
    for (let x = Math.round(W * .055); x <= W * .965; x += 2) { total++; if ([-2, -1, 0, 1, 2].some(d => dark(x, y + d))) count++; }
    if (count / total > .84) horizontal.push(y);
  }
  const rows = grouped(horizontal), candidates = [];
  for (let n = 0; n < rows.length - 1; n++) {
    const top = rows[n], bottom = rows[n + 1];
    if (top < H * .11 || bottom > H * .32 || bottom - top < H * .04 || bottom - top > H * .14) continue;
    const vertical = [];
    for (let x = Math.round(W * .04); x < W * .98; x++) {
      let count = 0, total = 0;
      for (let y = top + 5; y < bottom - 5; y += 2) { total++; if ([-2, -1, 0, 1, 2].some(d => dark(x + d, y))) count++; }
      if (count / total > .85) vertical.push(x);
    }
    const cols = grouped(vertical);
    for (let i = 2; i < cols.length - 2; i++) {
      const left = cols[i], right = cols[i + 1], priceLeft = cols[i - 1];
      if (left < W * .35 || left > W * .58 || right > W * .81 || right - left < W * .16 || right - left > W * .35 || left - priceLeft < W * .20 || left - priceLeft > W * .43 || priceLeft - cols[i - 2] > W * .13 || cols[i + 2] - right < W * .15) continue;
      let red = 0, pricePixels = 0, ink = 0, blankPixels = 0;
      for (let y = top + 6; y < bottom - 6; y += 2) {
        for (let x = priceLeft + 5; x < left - 5; x += 2) { const p = pixel(x, y); pricePixels++; if (data[p] > 130 && data[p] - data[p + 1] > 40 && data[p] - data[p + 2] > 25) red++; }
        for (let x = left + 6; x < right - 6; x += 2) { const p = pixel(x, y); blankPixels++; if (Math.min(data[p], data[p + 1], data[p + 2]) < 225) ink++; }
      }
      if (red / pricePixels < .02 || ink / blankPixels > .006) continue;
      const padX = Math.max(5, W * .008), padY = Math.max(4, H * .004);
      candidates.push({ x: (left + padX) / W, y: (top + padY) / H, width: (right - left - 2 * padX) / W, height: (bottom - top - 2 * padY) / H });
    }
  }
  return candidates.length === 1 ? candidates[0] : null;
}
