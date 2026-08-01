import { useEffect, useState } from "react";
import { collection, onSnapshot, query, orderBy, limit } from "firebase/firestore";
import { db } from "../firebase";

// 針對「有權限看到的」每一筆商談事項，各自訂閱它的討論紀錄，取最新一筆
// 用意是避免對 topics/*/logs 做沒有篩選的跨集合查詢（那種查詢在權限限制下，
// 同事登入時會被 Firestore 直接擋掉，因為證明不了查詢結果一定符合權限規則）
export function useLatestTopicLogs(topicIds) {
  const [latestByTopic, setLatestByTopic] = useState({});

  useEffect(() => {
    if (!topicIds || topicIds.length === 0) {
      setLatestByTopic({});
      return;
    }
    const unsubs = topicIds.map((topicId) => {
      const q = query(collection(db, `topics/${topicId}/logs`), orderBy("date", "desc"), limit(5));
      return onSnapshot(
        q,
        (snap) => {
          const docs = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
          // date 相同時再用 time 比一次，取真正最新的一筆
          docs.sort((a, b) => {
            if (a.date !== b.date) return a.date < b.date ? 1 : -1;
            return (b.time || "") < (a.time || "") ? -1 : 1;
          });
          setLatestByTopic((prev) => ({ ...prev, [topicId]: docs[0] || null }));
        },
        (err) => console.error(`讀取商談事項討論紀錄失敗（${topicId}）`, err)
      );
    });
    return () => unsubs.forEach((u) => u());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JSON.stringify(topicIds)]);

  return latestByTopic;
}
