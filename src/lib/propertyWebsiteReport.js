const validNo = value => typeof value === "string" && /^[A-Z][A-Z0-9]{6,13}$/.test(value);

export function analyzeWebsiteReport(payload, properties, now = Date.now()) {
  if (payload?.schema !== "leshan-official-status-v1" || !Array.isArray(payload.records) || payload.records.length > 5000) throw new Error("請選擇公司官網狀態核對檔，檔案格式不正確。");
  const byNo = new Map();
  properties.forEach(p => { if (!byNo.has(p.listingNo)) byNo.set(p.listingNo, []); byNo.get(p.listingNo).push(p); });
  const seen = new Set(), updates = [];
  let matched = 0, unchanged = 0, skipped = 0;
  for (const r of payload.records) {
    if (!validNo(r.listingNo) || seen.has(r.listingNo)) throw new Error("委託編號重複或格式不正確，請重新整理核對檔。");
    seen.add(r.listingNo);
    const checked = Date.parse(r.officialStatusCheckedAt);
    const expectedUrl = `https://www.twhg.com.tw/buy/${r.listingNo}`;
    if (typeof r.websitePublished !== "boolean" || !Number.isFinite(checked) || checked > now + 300000 ||
        !["backendReport", "officialPage"].includes(r.officialStatusSource) || r.websiteUrl !== expectedUrl) throw new Error("核對檔缺少可靠的上架狀態、檢查時間或正確官網網址。");
    const matches = byNo.get(r.listingNo) || [];
    if (!matches.length) { skipped++; continue; }
    matched++;
    for (const property of matches) {
      if (property.websitePublished === r.websitePublished && String(property.websiteUrl || "").split("?")[0] === expectedUrl) { unchanged++; continue; }
      if (typeof property.websitePublished === "boolean" && checked < Date.parse(property.officialStatusCheckedAt || "")) { skipped++; continue; }
      updates.push({ id: property.id, listingNo: r.listingNo, title: property.title, patch: {
        websitePublished: r.websitePublished, websiteUrl: expectedUrl,
        officialStatusCheckedAt: r.officialStatusCheckedAt, officialStatusSource: r.officialStatusSource,
      } });
    }
  }
  return { matched, unchanged, skipped, updates };
}
