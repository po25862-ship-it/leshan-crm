import { useEffect, useState } from "react";
import {
  collection,
  onSnapshot,
  getDocs,
  query,
  orderBy,
  addDoc,
  updateDoc,
  deleteDoc,
  doc,
  serverTimestamp,
} from "firebase/firestore";
import { db } from "../firebase";

// 只有真的需要多人即時同步的 collection 才保留 onSnapshot。
// 其他清單改為「進頁面讀一次 + 短期快取」，大幅降低 Firestore Read Ops。
const REALTIME_COLLECTIONS = new Set(["cases"]);
const CACHE_TTL_MS = 60 * 1000;
const readCache = new Map();
const listenerRegistry = new Map();

function sortItems(items, orderField) {
  return [...items].sort((a, b) => {
    const av = a?.[orderField];
    const bv = b?.[orderField];
    if (av === bv) return 0;
    if (av === undefined || av === null) return 1;
    if (bv === undefined || bv === null) return -1;
    return av > bv ? -1 : 1;
  });
}

function setCached(key, items) {
  readCache.set(key, { items, fetchedAt: Date.now() });
}

function subscribeShared(key, makeQuery, onData, onError) {
  let entry = listenerRegistry.get(key);

  if (!entry) {
    entry = {
      subscribers: new Set(),
      data: null,
      error: null,
      unsubscribe: null,
    };

    const q = makeQuery();
    entry.unsubscribe = onSnapshot(
      q,
      (snap) => {
        entry.data = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
        entry.error = null;
        entry.subscribers.forEach((subscriber) => subscriber.onData(entry.data));
      },
      (err) => {
        entry.error = err;
        entry.subscribers.forEach((subscriber) => subscriber.onError(err));
      }
    );

    listenerRegistry.set(key, entry);
  }

  const subscriber = { onData, onError };
  entry.subscribers.add(subscriber);

  if (entry.data) onData(entry.data);
  if (entry.error) onError(entry.error);

  return () => {
    const current = listenerRegistry.get(key);
    if (!current) return;

    current.subscribers.delete(subscriber);
    if (current.subscribers.size === 0) {
      current.unsubscribe?.();
      listenerRegistry.delete(key);
    }
  };
}

export function useCollection(name, orderField = "createdAt", enabled = true) {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const realtime = REALTIME_COLLECTIONS.has(name);
  const key = `${name}::${orderField}::desc`;

  const loadOnce = async (force = false) => {
    if (!enabled) return;

    const cached = readCache.get(key);
    if (!force && cached && Date.now() - cached.fetchedAt < CACHE_TTL_MS) {
      setItems(cached.items);
      setLoading(false);
      return;
    }

    setLoading(true);
    try {
      const q = query(collection(db, name), orderBy(orderField, "desc"));
      const snap = await getDocs(q);
      const data = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      setCached(key, data);
      setItems(data);
    } catch (err) {
      console.error(`讀取 ${name} 失敗`, err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!enabled) {
      setItems([]);
      setLoading(false);
      return;
    }

    if (!realtime) {
      loadOnce(false);
      return;
    }

    setLoading(true);
    return subscribeShared(
      key,
      () => query(collection(db, name), orderBy(orderField, "desc")),
      (data) => {
        setItems(data);
        setLoading(false);
      },
      (err) => {
        console.error(`讀取 ${name} 失敗`, err);
        setLoading(false);
      }
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [name, orderField, enabled, realtime]);

  const syncLocal = (updater) => {
    if (realtime) return;
    setItems((current) => {
      const next = sortItems(updater(current), orderField);
      setCached(key, next);
      return next;
    });
  };

  const add = async (data) => {
    const payload = { ...data, createdAt: serverTimestamp() };
    const ref = await addDoc(collection(db, name), payload);
    syncLocal((current) => [
      { id: ref.id, ...data, createdAt: new Date() },
      ...current,
    ]);
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

  const refresh = () => (realtime ? Promise.resolve() : loadOnce(true));

  return { items, loading, add, update, remove, refresh, realtime };
}
