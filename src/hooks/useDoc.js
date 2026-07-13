import { useEffect, useState } from "react";
import { doc, onSnapshot, setDoc } from "firebase/firestore";
import { db } from "../firebase";

// 監聽單一 Firestore 文件，回傳資料與寫入方法（不存在時回傳 defaults）
export function useDoc(path, defaults = {}) {
  const [data, setData] = useState(defaults);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const ref = doc(db, path);
    const unsub = onSnapshot(
      ref,
      (snap) => {
        setData(snap.exists() ? { ...defaults, ...snap.data() } : defaults);
        setLoading(false);
      },
      (err) => {
        console.error(`讀取 ${path} 失敗`, err);
        setLoading(false);
      }
    );
    return () => unsub();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [path]);

  const save = (values) => setDoc(doc(db, path), values, { merge: true });

  return { data, loading, save };
}
