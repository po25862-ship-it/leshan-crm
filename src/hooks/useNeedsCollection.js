import { useCallback, useEffect, useMemo, useState } from "react";
import { collection, getDocs, query, where } from "firebase/firestore";
import { db } from "../firebase";
import { loadReadCache, subscribeReadCache, updateReadCache, updateExistingReadCache } from "./firestoreReadCache";
import { NEED_OWNER_UID, canManageNeed, mergeNeedPrivate } from "../lib/needPrivacy";
import { readNeedPrivate, saveNeedRecord, saveNeedRecommendations, deleteNeedRecord, recordNeedIntroduction } from "../lib/needRepository";

const sortNeeds = items => [...items].sort((a, b) => (b.createdAt?.toMillis?.() || b.createdAt?.getTime?.() || 0) - (a.createdAt?.toMillis?.() || a.createdAt?.getTime?.() || 0));

export function useNeedsCollection(currentUid) {
  const key = useMemo(() => `needs-v2::${currentUid || "signed-out"}`, [currentUid]);
  const [state, setState] = useState({ uid: currentUid, items: [], loading: true, error: null, loadedAt: null });
  const load = useCallback((force = false) => {
    if (!currentUid) return Promise.resolve([]);
    return loadReadCache(key, async () => {
      const snapshots = currentUid === NEED_OWNER_UID
        ? [await getDocs(collection(db, "needs"))]
        : await Promise.all([
          getDocs(query(collection(db, "needs"), where("ownerUid", "==", currentUid))),
          getDocs(query(collection(db, "needs"), where("shared", "==", true), where("schemaVersion", "==", 2))),
        ]);
      const records = [...new Map(snapshots.flatMap(snapshot => snapshot.docs.map(item => [item.id, { id: item.id, ...item.data() }]))).values()];
      return sortNeeds(await Promise.all(records.map(async need => mergeNeedPrivate(need, canManageNeed(need, currentUid) ? await readNeedPrivate(need.id) : null))));
    }, force);
  }, [currentUid, key]);

  useEffect(() => {
    const unsubscribe = subscribeReadCache(key, next => setState({ uid: currentUid, items: next.data || [], loading: next.loading || (next.data === undefined && !next.error), error: next.error, loadedAt: next.loadedAt }));
    load().catch(() => {});
    return unsubscribe;
  }, [currentUid, key, load]);

  const sync = updater => updateReadCache(key, current => sortNeeds(updater(current || [])));
  const add = async data => {
    const ref = await saveNeedRecord(data, currentUid);
    sync(current => [{ ...data, id: ref.id, ownerUid: currentUid, schemaVersion: 2, createdAt: new Date() }, ...current]);
    return ref;
  };
  const update = async (id, data) => {
    const onlyRecommendations = Object.keys(data).every(k => ["recommendedProperties", "lastModifiedByUid"].includes(k));
    if (onlyRecommendations) await saveNeedRecommendations(id, data, currentUid);
    else { const saved = await saveNeedRecord(data, currentUid, id); data = { ...data, recommendedProperties: saved.recommendedProperties }; }
    sync(current => current.map(item => item.id === id ? { ...item, ...data, updatedAt: new Date() } : item));
  };
  const remove = async id => { await deleteNeedRecord(id); sync(current => current.filter(item => item.id !== id)); };
  const introduce = async (id, data) => {
    const recommendedProperties = await recordNeedIntroduction(id, data, currentUid);
    sync(current => current.map(item => item.id === id ? { ...item, recommendedProperties } : item));
    // Invalidate the separate interaction cache so an already-open buyer timeline can refresh it.
    updateExistingReadCache(`collection::contacts/${data.recipientId}/interactions`, current => current.some(item => item.id === data.eventId) ? current : [{ id: data.eventId, date: data.day, properties: data.properties.map(p => ({ label: p.title, propertyId: p.id })), communication: data.communication, createdAt: new Date() }, ...current]);
    updateExistingReadCache(`sharedCollection::contacts::${currentUid}`, current => current.map(item => item.id === data.recipientId ? { ...item, lastContactDate: data.day, lastContactNote: `介紹 ${data.properties.length} 間物件` } : item));
    return recommendedProperties;
  };
  const ownState = state.uid === currentUid ? state : { items: [], loading: true, error: null, loadedAt: null };
  return { ...ownState, add, update, remove, introduce, refresh: () => load(true), realtime: false };
}
