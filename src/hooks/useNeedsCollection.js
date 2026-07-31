import { useEffect, useState } from "react";
import {
  collection,
  onSnapshot,
  query,
  where,
  orderBy,
  addDoc,
  updateDoc,
  deleteDoc,
  doc,
  serverTimestamp,
} from "firebase/firestore";
import { db } from "../firebase";

const MAIN_OWNER_UID = "KiYlsnWcChW5muRkG167r7Mi1132";

// 客需的分享機制比較簡單：不是分享給特定同事，是「打開分享開關後，任何登入帳號都看得到」
// 所以抓資料要分成「自己的」+「別人設成分享的」兩條線合併
export function useNeedsCollection(currentUid) {
  const [items, setItems] = useState([]);
  const isMainOwner = currentUid === MAIN_OWNER_UID;

  useEffect(() => {
    if (!currentUid) return;

    if (isMainOwner) {
      const q = query(collection(db, "needs"), orderBy("createdAt", "desc"));
      const unsub = onSnapshot(q, (snap) => {
        setItems(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
      }, (err) => console.error("讀取 needs 失敗", err));
      return () => unsub();
    }

    let ownItems = [];
    let sharedItems = [];
    const merge = () => {
      const map = {};
      [...ownItems, ...sharedItems].forEach((it) => (map[it.id] = it));
      setItems(Object.values(map));
    };

    const qOwn = query(collection(db, "needs"), where("ownerUid", "==", currentUid));
    const unsub1 = onSnapshot(qOwn, (snap) => {
      ownItems = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      merge();
    }, (err) => console.error("讀取 needs（自己的）失敗", err));

    const qShared = query(collection(db, "needs"), where("shared", "==", true));
    const unsub2 = onSnapshot(qShared, (snap) => {
      sharedItems = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      merge();
    }, (err) => console.error("讀取 needs（已分享的）失敗", err));

    return () => {
      unsub1();
      unsub2();
    };
  }, [currentUid, isMainOwner]);

  const add = (data) => addDoc(collection(db, "needs"), { ...data, createdAt: serverTimestamp() });
  const update = (id, data) => updateDoc(doc(db, "needs", id), data);
  const remove = (id) => deleteDoc(doc(db, "needs", id));

  return { items, add, update, remove };
}
