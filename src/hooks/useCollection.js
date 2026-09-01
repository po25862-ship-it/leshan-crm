import { useEffect, useState } from "react";
import {
  collection,
  onSnapshot,
  query,
  orderBy,
  addDoc,
  updateDoc,
  deleteDoc,
  doc,
  serverTimestamp,
} from "firebase/firestore";
import { db } from "../firebase";

// 共用 Firestore listener：同一個 collection + 排序條件只建立一條 onSnapshot，
// 避免不同元件同時掛載時重複讀取相同資料。
const listenerRegistry = new Map();

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

// 監聽一個 Firestore collection，回傳即時資料與 CRUD 方法
// enabled=false 時完全不會發出查詢（用在「這個人沒有權限看，乾脆不要問」的情況，避免權限錯誤）
export function useCollection(name, orderField = "createdAt", enabled = true) {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!enabled) {
      setItems([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    const key = `${name}::${orderField}::desc`;

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
  }, [name, orderField, enabled]);

  const add = (data) =>
    addDoc(collection(db, name), { ...data, createdAt: serverTimestamp() });

  const update = (id, data) => updateDoc(doc(db, name, id), data);

  const remove = (id) => deleteDoc(doc(db, name, id));

  return { items, loading, add, update, remove };
}
