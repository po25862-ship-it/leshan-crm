import { buildPriorityAssessments, cachedPriorityReference, compactPriorityReference, countPriorityGroups, loadPriorityReferences, matchesPriorityFilter, priorityGroup, priorityReferenceKey, refreshPriorityReferences, savePriorityReferences } from "./propertyPriorityWorklist";

const now = Date.parse("2026-10-29T04:00:00Z");
const property = { id: "p", area: "A7重劃區", address: "桃園市龜山區文青路222號", communityName: "測試社區", category: "電梯大樓", totalPrice: 1500, titlePing: 50, parkingPrice: 200, parkingPing: 10, layout: "3/2/2", viewingStatus: "available", viewingConfirmedAt: "2026-10-28" };
const deal = { id: "one", date: "2026-09-01", type: "住宅大樓", use: "住家用", area: 50, price: 16000000, parkingPrice: 2000000, parkingArea: 10, parkingType: "坡道平面", rooms: 2, special: false };
const reference = { fetchedAt: now, matchMethod: "exact-doorplate", community: { id: "community", name: "測試社區", zone: "A7" }, deals: [deal, { ...deal, id: "two", date: "2026-08-01" }, { ...deal, id: "three", date: "2026-07-01" }] };
const needs = [{ id: "need", contactId: "buyer", statusTag: "正在找", budgetMax: 2000, areas: [{ city: "桃園市", district: "龜山區" }] }];
const record = (p, data = reference) => ({ key: priorityReferenceKey(p), data: compactPriorityReference(p, data) });

test("work categories use the same current assessment as badges, with unchecked cases kept separate", () => {
  const properties = [property, { ...property, id: "negotiate", totalPrice: 1800 }, { ...property, id: "missing", parkingPrice: "" }, { ...property, id: "unchecked" }, { ...property, id: "outside", area: "桃園市", title: "其他區域", communityName: "" }, { ...property, id: "inactive", status: "onHold" }];
  const records = { p: record(property), negotiate: record(properties[1]) };
  const assessments = buildPriorityAssessments(properties, records, needs, [], now);
  expect(countPriorityGroups(properties, assessments)).toEqual({ all: 6, priority: 1, negotiate: 1, pending: 1, unassessed: 1 });
  for (const group of ["priority", "negotiate", "pending", "unassessed"]) {
    expect(properties.filter((p) => matchesPriorityFilter(assessments.get(p.id), group))).toHaveLength(1);
  }
  expect(priorityGroup(assessments.get("outside"))).toBe("other");
  expect(assessments.get("unchecked").label).toBe("待查行情");
});

test("cache invalidates changed addresses, type or comparable area and reassesses current price and needs", () => {
  const saved = record(property);
  expect(cachedPriorityReference({ ...property, address: "不同門牌" }, saved)).toBeNull();
  expect(cachedPriorityReference({ ...property, titlePing: 60 }, saved)).toBeNull();
  expect(cachedPriorityReference({ ...property, category: "公寓" }, saved)).toBeNull();
  const changed = { ...property, totalPrice: 1800 };
  expect(buildPriorityAssessments([changed], { p: saved }, needs, [], now).get("p").status).toBe("negotiate");
  expect(buildPriorityAssessments([property], { p: saved }, [], [], now).get("p").status).toBe("pending");
});

test("only five necessary public trade fields are cached, not profile, contact or source extras", () => {
  const data = compactPriorityReference(property, { ...reference, secret: "not-stored", deals: Array.from({ length: 8 }, (_, i) => ({ ...deal, id: String(i), contactName: "not-stored" })) });
  expect(data.deals).toHaveLength(5);
  expect(JSON.stringify(data)).not.toContain("not-stored");
  expect(data.community).toEqual({ id: "community", name: "測試社區", zone: "A7" });
});

test("local cache is per colleague, expires and never retains failed references", () => {
  const values = new Map();
  const storage = { getItem: (key) => values.get(key), setItem: (key, value) => values.set(key, value) };
  const fresh = { ...reference, fetchedAt: Date.now() };
  savePriorityReferences("one", { p: record(property, fresh), failed: { ...record(property, fresh), error: "offline" } }, storage);
  expect(Object.keys(loadPriorityReferences("one", storage))).toEqual(["p"]);
  expect(loadPriorityReferences("two", storage)).toEqual({});
  expect(loadPriorityReferences("one", storage, Date.now() + 2 * 86400000)).toEqual({});
  expect(loadPriorityReferences("one", { getItem: () => "invalid" })).toEqual({});
});

test("missing property data remains actionable when its market source is offline", () => {
  const missing = { ...property, parkingPrice: "" };
  const result = buildPriorityAssessments([missing], { p: { ...record(missing), error: "offline" } }, needs, [], now).get("p");
  expect(priorityGroup(result)).toBe("pending");
  expect(result.code).toBe("missing_unit");
});

test("offline or stale references cannot remain in a positive work category", () => {
  const assessment = buildPriorityAssessments([property], { p: { ...record(property), error: "offline" } }, needs, [], now).get("p");
  expect(priorityGroup(assessment)).toBe("unassessed");
  const stale = record(property, { ...reference, fetchedAt: now - 2 * 86400000 });
  expect(priorityGroup(buildPriorityAssessments([property], { p: stale }, needs, [], now).get("p"))).toBe("unassessed");
});

test("batch refresh reports progress, waits between calls and stops immediately on an offline source", async () => {
  const load = jest.fn().mockResolvedValueOnce(reference).mockRejectedValueOnce(new Error("offline"));
  const onResult = jest.fn(), onProgress = jest.fn(), pause = jest.fn(async () => {});
  const result = await refreshPriorityReferences([property, { ...property, id: "two" }, { ...property, id: "three" }], { load, onResult, onProgress, pause, now: () => now });
  expect(load).toHaveBeenCalledTimes(2);
  expect(pause).toHaveBeenCalledWith(1500);
  expect(onProgress).toHaveBeenCalledWith(1);
  expect(result).toEqual({ completed: 1, failed: true });
  expect(onResult.mock.calls[1][2]).toContain("無法更新");
});

test("stopping a refresh ignores an in-flight result and does not continue to another case", async () => {
  let stopped = false;
  const onResult = jest.fn();
  const result = await refreshPriorityReferences([property, { ...property, id: "two" }], { load: async () => { stopped = true; return reference; }, onResult, onProgress: jest.fn(), shouldStop: () => stopped });
  expect(onResult).not.toHaveBeenCalled();
  expect(result.stopped).toBe(true);
});
