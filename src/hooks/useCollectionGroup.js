import { useCallback, useEffect, useMemo, useState } from "react";
import { collectionGroup, getDocs } from "firebase/firestore";
import { db } from "../firebase";
import { loadReadCache, subscribeReadCache } from "./firestoreReadCache";

// 跨集合資料只讀一次並共用結果，避免每次切換頁面重新掃描所有子集合。
export function useCollectionGroup(name) {
  const key = useMemo(() => `collectionGroup::${name}`, [name]);
  const [items, setItems] = useState([]);

  const load = useCallback((force = false) => loadReadCache(
    key,
    async () => {
      const snap = await getDocs(collectionGroup(db, name));
      return snap.docs.map((item) => ({
        id: item.id,
        parentId: item.ref.parent.parent ? item.ref.parent.parent.id : null,
        ...item.data(),
      }));
    },
    force
  ).catch((error) => {
    console.error(`讀取 ${name}（跨集合）失敗`, error);
    return [];
  }), [key, name]);

  useEffect(() => {
    const unsubscribe = subscribeReadCache(key, (state) => {
      if (state.data !== undefined) setItems(state.data);
    });
    load(false);
    return unsubscribe;
  }, [key, load]);

  return items;
}
