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
    const q = query(collection(db, name), orderBy(orderField, "desc"));
    const unsub = onSnapshot(
      q,
      (snap) => {
        setItems(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
        setLoading(false);
      },
      (err) => {
        console.error(`讀取 ${name} 失敗`, err);
        setLoading(false);
      }
    );
    return () => unsub();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [name, orderField, enabled]);

  const add = (data) =>
    addDoc(collection(db, name), { ...data, createdAt: serverTimestamp() });

  const update = (id, data) => updateDoc(doc(db, name, id), data);

  const remove = (id) => deleteDoc(doc(db, name, id));

  return { items, loading, add, update, remove };
}
