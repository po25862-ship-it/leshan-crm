import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { doc, getDoc, setDoc } from "firebase/firestore";
import { db } from "../firebase";
import { loadReadCache, subscribeReadCache, updateReadCache } from "./firestoreReadCache";

// 單一文件同樣使用工作階段共用快取，避免桌面外框與各頁重複讀取同一份個人資料。
export function useDoc(path, defaults = {}) {
  const key = useMemo(() => `document::${path}`, [path]);
  const defaultsRef = useRef(defaults);
  defaultsRef.current = defaults;
  const [data, setData] = useState(defaults);
  const [loading, setLoading] = useState(true);

  const load = useCallback((force = false) => loadReadCache(
    key,
    async () => {
      const snapshot = await getDoc(doc(db, path));
      return snapshot.exists() ? snapshot.data() : {};
    },
    force
  ).catch((error) => {
    console.error(`讀取 ${path} 失敗`, error);
    return {};
  }), [key, path]);

  useEffect(() => {
    const unsubscribe = subscribeReadCache(key, (state) => {
      if (state.data !== undefined) setData({ ...defaultsRef.current, ...state.data });
      setLoading(state.loading && state.data === undefined);
    });
    load(false);
    return unsubscribe;
  }, [key, load]);

  const save = async (values) => {
    await setDoc(doc(db, path), values, { merge: true });
    updateReadCache(key, (current) => ({ ...current, ...values }));
  };

  return { data, loading, save, refresh: () => load(true), realtime: false };
}
