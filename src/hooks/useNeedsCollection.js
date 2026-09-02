import { useCallback, useEffect, useMemo, useState } from "react";
import {
  collection,
  getDocs,
  query,
  where,
  orderBy,
  addDoc,
  updateDoc,
  deleteDoc,
  doc,
  serverTimestamp,
} from "firebase/firestore";
import { db } from "../firebase";
import { loadReadCache, subscribeReadCache, updateReadCache } from "./firestoreReadCache";

const MAIN_OWNER_UID = "KiYlsnWcChW5muRkG167r7Mi1132";

function sortNeeds(items) {
  return [...items].sort((a, b) => {
    const av = a.createdAt?.toMillis?.() || a.createdAt?.getTime?.() || 0;
    const bv = b.createdAt?.toMillis?.() || b.createdAt?.getTime?.() || 0;
    return bv - av;
  });
}

function mergeSnapshots(snapshots) {
  const merged = new Map();
  snapshots.forEach((snapshot) => snapshot.docs.forEach((item) => {
    merged.set(item.id, { id: item.id, ...item.data() });
  }));
  return sortNeeds([...merged.values()]);
}

export function useNeedsCollection(currentUid) {
  const isMainOwner = currentUid === MAIN_OWNER_UID;
  const key = useMemo(() => `needs::${currentUid || "signed-out"}`, [currentUid]);
  const [items, setItems] = useState([]);

  const load = useCallback((force = false) => {
    if (!currentUid) return Promise.resolve([]);
    return loadReadCache(
      key,
      async () => {
        if (isMainOwner) {
          return mergeSnapshots([await getDocs(query(collection(db, "needs"), orderBy("createdAt", "desc")))]);
        }
        const [own, shared] = await Promise.all([
          getDocs(query(collection(db, "needs"), where("ownerUid", "==", currentUid))),
          getDocs(query(collection(db, "needs"), where("shared", "==", true))),
        ]);
        return mergeSnapshots([own, shared]);
      },
      force
    ).catch((error) => {
      console.error("讀取 needs 失敗", error);
      return [];
    });
  }, [currentUid, isMainOwner, key]);

  useEffect(() => {
    if (!currentUid) {
      setItems([]);
      return undefined;
    }
    const unsubscribe = subscribeReadCache(key, (state) => {
      if (state.data !== undefined) setItems(state.data);
    });
    load(false);
    return unsubscribe;
  }, [currentUid, key, load]);

  const syncLocal = useCallback((updater) => {
    updateReadCache(key, (current) => sortNeeds(updater(current)));
  }, [key]);

  const add = async (data) => {
    const ref = await addDoc(collection(db, "needs"), { ...data, createdAt: serverTimestamp() });
    syncLocal((current) => [{ id: ref.id, ...data, createdAt: new Date() }, ...current]);
    return ref;
  };
  const update = async (id, data) => {
    await updateDoc(doc(db, "needs", id), data);
    syncLocal((current) => current.map((item) => (item.id === id ? { ...item, ...data } : item)));
  };
  const remove = async (id) => {
    await deleteDoc(doc(db, "needs", id));
    syncLocal((current) => current.filter((item) => item.id !== id));
  };

  return { items, add, update, remove, refresh: () => load(true), realtime: false };
}
