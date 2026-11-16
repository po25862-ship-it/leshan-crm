import { runTransaction } from "firebase/firestore";
import { updateReadCache } from "../hooks/firestoreReadCache";
import { auditFingerprint } from "./propertyAudit";
import { savePropertyAuditCheck, savePropertyAuditNote } from "./propertyAuditRepository";
jest.mock("../firebase", () => ({ db: {} }));
jest.mock("firebase/firestore", () => ({ doc: (_db, ...parts) => parts.join("/"), serverTimestamp: () => "server-time", runTransaction: jest.fn() }));
jest.mock("../hooks/firestoreReadCache", () => ({ updateReadCache: jest.fn() }));
let record, updates;
const actor = { uid: "staff-a", name: "同事甲" };
beforeEach(() => {
  record = { store: "捷運樂善直營店", title: "金捷市", listingNo: "DE1", address: "原門牌", totalPrice: 1000, auditChecklist: { checks: { titleSeal: { checked: true, fingerprint: "preserve" } } } }; updates = [];
  runTransaction.mockImplementation(async (_db, callback) => callback({ get: async () => ({ exists: () => true, id: "p1", data: () => record }), update: (ref, patch) => updates.push({ ref, patch }) }));
});
test("each tick updates only its own nested field and preserves prices and other colleagues' checks", async () => {
  const saved = await savePropertyAuditCheck({ id: "p1", key: "mandate", checked: true, fingerprint: auditFingerprint(record, "mandate"), actor });
  expect(updates[0].ref).toBe("properties/p1");
  expect(Object.keys(updates[0].patch)).toEqual(["auditChecklist.checks.mandate"]);
  expect(updates[0].patch["auditChecklist.checks.mandate"]).toMatchObject({ checked: true, byUid: "staff-a", byName: "同事甲", at: "server-time" });
  expect(saved).toMatchObject({ totalPrice: 1000, auditChecklist: { checks: { titleSeal: { fingerprint: "preserve" } } } });
  expect(updateReadCache).toHaveBeenCalledWith("collection::properties", expect.any(Function));
});
test("a source change between opening the page and ticking a box blocks the write", async () => {
  const fingerprint = auditFingerprint(record, "mandate"); record.totalPrice = 900;
  await expect(savePropertyAuditCheck({ id: "p1", key: "mandate", checked: true, fingerprint, actor })).rejects.toThrow("物件資料剛剛有更新");
  expect(updates).toHaveLength(0);
});
test("a colleague's changed note is not overwritten by an older draft", async () => {
  record.auditChecklist.note = { text: "同事先更新了" };
  await expect(savePropertyAuditNote({ id: "p1", text: "舊草稿", expectedText: "", actor })).rejects.toThrow("同事剛剛更新");
  expect(updates).toHaveLength(0);
  await savePropertyAuditNote({ id: "p1", text: "已核對新內容", expectedText: "同事先更新了", actor });
  expect(Object.keys(updates[0].patch)).toEqual(["auditChecklist.note"]);
});
test("unknown fields, foreign stores and signed-out requests cannot write", async () => {
  await expect(savePropertyAuditCheck({ id: "p1", key: "totalPrice", checked: true, actor })).rejects.toThrow("核對欄位");
  await expect(savePropertyAuditNote({ id: "p1", text: "test", actor: {} })).rejects.toThrow("請先登入");
  record.store = "其他店";
  await expect(savePropertyAuditNote({ id: "p1", text: "test", actor })).rejects.toThrow("分店已更新");
  expect(updates).toHaveLength(0);
});
