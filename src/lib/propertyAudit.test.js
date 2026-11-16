import { AUDIT_FIELDS, UNASSIGNED_AUDIT_AGENT, auditAgentNames, auditAgentOptions, auditCheckState, auditFingerprint, auditProgress, auditMoney, auditWebsiteLabel, auditWebsiteUrl, filterAuditRows, groupAuditRows, duplicateAuditCodes, withoutPropertyAudit } from "./propertyAudit";
const row = { id: "p1", store: "捷運樂善直營店", listingNo: "DE02601414", title: "金捷市兩房車", address: "桃園市龜山區樂善二路１８５號十七樓", totalPrice: 1650, websitePublished: true, websiteUrl: "https://www.twhg.com.tw/buy/DE02601414?agid=06459" };
const complete = source => ({ ...source, auditChecklist: { checks: Object.fromEntries(AUDIT_FIELDS.map(field => [field.key, { checked: true, fingerprint: auditFingerprint(source, field.key), byName: "同事甲" }])) } });
test("store, status and keyword filters match the printed count; legacy active cases remain visible", () => {
  const rows = [row, { ...row, id: "p2", status: "onHold", title: "文化二路店面" }, { ...row, id: "p3", store: "其他分店" }];
  expect(filterAuditRows(rows)).toEqual([row]);
  expect(filterAuditRows(rows, { status: "all", query: "文化二路" })[0].id).toBe("p2");
  expect(filterAuditRows(rows, { status: "onHold" })).toHaveLength(1);
  expect(filterAuditRows(rows, { query: "ｄｅ０２６０１４１４" })).toHaveLength(1);
});
test("a changed price requires new mandate, website and countersign checks, without invalidating the address seal", () => {
  const previous = complete(row), changed = { ...previous, totalPrice: 1598 };
  expect(auditProgress(previous)).toMatchObject({ complete: true, done: 4, stale: false });
  expect(auditProgress(changed)).toMatchObject({ complete: false, done: 1, stale: true });
  expect(auditCheckState(changed, "titleSeal").checked).toBe(true);
  expect(auditCheckState(changed, "mandate")).toMatchObject({ checked: false, stale: true, by: "同事甲" });
  expect(auditProgress({ ...previous, address: "新門牌" }).done).toBe(0);
});
test("system website state and human verification are separate, and unsafe links cannot open", () => {
  const unlisted = { ...complete(row), websitePublished: false };
  expect(auditWebsiteLabel(unlisted)).toBe("未上架");
  expect(auditCheckState(unlisted, "website").checked).toBe(false);
  expect(auditProgress({ ...complete(row), websiteUrl: row.websiteUrl.replace("06459", "1234") }).done).toBe(4);
  expect(auditWebsiteUrl({ websiteUrl: "javascript:alert(1)" })).toBe("");
  expect(auditWebsiteLabel({})).toBe("待確認");
});
test("duplicates stay visible for review without silently deleting or merging source records", () => {
  const rows = [row, { ...row, id: "p2", status: "onHold" }];
  expect(duplicateAuditCodes(rows).get(row.listingNo)).toBe(2);
  expect(filterAuditRows(rows, { status: "all", review: "duplicates" })).toHaveLength(2);
  expect(filterAuditRows([complete(row)], { review: "pending" })).toHaveLength(0);
});
test("blank prices are not represented as zero and normal property saves omit old audit snapshots", () => {
  expect(auditMoney(row)).toBe("1,650 萬");
  expect(auditMoney({ totalPrice: "" })).toBe("待補價格");
  expect(withoutPropertyAudit(complete(row))).not.toHaveProperty("auditChecklist");
  expect(withoutPropertyAudit(complete(row))).toMatchObject({ totalPrice: 1650, address: row.address });
});
test("agent identity ignores phone formatting and decodes names without guessing a primary agent", () => {
  expect(auditAgentNames({agentInfo:"劉昭佑 03-3288283．董 韋 伶 03-3288283"})).toEqual(["劉昭佑", "董韋伶"]);
  expect(auditAgentNames({agentInfo:"阮&#23032;臻 03-3281000、阮姸臻 03-3281000"})).toEqual(["阮姸臻"]);
  expect(auditAgentNames({agentInfo:"董韋伶 03-3288283 劉昭佑 03-3288283"})).toEqual(["董韋伶", "劉昭佑"]);
  expect(auditAgentNames({agentInfo:"03-3288283"})).toEqual([]);
});
test("each colleague can find jointly responsible properties; full grouped list retains each property once", () => {
  const rows=[{...row,id:"a",agentInfo:"董韋伶 03-3288283"},{...row,id:"b",agentInfo:"劉昭佑 03-3288283.董韋伶 03-3288283"},{...row,id:"c",agentInfo:"董韋伶 03-3288283、劉昭佑 03-3288283"},{...row,id:"d",agentInfo:""}];
  expect(filterAuditRows(rows,{agent:"董韋伶"}).map(r=>r.id)).toEqual(["a","b","c"]);
  expect(filterAuditRows(rows,{agent:"劉昭佑"}).map(r=>r.id)).toEqual(["b","c"]);
  expect(filterAuditRows(rows,{agent:UNASSIGNED_AUDIT_AGENT}).map(r=>r.id)).toEqual(["d"]);
  expect(auditAgentOptions(rows).find(o=>o.value==="董韋伶").count).toBe(3);
  const grouped=groupAuditRows(rows);
  expect(grouped.flatMap(g=>g.rows)).toHaveLength(4);
  expect(new Set(grouped.flatMap(g=>g.rows.map(r=>r.id))).size).toBe(4);
  expect(grouped.find(g=>g.shared).rows.map(r=>r.id)).toEqual(["b","c"]);
  expect(grouped.at(-1).key).toBe(UNASSIGNED_AUDIT_AGENT);
  expect(groupAuditRows(filterAuditRows(rows,{agent:"董韋伶"}),"董韋伶")).toMatchObject([{label:"董韋伶",startIndex:0,rows:expect.any(Array)}]);
});
