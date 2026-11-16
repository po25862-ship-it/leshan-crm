import { doc, runTransaction, serverTimestamp } from "firebase/firestore";
import { db } from "../firebase";
import { updateReadCache } from "../hooks/firestoreReadCache";
import { AUDIT_FIELDS, auditFingerprint, isAuditStore } from "./propertyAudit";

const checkedActor = actor => {
  if (!actor?.uid || typeof actor.uid !== "string" || actor.uid.length > 128) throw new Error("請先登入同事帳號。");
  return { byUid: actor.uid, byName: String(actor.name || "同事").trim().slice(0, 60) };
};
const target = id => { if (typeof id !== "string" || !id || id.includes("/") || id.length > 256) throw new Error("物件編號不正確。"); return doc(db, "properties", id); };
const publish = row => updateReadCache("collection::properties", current => (current || []).map(item => item.id === row.id ? row : item));
function propertyFrom(snapshot) {
  if (!snapshot.exists()) throw new Error("這筆物件已不存在，請更新清單。");
  const row = { ...snapshot.data(), id: snapshot.id };
  if (!isAuditStore(row)) throw new Error("物件分店已更新，請重新讀取清單。");
  return row;
}
export async function savePropertyAuditCheck({ id, key, checked, fingerprint, actor }) {
  if (!AUDIT_FIELDS.some(field => field.key === key) || typeof checked !== "boolean") throw new Error("核對欄位不正確。");
  const who = checkedActor(actor), ref = target(id);
  const saved = await runTransaction(db, async transaction => {
    const row = propertyFrom(await transaction.get(ref));
    if (auditFingerprint(row, key) !== fingerprint) throw new Error("物件資料剛剛有更新，請先更新清單再核對。");
    const value = { checked, fingerprint, ...who, at: serverTimestamp() };
    transaction.update(ref, { [`auditChecklist.checks.${key}`]: value });
    return { ...row, auditChecklist: { ...row.auditChecklist, checks: { ...row.auditChecklist?.checks, [key]: { ...value, at: new Date() } } } };
  });
  publish(saved); return saved;
}
export async function savePropertyAuditNote({ id, text, expectedText = "", actor }) {
  if (typeof text !== "string" || text.trim().length > 300) throw new Error("備註請在 300 字內。");
  const who = checkedActor(actor), ref = target(id), value = text.trim();
  const saved = await runTransaction(db, async transaction => {
    const row = propertyFrom(await transaction.get(ref));
    const current = String(row.auditChecklist?.note?.text || "");
    if (current !== expectedText && current !== value) throw new Error("同事剛剛更新過這筆備註。請保留草稿，更新清單核對後再儲存。");
    const note = { text: value, ...who, at: serverTimestamp() };
    transaction.update(ref, { "auditChecklist.note": note });
    return { ...row, auditChecklist: { ...row.auditChecklist, note: { ...note, at: new Date() } } };
  });
  publish(saved); return saved;
}
