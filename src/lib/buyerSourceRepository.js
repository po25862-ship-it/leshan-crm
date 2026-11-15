import { doc, runTransaction } from "firebase/firestore";
import { auth, db } from "../firebase";
import { updateExistingReadCache } from "../hooks/firestoreReadCache";
import { MAX_BUYER_SOURCE_CHANGES } from "./buyerSources";

const MAIN_OWNER_UID = "KiYlsnWcChW5muRkG167r7Mi1132";
const stale = () => new Error("部分買方來源已變更或無法編輯，請重新整理後再試。本次沒有修改資料。");

// Read and compare every source before writing. A conflict cancels the whole
// operation, and only source/lastModifiedByUid can be written by this function.
export async function saveBuyerSourceChanges(uid, changes) {
  const checkAccount = () => {
    if (!uid || auth.currentUser?.uid !== uid) throw new Error("帳號已變更，請重新登入後再試。");
  };
  checkAccount();
  if (!Array.isArray(changes) || !changes.length) throw new Error("沒有需要變更的來源。");
  if (changes.length > MAX_BUYER_SOURCE_CHANGES) throw new Error("同一來源超過 400 位買方，請先個別整理部分買方後再試。");
  const ids = new Set();
  const plan = changes.map(({ id, before, after }) => {
    if (typeof id !== "string" || !id || id.includes("/") || ids.has(id) || typeof before !== "string" || typeof after !== "string" || before === after) throw new Error("來源整理資料有誤，請重新選擇。");
    ids.add(id);
    return { id, before, after };
  });
  const targets = plan.map(change => doc(db, "contacts", change.id));
  await runTransaction(db, async tx => {
    const snapshots = await Promise.all(targets.map(target => tx.get(target)));
    checkAccount();
    snapshots.forEach((snapshot, index) => {
      if (!snapshot.exists()) throw stale();
      const buyer = snapshot.data();
      const canEdit = uid === MAIN_OWNER_UID || buyer.ownerUid === uid || (Array.isArray(buyer.sharedWith) && buyer.sharedWith.includes(uid));
      if (!canEdit || !Array.isArray(buyer.tags) || !buyer.tags.includes("買方") || buyer.source !== plan[index].before) throw stale();
    });
    plan.forEach((change, index) => tx.update(targets[index], { source: change.after, lastModifiedByUid: uid }));
  });
  const byId = new Map(plan.map(change => [change.id, change]));
  updateExistingReadCache(`sharedCollection::contacts::${uid}`, current => current.map(buyer => {
    const change = byId.get(buyer.id);
    return change && buyer.source === change.before ? { ...buyer, source: change.after, lastModifiedByUid: uid } : buyer;
  }));
  return plan;
}
