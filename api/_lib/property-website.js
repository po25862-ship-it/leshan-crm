const { parse } = require("parse5");
const MAX_BYTES = 2000000;
const validListingNo = value => typeof value === "string" && /^[A-Z][A-Z0-9]{6,13}$/.test(value);
const officialUrl = id => validListingNo(id) ? `https://www.twhg.com.tw/buy/${id}` : "";

function inspectOfficialHtml(html, listingNo, httpStatus = 200) {
  if (!validListingNo(listingNo)) return "unknown";
  if ([401, 403, 429].includes(httpStatus)) return "unknown";
  if ([404, 410].includes(httpStatus)) return "unlisted";
  if (httpStatus !== 200 || typeof html !== "string" || !html) return "unknown";
  let title = "", canonical = "", ogUrl = "";
  const walk = node => {
    const attrs = Object.fromEntries((node.attrs || []).map(a => [a.name, a.value]));
    if (node.tagName === "title") title = (node.childNodes || []).map(n => n.value || "").join("");
    if (node.tagName === "link" && attrs.rel === "canonical") canonical = attrs.href || "";
    if (node.tagName === "meta" && attrs.property === "og:url") ogUrl = attrs.content || "";
    (node.childNodes || []).forEach(walk);
  };
  walk(parse(html));
  if (/captcha|access denied|安全驗證|人機驗證|just a moment/i.test(title)) return "unknown";
  const matchesId = value => { try { const u = new URL(value); return ["www.twhg.com.tw", "twhg.com.tw"].includes(u.hostname) && u.pathname.replace(/\/$/, "") === `/buy/${listingNo}`; } catch { return false; } };
  if ((matchesId(canonical) || matchesId(ogUrl)) && /出售.*台灣房屋/.test(title) && /詳細資料/.test(html) && /建坪/.test(html)) return "live";
  // Related listings can appear even on an unavailable page; never use their IDs as evidence.
  if (/物件(?:已下架|不存在)|找不到.*物件|查無此物件/.test(title)) return "unlisted";
  return "unknown";
}

async function checkOfficialWebsite(listingNo, { fetcher = fetch, now = () => new Date().toISOString() } = {}) {
  const url = officialUrl(listingNo);
  if (!url) throw new Error("unsupported_listing");
  const response = await fetcher(url, { redirect: "manual", signal: AbortSignal.timeout(15000), headers: { Accept: "text/html", "User-Agent": "LeshanCRM-WebsiteCheck/1.0" } });
  let status = "unknown";
  if ([301, 302, 303, 307, 308].includes(response.status)) {
    const destination = new URL(response.headers.get("location") || "", url);
    if (destination.hostname === "www.twhg.com.tw" && /^\/buy\/(?:list|list\/.*)$/.test(destination.pathname)) status = "unlisted";
  } else if ([404, 410].includes(response.status)) status = "unlisted";
  else if (response.ok && /text\/html/i.test(response.headers.get("content-type") || "")) {
    if (Number(response.headers.get("content-length") || 0) > MAX_BYTES) throw new Error("source_too_large");
    const chunks = []; let size = 0;
    for await (const chunk of response.body) { size += chunk.length; if (size > MAX_BYTES) throw new Error("source_too_large"); chunks.push(chunk); }
    status = inspectOfficialHtml(Buffer.concat(chunks).toString("utf8"), listingNo, response.status);
  }
  return { listingNo, url, status, checkedAt: now(), source: "officialPage" };
}
module.exports = { validListingNo, officialUrl, inspectOfficialHtml, checkOfficialWebsite };
