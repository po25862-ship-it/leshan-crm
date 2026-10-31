import { collection, doc, getDocs, query, where, runTransaction, serverTimestamp } from "firebase/firestore";
import { db } from "../firebase";
import { updateReadCache } from "../hooks/firestoreReadCache";
import tenantFields from "./tenantNeedFields.js";
const { tenantNeedPayload } = tenantFields;

export const TENANT_NEEDS_COLLECTION = "tenantNeeds";
export const TENANT_ADMIN_UID = "KiYlsnWcChW5muRkG167r7Mi1132";
export const tenantNeedsCacheKey = uid => `tenantNeeds::${uid}`;
export const canEditTenantNeed = (row, uid) => row?.ownerUid === uid || uid === TENANT_ADMIN_UID;
export async function readTenantNeeds(uid) {
  const root = collection(db, TENANT_NEEDS_COLLECTION);
  const snapshots = uid === TENANT_ADMIN_UID ? [await getDocs(root)] : await Promise.all([
    getDocs(query(root, where("ownerUid", "==", uid))),
    getDocs(query(root, where("sharedWith", "array-contains", uid))),
  ]);
  const rows = new Map(); snapshots.forEach(snap => snap.docs.forEach(item => rows.set(item.id, { id:item.id, ...item.data() })));
  return [...rows.values()];
}
export async function saveTenantNeed({ original, form, user, profile }) {
  const payload = tenantNeedPayload(form);
  if (original && !canEditTenantNeed(original, user.uid)) throw new Error("只有負責同事或管理者可以編輯這筆需求。");
  const target = original?.id ? doc(db, TENANT_NEEDS_COLLECTION, original.id) : doc(collection(db, TENANT_NEEDS_COLLECTION));
  let saved;
  await runTransaction(db, async transaction => {
    const snap = await transaction.get(target), current = snap.exists() ? snap.data() : null;
    if (original && (!current || !canEditTenantNeed(current, user.uid) || current.ownerUid !== original.ownerUid)) throw new Error("這筆需求的權限已變更，請重新整理。");
    if (original && (current.revision || 0) !== (original.revision || 0)) throw new Error("這筆需求已更新，請重新整理後再修改。");
    if (!original && current) throw new Error("需求已存在，請重新開啟。");
    const data = { ...payload, ownerUid:current?.ownerUid || user.uid, ownerName:current?.ownerName || profile?.name || user.displayName || "同事", source:current?.source || "manual", sourceEventId:current?.sourceEventId || "", createdAt:current?.createdAt || serverTimestamp(), updatedAt:serverTimestamp(), revision:(current?.revision || 0)+1, lastModifiedByUid:user.uid };
    transaction.set(target, data);
    saved = { id:target.id, ...data, createdAt:current?.createdAt || new Date(), updatedAt:new Date() };
  });
  updateReadCache(tenantNeedsCacheKey(user.uid), rows => [saved, ...(Array.isArray(rows) ? rows : []).filter(row => row.id !== saved.id)]);
  return saved;
}
