import { collection, doc, getDoc, runTransaction, serverTimestamp, writeBatch } from "firebase/firestore";
import { db } from "../firebase";
import { splitNeedData } from "./needPrivacy";

export const needPrivateRef = id => doc(db, "needs", id, "private", "details");
export async function readNeedPrivate(id) {
  const snapshot = await getDoc(needPrivateRef(id));
  return snapshot.exists() ? snapshot.data() : null;
}

export async function saveNeedRecord(data, uid, id) {
  const ref = id ? doc(db, "needs", id) : doc(collection(db, "needs"));
  let recommendedProperties;
  await runTransaction(db, async transaction => {
    const current = id ? await transaction.get(ref) : null;
    if (id && !current.exists()) throw new Error("這筆客需已不存在，請重新整理。");
    const ownerUid = current?.data()?.ownerUid || uid;
    const { publicData, privateData } = splitNeedData(data, ownerUid);
    recommendedProperties = current?.data()?.recommendedProperties || publicData.recommendedProperties;
    publicData.recommendedProperties = recommendedProperties;
    transaction.set(ref, { ...publicData, createdAt: current?.data()?.createdAt || serverTimestamp(), updatedAt: serverTimestamp(), lastModifiedByUid: uid });
    transaction.set(needPrivateRef(ref.id), privateData, { merge: true });
  });
  return { id: ref.id, recommendedProperties };
}

export async function saveNeedRecommendations(id, data, uid) {
  await runTransaction(db, async transaction => {
    const ref = doc(db, "needs", id);
    const snapshot = await transaction.get(ref);
    if (!snapshot.exists()) throw new Error("這筆客需已不存在，請重新整理。");
    transaction.update(ref, { recommendedProperties: data.recommendedProperties, updatedAt: serverTimestamp(), lastModifiedByUid: uid });
  });
}

export async function deleteNeedRecord(id) {
  const batch = writeBatch(db);
  batch.delete(needPrivateRef(id));
  batch.delete(doc(db, "needs", id));
  await batch.commit();
}

// One transaction keeps the buyer interaction and the need's introduced status together.
export async function recordNeedIntroduction(id, { recipientId, properties, communication, eventId, day }, uid) {
  if (!eventId || !recipientId || !properties.length) throw new Error("請先確認介紹對象與物件。");
  const ref = doc(db, "needs", id);
  const interactionRef = doc(db, "contacts", recipientId, "interactions", eventId);
  let recommendedProperties;
  await runTransaction(db, async transaction => {
    const [need, privateNeed, existing] = await Promise.all([transaction.get(ref), transaction.get(needPrivateRef(id)), transaction.get(interactionRef)]);
    if (!need.exists() || !privateNeed.exists() || privateNeed.data().contactId !== recipientId) throw new Error("介紹對象已變更，請重新開啟此客需後再記錄。");
    if (existing.exists()) { recommendedProperties = need.data().recommendedProperties || []; return; }
    const selected = new Set(properties.map(p => p.id));
    const current = need.data().recommendedProperties || [];
    if (properties.some(p => !current.some(r => r.propertyId === p.id))) throw new Error("選取物件已變更，請重新整理後再勾選。");
    recommendedProperties = current.map(item => selected.has(item.propertyId) ? { ...item, status: item.status === "interested" ? "interested" : "introduced", introduced: true, statusUpdatedAt: new Date().toISOString(), introducedByUid: uid } : item);
    transaction.set(interactionRef, { date: day, properties: properties.map(p => ({ label: p.title, propertyId: p.id })), feedback: "", communication, googleEventId: null, googleEventLink: null, createdAt: serverTimestamp() });
    transaction.update(doc(db, "contacts", recipientId), { lastContactDate: day, lastContactNote: `介紹 ${properties.length} 間物件`, lastModifiedByUid: uid });
    transaction.update(ref, { recommendedProperties, lastModifiedByUid: uid, updatedAt: serverTimestamp() });
  });
  return recommendedProperties;
}
