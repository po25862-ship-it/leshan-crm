// macOS-only preparation. Published metadata works on any phone/computer.
const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");
const crypto = require("node:crypto");
const { execFileSync } = require("node:child_process");
const modelPath = path.join(__dirname, "../src/lib/propertySheetPrice.js");
const { visionPriceCandidates, validPriceMark } = require(fs.existsSync(modelPath) ? modelPath : "./propertySheetPrice.js");

function bitmap(bytes) {
  if (bytes.toString("ascii", 0, 2) !== "BM" || bytes.readUInt32LE(30) !== 0) return null;
  const width = bytes.readInt32LE(18), signedHeight = bytes.readInt32LE(22), height = Math.abs(signedHeight), depth = bytes.readUInt16LE(28);
  if (!(width > 0 && height > 0) || ![24, 32].includes(depth)) return null;
  const offset = bytes.readUInt32LE(10), stride = Math.ceil(width * depth / 32) * 4, step = depth / 8;
  if (offset + stride * height > bytes.length) return null;
  function dark(x, y) {
    if (x < 0 || x >= width || y < 0 || y >= height) return false;
    const p = offset + (signedHeight < 0 ? y : height - y - 1) * stride + x * step;
    const hi = Math.max(bytes[p], bytes[p + 1], bytes[p + 2]);
    const lo = Math.min(bytes[p], bytes[p + 1], bytes[p + 2]);
    return hi < 235 && hi - lo < 55;
  }
  return { width, height, dark };
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
  const unrelated = candidate.items.some((l) => {
    const cx = l.x + l.width / 2, cy = (l.top + l.bottom) / 2;
    return cx > rect.x && cx < rect.x + rect.width && cy > rect.y && cy < rect.y + rect.height
      && !/^(?:售價|總價|開價|售|價|萬|萬元)[:：]?$/.test(l.text) && l !== line && l !== currency;
  });
  return unrelated ? null : rect;
}

function analyzePropertySheet(file, lines, expectedHash = "") {
  const sourceHash = crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");
  if (expectedHash && sourceHash !== expectedHash) return null;
  const candidates = visionPriceCandidates(lines);
  if (candidates.length !== 1) return null;
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "leshan-price-grid-"));
  try {
    const output = path.join(dir, "source.bmp");
    execFileSync("/usr/bin/sips", ["-Z", "1200", "-s", "format", "bmp", file, "--out", output], { stdio: "ignore", timeout: 20000 });
    const map = bitmap(fs.readFileSync(output));
    if (!map) return null;
    const rect = gridRect(map, candidates[0]);
    return rect ? validPriceMark({ schema: 1, page: 0, sourceHash, oldPrice: candidates[0].oldPrice, rect }) : null;
  } catch { return null; }
  finally { fs.rmSync(dir, { recursive: true, force: true }); }
}

function cachedPropertySheetPrice(file, lines, sourceHash, cacheDir) {
  const cacheFile = path.join(cacheDir, `${sourceHash}.json`);
  try {
    const saved = JSON.parse(fs.readFileSync(cacheFile, "utf8"));
    if (saved.detectorVersion === 1 && (saved.mark === null || validPriceMark(saved.mark))) return saved.mark;
  } catch { /* A missing/older preparation is safe to recompute. */ }
  const mark = analyzePropertySheet(file, lines, sourceHash);
  fs.mkdirSync(cacheDir, { recursive: true });
  fs.writeFileSync(cacheFile, JSON.stringify({ detectorVersion: 1, mark }), { mode: 0o600 });
  return mark;
}

module.exports = { analyzePropertySheet, cachedPropertySheetPrice, bitmap, gridRect };
if (require.main === module) {
  const [file, linesFile] = process.argv.slice(2);
  process.stdout.write(JSON.stringify(analyzePropertySheet(file, JSON.parse(fs.readFileSync(linesFile, "utf8")))) + "\n");
}
