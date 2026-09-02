import { useCallback, useEffect, useMemo, useState } from "react";
import { collection, getDocs } from "firebase/firestore";
import { db } from "../firebase";
import { loadReadCache, subscribeReadCache } from "./firestoreReadCache";

// 仍逐一依權限讀取，但每位客戶只讀一次，不再永久維持 N 條即時監聽。
export function useAppointmentsForContacts(contactIds) {
  const idsKey = JSON.stringify([...new Set(contactIds || [])].sort());
  const normalizedIds = useMemo(() => JSON.parse(idsKey), [idsKey]);
  const key = useMemo(() => `appointmentsForContacts::${normalizedIds.join(",")}`, [normalizedIds]);
  const [items, setItems] = useState([]);

  const load = useCallback((force = false) => loadReadCache(
    key,
    async () => {
      const snapshots = await Promise.all(normalizedIds.map((contactId) =>
        getDocs(collection(db, `contacts/${contactId}/appointments`))
          .then((snapshot) => snapshot.docs.map((item) => ({ id: item.id, parentId: contactId, ...item.data() })))
          .catch(() => [])
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
