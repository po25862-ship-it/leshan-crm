// macOS-only preparation. Published metadata works on any phone/computer.
const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");
const crypto = require("node:crypto");
const { execFileSync } = require("node:child_process");
const modelPath = path.join(__dirname, "../src/lib/propertySheetPrice.js");
const { visionPriceCandidates, validPriceMark } = require(fs.existsSync(modelPath) ? modelPath : "./propertySheetPrice.js");

function bitmap(bytes) {
  if (bytes.length < 54 || bytes.toString("ascii", 0, 2) !== "BM") return null;
  const width = bytes.readInt32LE(18), signedHeight = bytes.readInt32LE(22), height = Math.abs(signedHeight), depth = bytes.readUInt16LE(28);
  if (!(width > 0 && height > 0) || ![24, 32].includes(depth)) return null;
  const compression = bytes.readUInt32LE(30);
  // sips preserves RGBA sources as top-down BITFIELDS BMPs. Accept only the
  // standard BGR byte layout; other masks need a decoder, not guessed colors.
  if (compression !== 0 && !(compression === 3 && depth === 32 && bytes.length >= 66
    && bytes.readUInt32LE(10) >= 66 && bytes.readUInt32LE(54) === 0xff0000
    && bytes.readUInt32LE(58) === 0xff00 && bytes.readUInt32LE(62) === 0xff)) return null;
  const offset = bytes.readUInt32LE(10), stride = Math.ceil(width * depth / 32) * 4, step = depth / 8;
  if (offset + stride * height > bytes.length) return null;
  function dark(x, y) {
    if (x < 0 || x >= width || y < 0 || y >= height) return false;
    const p = offset + (signedHeight < 0 ? y : height - y - 1) * stride + x * step;
    const hi = Math.max(bytes[p], bytes[p + 1], bytes[p + 2]);
    const lo = Math.min(bytes[p], bytes[p + 1], bytes[p + 2]);
    return hi < 235 && hi - lo < 55;
  }
  function red(x, y) {
    if (x < 0 || x >= width || y < 0 || y >= height) return false;
    const p = offset + (signedHeight < 0 ? y : height - y - 1) * stride + x * step;
    const r = bytes[p + 2], g = bytes[p + 1], b = bytes[p];
    return r > 110 && r - g > 35 && r - b > 18;
  }
  return { width, height, dark, red };
}

// Some older company sheets have a vertical sale label and tiny currency glyph
// that Vision omits. Recover only the red amount in the recognizable sale row;
// the same grid and unrelated-content checks below still have to pass.
function unlabeledPriceCandidates(map, lines) {
  const items = lines.filter(l => l && [l.x,l.y,l.width,l.height].every(Number.isFinite)).map(l => ({...l,
    text: String(l.text || "").normalize("NFKC").replace(/\s/g,""), top: 1-l.y-l.height, bottom: 1-l.y}));
  const brand = items.find(l => /台灣房屋/.test(l.text) && l.top < .12);
  if (!brand || !items.some(l => /物件銷售.{0,3}表/.test(l.text) && Math.abs(l.top-brand.top) < .06)) return [];
  return items.flatMap(line => {
    const amount = line.text.match(/^([0-9,]+(?:\.[0-9]+)?)(萬(?:元)?)?$/);
    if (!amount || line.confidence < .5 || line.height < .025 || line.x < .08 || line.x+line.width > .48 || line.top < .08 || line.bottom > .36) return [];
    const oldPrice = Number(amount[1].replace(/,/g,""));
    if (!(oldPrice > 0 && oldPrice <= 100000000)) return [];
    const exclusive = items.some(l => /^專任(?:約)?$/.test(l.text) && l.x >= line.x+line.width && l.x < .7 && Math.abs(l.bottom-line.bottom) < .06);
    const currency = items.find(l => /^[萬萭](?:元)?$/.test(l.text) && l.x >= line.x+line.width-.02 && l.x-line.x-line.width < .10 && Math.abs(l.bottom-line.bottom) < .04);
    const registration = items.some(l => /所有權登記日/.test(l.text) && l.x >= .60 && Math.abs(l.top-line.top) < .09);
    const below = items.filter(l => l.top > line.bottom && l.top-line.bottom < .10 && l.x < .45);
    const building = below.some(l => /主建(?:物)?[:：]/.test(l.text)) || below.some(l => /^◎?主$/.test(l.text) && below.some(other => /^建[:：][\d.]+坪/.test(other.text) && Math.abs(other.top-l.top)<.035));
    if ((!exclusive && !currency && !amount[2]) || !registration || !building) return [];
    let red = 0, neutral = 0, count = 0;
    for (let y=Math.max(0,Math.ceil(line.top*map.height)); y<Math.min(map.height,line.bottom*map.height); y+=2)
      for(let x=Math.max(0,Math.ceil(line.x*map.width)); x<Math.min(map.width,(line.x+line.width)*map.width); x+=2) {
        count++; if(map.red(x,y))red++; else if(map.dark(x,y))neutral++;
      }
    if (red < count*.025 || red/(red+neutral) < .7) return [];
    return [{oldPrice,line,currency:currency || null,items}];
  });
}

function gridRect(map, candidate) {
  const { width: W, height: H, dark } = map;
  const { line, currency } = candidate;
  const x0 = Math.round(line.x * W), x1 = Math.round(Math.max(line.x + line.width, currency ? currency.x + currency.width : 0) * W);
  const y0 = Math.round(line.top * H), y1 = Math.round(Math.max(line.bottom, currency?.bottom || 0) * H);
  function horizontal(y) {
    let count = 0;
    for (let x = x0; x <= x1; x++) {
      for (let delta = -2; delta <= 2; delta++) if (dark(x, y + delta)) { count++; break; }
    }
    return count / (x1 - x0 + 1) > 0.86;
  }
  let top = null, bottom = null;
  for (let y = y0 - 4; y >= Math.max(0, y0 - H * 0.1); y--) if (horizontal(y)) { top = y; break; }
  for (let y = y1 + 4; y <= Math.min(H - 1, y1 + H * 0.1); y++) if (horizontal(y)) { bottom = y; break; }
  if (top === null || bottom === null || bottom - top < H * 0.03 || bottom - top > H * 0.2) return null;
  function vertical(x) {
    let count = 0;
    for (let y = top + 6; y < bottom - 6; y++) {
      for (let delta = -2; delta <= 2; delta++) if (dark(x + delta, y)) { count++; break; }
    }
    return count / (bottom - top - 12) > 0.85;
  }
  let left = null, right = null;
  for (let x = x0 - 4; x >= Math.max(0, x0 - W * 0.18); x--) if (vertical(x)) { left = x; break; }
  for (let x = x1 + 4; x <= Math.min(W - 1, x1 + W * 0.25); x++) if (vertical(x)) { right = x; break; }
  if (left === null || right === null) return null;
  const rect = { x: (left + 2) / W, y: (top + 2) / H, width: (right - left - 4) / W, height: (bottom - top - 4) / H };
  if (line.x < rect.x - 0.004 || line.x + line.width > rect.x + rect.width + 0.004 || line.top < rect.y - 0.004 || line.bottom > rect.y + rect.height + 0.004) return null;
  // A cell containing other information is not safe to paint over.
  const unrelatedItems = candidate.items.filter((l) => {
    const cx = l.x + l.width / 2, cy = (l.top + l.bottom) / 2;
    return cx > rect.x && cx < rect.x + rect.width && cy > rect.y && cy < rect.y + rect.height
      && !/^(?:售價|總價|開價|售|價|萬|萬元)[:：]?$/.test(l.text) && l !== line && l !== currency;
  });
  if (!unrelatedItems.length) return rect;
  // Do not erase extra area/unit-price notes inside the same table cell.
  // Cover only the recognized amount and currency, with a small white margin.
  const tight = {
    x: Math.max(rect.x, line.x-.006),
    y: Math.max(rect.y, line.top-line.height*.20),
  };
  tight.width = Math.min(rect.x+rect.width, Math.max(line.x+line.width,currency ? currency.x+currency.width : 0)+.008)-tight.x;
  tight.height = Math.min(rect.y+rect.height, Math.max(line.bottom,currency?.bottom || 0)+line.height*.10)-tight.y;
  const overlaps = unrelatedItems.some(l => l.x < tight.x+tight.width && l.x+l.width > tight.x && l.top < tight.y+tight.height && l.bottom > tight.y);
  return overlaps || tight.width < .08 || tight.height < .025 ? null : tight;
}

function analyzePropertySheet(file, lines, expectedHash = "") {
  const sourceHash = crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");
  if (expectedHash && sourceHash !== expectedHash) return null;
  const candidates = visionPriceCandidates(lines);
  if (candidates.length > 1) return null;
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "leshan-price-grid-"));
  try {
    const output = path.join(dir, "source.bmp");
    execFileSync("/usr/bin/sips", ["-Z", "1200", "-s", "format", "bmp", file, "--out", output], { stdio: "ignore", timeout: 20000 });
    const map = bitmap(fs.readFileSync(output));
    if (!map) return null;
    const selected = candidates.length ? candidates : unlabeledPriceCandidates(map,lines);
    if (selected.length !== 1) return null;
    const rect = gridRect(map, selected[0]);
    return rect ? validPriceMark({ schema: 1, page: 0, sourceHash, oldPrice: selected[0].oldPrice, rect }) : null;
  } catch { return null; }
  finally { fs.rmSync(dir, { recursive: true, force: true }); }
}

function cachedPropertySheetPrice(file, lines, sourceHash, cacheDir) {
  const cacheFile = path.join(cacheDir, `${sourceHash}.json`);
  try {
    const saved = JSON.parse(fs.readFileSync(cacheFile, "utf8"));
    if (saved.detectorVersion === 4 && (saved.mark === null || validPriceMark(saved.mark))) return saved.mark;
  } catch { /* A missing/older preparation is safe to recompute. */ }
  const mark = analyzePropertySheet(file, lines, sourceHash);
  fs.mkdirSync(cacheDir, { recursive: true });
  fs.writeFileSync(cacheFile, JSON.stringify({ detectorVersion: 4, mark }), { mode: 0o600 });
  return mark;
}

module.exports = { analyzePropertySheet, cachedPropertySheetPrice, bitmap, gridRect, unlabeledPriceCandidates };
if (require.main === module) {
  const [file, linesFile] = process.argv.slice(2);
  process.stdout.write(JSON.stringify(analyzePropertySheet(file, JSON.parse(fs.readFileSync(linesFile, "utf8")))) + "\n");
}
