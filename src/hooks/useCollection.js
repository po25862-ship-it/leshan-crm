import { useCallback, useEffect, useMemo, useState } from "react";
import {
  collection,
  getDocs,
  addDoc,
  updateDoc,
  deleteDoc,
  doc,
  serverTimestamp,
} from "firebase/firestore";
import { db } from "../firebase";
import { loadReadCache, subscribeReadCache, updateReadCache } from "./firestoreReadCache";

function comparable(value) {
  if (value?.toMillis) return value.toMillis();
  if (value instanceof Date) return value.getTime();
  return value;
}

function sortItems(items, orderField) {
  return [...items].sort((a, b) => {
    const av = comparable(a?.[orderField]);
    const bv = comparable(b?.[orderField]);
    if (av === bv) return 0;
    if (av === undefined || av === null) return 1;
    if (bv === undefined || bv === null) return -1;
    return av > bv ? -1 : 1;
  });
}

// 免費讀取模式：同一個 collection 在這次開啟網站期間只讀一次，
// 各頁共用快取；新增、修改與刪除後直接同步更新所有使用同一資料的畫面。
export function useCollection(name, orderField = "createdAt", enabled = true) {
  const key = useMemo(() => `collection::${name}`, [name]);
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(enabled);

  const load = useCallback((force = false) => {
    if (!enabled) return Promise.resolve([]);
    return loadReadCache(
      key,
      async () => {
        const snap = await getDocs(collection(db, name));
        return snap.docs.map((item) => ({ id: item.id, ...item.data() }));
      },
      force
    ).catch((error) => {
      console.error(`讀取 ${name} 失敗`, error);
      return [];
    });
  }, [enabled, key, name]);

  useEffect(() => {
    if (!enabled) {
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
  }, [enabled, key, load, orderField]);

  const syncLocal = useCallback((updater) => {
    updateReadCache(key, updater);
  }, [key]);

  const add = async (data) => {
    const payload = { ...data, createdAt: serverTimestamp() };
    const ref = await addDoc(collection(db, name), payload);
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

  return {
    items,
    loading,
    add,
    update,
    remove,
    refresh: () => load(true),
    realtime: false,
  };
}
