import { useEffect, useState } from "react";
import { collectionGroup, onSnapshot } from "firebase/firestore";
import { db } from "../firebase";

// 監聽某個名稱的子集合，不論掛在哪個上層文件底下都會抓到（例如所有客戶底下的 listings）
export function useCollectionGroup(name) {
  const [items, setItems] = useState([]);

  useEffect(() => {
    const q = collectionGroup(db, name);
    const unsub = onSnapshot(
      q,
      (snap) => {
        setItems(
          snap.docs.map((d) => ({
            id: d.id,
            parentId: d.ref.parent.parent ? d.ref.parent.parent.id : null,
            ...d.data(),
          }))
        );
      },
      () => setItems([])
    );
    return () => unsub();
  }, [name]);

  return items;
}
