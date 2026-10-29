const { createDecipheriv } = require("node:crypto");
const { gunzipSync } = require("node:zlib");

function chineseNumber(text) {
  const digits = { 零: 0, 〇: 0, 一: 1, 二: 2, 兩: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9 };
  if (!/[十百]/.test(text)) return [...text].map((ch) => digits[ch]).join("");
  let total = 0, number = 0;
  for (const ch of text) {
    if (ch === "十" || ch === "百") { total += (number || 1) * (ch === "十" ? 10 : 100); number = 0; }
    else number = digits[ch];
  }
  return String(total + number);
}

function normalize(value) {
  return String(value || "").normalize("NFKC").replace(/臺/g, "台")
    .replace(/(\d)\s+(?=\d)/g, "$1#").replace(/[\s　,，。．|｜、]/g, "")
    .replace(/[零〇一二兩三四五六七八九十百]+/g, chineseNumber)
    .replace(/(\d+)[-－](\d+)號/g, "$1之$2號");
}

function addressParts(address, regions) {
  let rest = normalize(address).replace(/^\d{3,6}(?=\D)/, "");
  for (const [old, current] of Object.entries(regions.oldCities || {})) {
    if (rest.startsWith(old)) { rest = current + rest.slice(old.length); break; }
  }
  let city = "", district = "";
  for (const [key, label] of regions.cities) {
    if (rest.startsWith(key)) { city = label; rest = rest.slice(key.length); break; }
  }
  for (const [key, label, parent] of regions.districts) {
    if (city && city !== parent) continue;
    const stem = key.slice(0, -1);
    const prefix = [key, stem + "鄉", stem + "鎮", stem + "市"].find((p) => rest.startsWith(p));
    if (prefix) { district = label; rest = rest.slice(prefix.length); break; }
  }
  const village = rest.match(/^(?:[^\d路街巷弄號]{1,3}[里村])?(?:\d+鄰)?/);
  if (village?.[0]) {
    const next = rest.slice(village[0].length);
    if (next && !/^[路街]/.test(next) && /路|街|大道/.test(next)) rest = next;
  }
  const match = rest.match(/^(.*?(?:路|街|大道)(?:\d+段)?(?:\d+巷)?(?:\d+弄)?)(\d+)(?:之(\d+))?號(?:之(\d+))?/);
  const sub = match && (match[3] || match[4]);
  return { district, base: match ? `${match[1]}${match[2]}${sub ? `之${sub}` : ""}號` : "" };
}

function decryptSnapshot(envelope, secret) {
  if (!secret || envelope?.schema !== 1) throw new Error("cloud_reference_not_configured");
  const key = Buffer.from(secret.trim(), "base64url");
  if (key.length !== 32) throw new Error("invalid_snapshot_key");
  const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(envelope.iv, "base64"));
  decipher.setAuthTag(Buffer.from(envelope.tag, "base64"));
  const compressed = Buffer.concat([decipher.update(Buffer.from(envelope.data, "base64")), decipher.final()]);
  const data = JSON.parse(gunzipSync(compressed, { maxOutputLength: 16 * 1024 * 1024 }).toString("utf8"));
  if (data.schema !== 1 || !data.communities || !data.doors || !data.uniqueDoors || !data.names || !Array.isArray(data.regions?.cities) || !Array.isArray(data.regions?.districts) || !Number.isFinite(data.snapshotAt)) throw new Error("invalid_cloud_reference");
  return data;
}

function lookupSnapshot(query, snapshot, now = Date.now()) {
  const parsed = addressParts(query.address, snapshot.regions);
  const district = parsed.district || query.district || "";
  let id = parsed.base && (district ? snapshot.doors[`${district}|${parsed.base}`] : snapshot.uniqueDoors[parsed.base]);
  let method = "exact-doorplate";
  if (!id && query.communityName) {
    const hits = (snapshot.names[normalize(query.communityName)] || [])
      .filter((cid) => !district || snapshot.communities[cid]?.district === district);
    if (hits.length > 1) return result(null, [], "ambiguous_community");
    id = hits[0]; method = "exact-community-name";
  }
  const entry = id && snapshot.communities[id];
  if (!entry) return result(null, [], "community_not_found");
  return { ...result(entry.community, entry.deals), matchMethod: method, years: entry.years };

  function result(community, deals, reason) {
    return { community, deals, ...(reason ? { reason } : {}), sourceMode: "cloud-snapshot",
      snapshotAt: snapshot.snapshotAt, source: snapshot.source, version: snapshot.version,
      publishedDate: snapshot.publishedDate, years: [], fetchedAt: now };
  }
}

module.exports = { normalize, addressParts, decryptSnapshot, lookupSnapshot };
