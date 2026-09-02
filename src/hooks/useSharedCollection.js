import { useCallback, useEffect, useMemo, useState } from "react";
import {
  collection,
  getDocs,
  query,
  where,
  addDoc,
  updateDoc,
  deleteDoc,
  doc,
  serverTimestamp,
} from "firebase/firestore";
import { db } from "../firebase";
import { loadReadCache, subscribeReadCache, updateReadCache } from "./firestoreReadCache";

const MAIN_OWNER_UID = "KiYlsnWcChW5muRkG167r7Mi1132";

function comparable(value) {
  if (value?.toMillis) return value.toMillis();
  if (value instanceof Date) return value.getTime();
  return value || "";
}

function sortItems(items, orderField) {
  return [...items].sort((a, b) => {
    const av = comparable(a[orderField]);
    const bv = comparable(b[orderField]);
    return av < bv ? 1 : av > bv ? -1 : 0;
  });
}

function mergeSnapshots(snapshots, orderField) {
  const merged = new Map();
  snapshots.forEach((snapshot) => {
    snapshot.docs.forEach((item) => merged.set(item.id, { id: item.id, ...item.data() }));
  });
  return sortItems([...merged.values()], orderField);
}

// 權限篩選保留，但改成同帳號、同集合只查一次並由所有頁面共用。
export function useSharedCollection(name, orderField, currentUid) {
  const isMainOwner = currentUid === MAIN_OWNER_UID;
  const key = useMemo(
    () => `sharedCollection::${name}::${currentUid || "signed-out"}`,
    [currentUid, name]
  );
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(Boolean(currentUid));

  const load = useCallback((force = false) => {
    if (!currentUid) return Promise.resolve([]);
    return loadReadCache(
      key,
      async () => {
        if (isMainOwner) {
          const all = await getDocs(collection(db, name));
          return mergeSnapshots([all], orderField);
        }
        const [own, shared] = await Promise.all([
          getDocs(query(collection(db, name), where("ownerUid", "==", currentUid))),
          getDocs(query(collection(db, name), where("sharedWith", "array-contains", currentUid))),
        ]);
        return mergeSnapshots([own, shared], orderField);
      },
      force
    ).catch((error) => {
      console.error(`讀取 ${name} 失敗`, error);
      return [];
    });
  }, [currentUid, isMainOwner, key, name, orderField]);

  useEffect(() => {
    if (!currentUid) {
      setItems([]);
      setLoading(false);
      return undefined;
    }
    const unsubscribe = subscribeReadCache(key, (state) => {
      if (state.data !== undefined) setItems(sortItems(state.data, orderField));
      setLoading(state.loading && state.data === undefined);
    });
    load(false);
    return unsubscribe;
  }, [currentUid, key, load, orderField]);

  const syncLocal = useCallback((updater) => {
    updateReadCache(key, updater);
  }, [key]);

  const add = async (data) => {
    const ref = await addDoc(collection(db, name), { ...data, createdAt: serverTimestamp() });
    syncLocal((current) => [{ id: ref.id, ...data, createdAt: new Date() }, ...current]);
    return ref;
  };

  const update = async (id, data) => {
    await updateDoc(doc(db, name, id), data);
    syncLocal((current) => current.map((item) => (item.id === id ? { ...item, ...data } : item)));
  };

  const remove = async (id) => {
    await deleteDoc(doc(db, name, id));
    syncLocal((current) => current.filter((item) => item.id !== id));
  };

  return { items, loading, add, update, remove, refresh: () => load(true), realtime: false };
}
