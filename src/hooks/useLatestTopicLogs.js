import { useCallback, useEffect, useMemo, useState } from "react";
import { collection, getDocs, query, orderBy, limit } from "firebase/firestore";
import { db } from "../firebase";
import { loadReadCache, subscribeReadCache } from "./firestoreReadCache";

export function useLatestTopicLogs(topicIds) {
  const idsKey = JSON.stringify([...new Set(topicIds || [])].sort());
  const normalizedIds = useMemo(() => JSON.parse(idsKey), [idsKey]);
  const key = useMemo(() => `latestTopicLogs::${normalizedIds.join(",")}`, [normalizedIds]);
  const [latestByTopic, setLatestByTopic] = useState({});

  const load = useCallback((force = false) => loadReadCache(
    key,
    async () => {
      const rows = await Promise.all(normalizedIds.map(async (topicId) => {
        try {
          const q = query(collection(db, `topics/${topicId}/logs`), orderBy("date", "desc"), limit(5));
          const snapshot = await getDocs(q);
          const documents = snapshot.docs.map((item) => ({ id: item.id, ...item.data() }));
          documents.sort((a, b) => {
            if (a.date !== b.date) return a.date < b.date ? 1 : -1;
            return (b.time || "") < (a.time || "") ? -1 : 1;
          });
          return [topicId, documents[0] || null];
        } catch (error) {
          console.error(`讀取商談事項討論紀錄失敗（${topicId}）`, error);
          return [topicId, null];
        }
      }));
      return Object.fromEntries(rows);
    },
    force
  ), [key, normalizedIds]);

  useEffect(() => {
    if (!normalizedIds.length) {
      setLatestByTopic({});
      return undefined;
    }
    const unsubscribe = subscribeReadCache(key, (state) => {
      if (state.data !== undefined) setLatestByTopic(state.data);
    });
    load(false);
    return unsubscribe;
  }, [key, load, normalizedIds.length]);

  return latestByTopic;
}
