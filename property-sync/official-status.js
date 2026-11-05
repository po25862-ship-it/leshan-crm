const { decode } = require("html-entities");
const plain = value => decode(String(value || "").replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim();

function parseOfficialStatusRows(html, checkedAt = new Date().toISOString()) {
  const statuses = new Map();
  let officialColumn = -1;
  for (const row of String(html || "").match(/<tr\b[\s\S]*?<\/tr>/gi) || []) {
    const cells = [...row.matchAll(/<t[dh]\b[^>]*>([\s\S]*?)<\/t[dh]>/gi)].map(match => match[1]);
    const header = cells.findIndex(cell => plain(cell).replace(/\s/g, "").includes("官網點閱"));
    if (header >= 0) { officialColumn = header; continue; }
    if (officialColumn < 0 || cells.length <= officialColumn) continue;
    const listingNo = plain(cells[1]).match(/\b([A-Z][A-Z0-9]{6,13})\b/)?.[1];
    if (!listingNo) continue;
    const cell = cells[officialColumn];
    const links = [...cell.matchAll(/<a\b[^>]*href\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/gi)].map(m => decode(m[1] || m[2] || m[3] || ""));
    const official = links.some(link => { try { const u = new URL(link); return ["www.twhg.com.tw", "twhg.com.tw"].includes(u.hostname) && u.pathname === `/buy/${listingNo}`; } catch { return false; } });
    // A changed/foreign link is inconclusive. A plain count, even nonzero, is not a hyperlink.
    if (links.length && !official) continue;
    const countText = plain(cell);
    statuses.set(listingNo, { websitePublished: official, officialViewCount: /^\d+$/.test(countText) ? Number(countText) : null, officialStatusCheckedAt: checkedAt, officialStatusSource: "backendReport" });
  }
  return statuses;
}
function officialStatusFields(record) {
  if (typeof record?.websitePublished !== "boolean" || !Number.isFinite(Date.parse(record.officialStatusCheckedAt))) return null;
  const fields = { websitePublished: record.websitePublished, websiteUrl: `https://www.twhg.com.tw/buy/${record.listingNo}`, officialStatusCheckedAt: record.officialStatusCheckedAt };
  if (record.officialStatusSource) fields.officialStatusSource = record.officialStatusSource;
  if (record.officialViewCount !== undefined) fields.officialViewCount = record.officialViewCount;
  return fields;
}
module.exports = { parseOfficialStatusRows, officialStatusFields };
