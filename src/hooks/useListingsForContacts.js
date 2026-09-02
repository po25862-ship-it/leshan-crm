import { useCallback, useEffect, useMemo, useState } from "react";
import { collection, getDocs } from "firebase/firestore";
import { db } from "../firebase";
import { loadReadCache, subscribeReadCache } from "./firestoreReadCache";

export function useListingsForContacts(contactIds) {
  const idsKey = JSON.stringify([...new Set(contactIds || [])].sort());
  const normalizedIds = useMemo(() => JSON.parse(idsKey), [idsKey]);
  const key = useMemo(() => `listingsForContacts::${normalizedIds.join(",")}`, [normalizedIds]);
  const [items, setItems] = useState([]);

  const load = useCallback((force = false) => loadReadCache(
    key,
    async () => {
      const snapshots = await Promise.all(normalizedIds.map((contactId) =>
        getDocs(collection(db, `contacts/${contactId}/listings`))
          .then((snapshot) => snapshot.docs.map((item) => ({
            id: item.id,
            contactId,
            parentId: contactId,
            ...item.data(),
          })))
          .catch((error) => {
            console.error(`讀取委託物件失敗（${contactId}）`, error);
            return [];
          })
      ));
      return snapshots.flat();
    },
    force
  ), [key, normalizedIds]);

  useEffect(() => {
    if (!normalizedIds.length) {
      setItems([]);
      return undefined;
    }
    const unsubscribe = subscribeReadCache(key, (state) => {
      if (state.data !== undefined) setItems(state.data);
    });
    load(false);
    return unsubscribe;
  }, [key, load, normalizedIds.length]);

  return items;
}
