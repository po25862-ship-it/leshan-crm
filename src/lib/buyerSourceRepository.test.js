import { runTransaction } from "firebase/firestore";
import { updateExistingReadCache } from "../hooks/firestoreReadCache";
import { buyerSourceChanges, buyerSourceGroups, reverseSourceChanges } from "./buyerSources";
import { saveBuyerSourceChanges } from "./buyerSourceRepository";

const mockAuth = { currentUser: { uid: "staff" } };
jest.mock("../firebase", () => ({ db: {}, get auth() { return mockAuth; } }));
jest.mock("firebase/firestore", () => ({ doc: (_, collection, id) => ({ path: `${collection}/${id}` }), runTransaction: jest.fn() }));
jest.mock("../hooks/firestoreReadCache", () => ({ updateExistingReadCache: jest.fn() }));
let records, writes, events;
beforeEach(() => {
  mockAuth.currentUser = { uid: "staff" }; writes = []; events = [];
  records = new Map([
    ["contacts/a", { source: "591 typo", name: "陳先生", phone: "0912", tags: ["買方"], ownerUid: "staff", notes: "保留", sharedWith: ["peer"] }],
    ["contacts/b", { source: "591 typo", name: "林小姐", tags: ["買方", "賣方"], ownerUid: "peer", sharedWith: ["staff"] }],
  ]);
  updateExistingReadCache.mockReset(); runTransaction.mockReset().mockImplementation(async (_, callback) => {
    const pending = [];
    await callback({ get: async ref => { events.push(`get:${ref.path}`); return { exists: () => records.has(ref.path), data: () => records.get(ref.path) }; }, update: (ref, data) => { events.push(`write:${ref.path}`); pending.push({ path: ref.path, data }); } });
    pending.forEach(({ path, data }) => records.set(path, { ...records.get(path), ...data })); writes.push(...pending);
  });
});
const plan = () => ["a", "b"].map(id => ({ id, before: "591 typo", after: "591" }));

test("groups equivalent spellings and builds exact, reversible source-only changes", () => {
  const buyers = [{ id: "a", source: " ＦＢ " }, { id: "b", source: "fb" }, { id: "c", source: "朋友介紹" }, { id: "d", source: "" }];
  const group = buyerSourceGroups(buyers).find(g => g.key === "fb");
  expect(group.buyers).toHaveLength(2); expect(group.variants.size).toBe(2);
  const changes = buyerSourceChanges(buyers, group.key, " FB ");
  expect(changes).toEqual([{ id: "a", before: " ＦＢ ", after: "FB" }, { id: "b", before: "fb", after: "FB" }]);
  expect(reverseSourceChanges(changes)[0]).toEqual({ id: "a", before: "FB", after: " ＦＢ " });
});

test("renames owned and explicitly shared buyers atomically without touching other fields", async () => {
  const original = { ...records.get("contacts/a") };
  await saveBuyerSourceChanges("staff", plan());
  expect(events).toEqual(["get:contacts/a", "get:contacts/b", "write:contacts/a", "write:contacts/b"]);
  expect(writes).toEqual(["a", "b"].map(id => ({ path: `contacts/${id}`, data: { source: "591", lastModifiedByUid: "staff" } })));
  expect(records.get("contacts/a")).toEqual({ ...original, source: "591", lastModifiedByUid: "staff" });
  const [key, updater] = updateExistingReadCache.mock.calls[0];
  expect(key).toBe("sharedCollection::contacts::staff");
  expect(updater([{ id: "a", ...original }, { id: "b", source: "new concurrent value" }])).toEqual([{ id: "a", ...original, source: "591", lastModifiedByUid: "staff" }, { id: "b", source: "new concurrent value" }]);
});

test.each(["source", "permission", "deleted", "tag"])("a stale %s cancels all changes and leaves the cache untouched", async kind => {
  if (kind === "source") records.get("contacts/b").source = "另一裝置改過";
  if (kind === "permission") records.get("contacts/b").sharedWith = [];
  if (kind === "deleted") records.delete("contacts/b");
  if (kind === "tag") records.get("contacts/b").tags = ["賣方"];
  await expect(saveBuyerSourceChanges("staff", plan())).rejects.toThrow("本次沒有修改資料");
  expect(writes).toHaveLength(0); expect(updateExistingReadCache).not.toHaveBeenCalled();
  expect(records.get("contacts/a").source).toBe("591 typo");
});

test("deletion only clears sources and undo restores exact original spellings", async () => {
  const changes = plan().map(change => ({ ...change, after: "" }));
  await saveBuyerSourceChanges("staff", changes);
  expect(records.size).toBe(2); expect(records.get("contacts/a").source).toBe("");
  await saveBuyerSourceChanges("staff", reverseSourceChanges(changes));
  expect(records.get("contacts/a").source).toBe("591 typo");
  records.get("contacts/b").source = "另一個新來源";
  await expect(saveBuyerSourceChanges("staff", changes)).rejects.toThrow("本次沒有修改資料");
});

test("account switches and malformed plans are blocked before writing", async () => {
  mockAuth.currentUser = { uid: "different" };
  await expect(saveBuyerSourceChanges("staff", plan())).rejects.toThrow("帳號已變更");
  mockAuth.currentUser = { uid: "staff" };
  await expect(saveBuyerSourceChanges("staff", [plan()[0], plan()[0]])).rejects.toThrow("來源整理資料有誤");
  await expect(saveBuyerSourceChanges("staff", [{ id: "a/path", before: "a", after: "b" }])).rejects.toThrow("來源整理資料有誤");
  expect(runTransaction).not.toHaveBeenCalled();
});
