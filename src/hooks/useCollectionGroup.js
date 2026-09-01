import { useEffect, useState } from "react";
import { collectionGroup, onSnapshot } from "firebase/firestore";
import { db } from "../firebase";

// 共用 collectionGroup listener：同一個子集合名稱只建立一條 onSnapshot，
// 避免多個頁面或元件同時掛載時重複掃描相同資料。
const groupListenerRegistry = new Map();

function subscribeSharedGroup(name, onData, onError) {
  let entry = groupListenerRegistry.get(name);

  if (!entry) {
    entry = {
      subscribers: new Set(),
      data: null,
      error: null,
      unsubscribe: null,
    };

    const q = collectionGroup(db, name);
    entry.unsubscribe = onSnapshot(
      q,
      (snap) => {
        entry.data = snap.docs.map((d) => ({
          id: d.id,
          parentId: d.ref.parent.parent ? d.ref.parent.parent.id : null,
          ...d.data(),
        }));
        entry.error = null;
        entry.subscribers.forEach((subscriber) => subscriber.onData(entry.data));
      },
      (err) => {
        entry.error = err;
        entry.subscribers.forEach((subscriber) => subscriber.onError(err));
      }
    );

    groupListenerRegistry.set(name, entry);
  }

  const subscriber = { onData, onError };
  entry.subscribers.add(subscriber);

  if (entry.data) onData(entry.data);
  if (entry.error) onError(entry.error);

  return () => {
    const current = groupListenerRegistry.get(name);
    if (!current) return;

    current.subscribers.delete(subscriber);
    if (current.subscribers.size === 0) {
      current.unsubscribe?.();
      groupListenerRegistry.delete(name);
    }
  };
}

// 監聽某個名稱的子集合，不論掛在哪個上層文件底下都會抓到（例如所有客戶底下的 listings）
export function useCollectionGroup(name) {
  const [items, setItems] = useState([]);

  useEffect(() => {
    return subscribeSharedGroup(
      name,
      (data) => setItems(data),
      () => setItems([])
    );
  }, [name]);

  return items;
}
