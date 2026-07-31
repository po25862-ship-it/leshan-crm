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

// 主要負責人（你）永遠看得到全部資料，不受分享名單限制
const MAIN_OWNER_UID = "KiYlsnWcChW5muRkG167r7Mi1132";

// 跟 useCollection 很像，但同事登入時只會抓「自己建立的」+「別人分享給自己的」，
// 你（主要負責人）登入則跟以前一樣抓全部
export function useSharedCollection(name, orderField, currentUid) {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const isMainOwner = currentUid === MAIN_OWNER_UID;

  useEffect(() => {
    if (!currentUid) return;

    if (isMainOwner) {
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
    }

    // 同事帳號：分兩條線監聽，合併起來
    let ownItems = [];
    let sharedItems = [];
    const merge = () => {
      const map = {};
      [...ownItems, ...sharedItems].forEach((it) => (map[it.id] = it));
      const merged = Object.values(map).sort((a, b) => {
        const av = a[orderField] || "";
        const bv = b[orderField] || "";
        return av < bv ? 1 : av > bv ? -1 : 0;
      });
      setItems(merged);
      setLoading(false);
    };

    const qOwn = query(collection(db, name), where("ownerUid", "==", currentUid));
    const unsub1 = onSnapshot(qOwn, (snap) => {
      ownItems = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      merge();
    }, (err) => console.error(`讀取 ${name}（自己的）失敗`, err));

    const qShared = query(collection(db, name), where("sharedWith", "array-contains", currentUid));
    const unsub2 = onSnapshot(qShared, (snap) => {
      sharedItems = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      merge();
    }, (err) => console.error(`讀取 ${name}（分享給我的）失敗`, err));

    return () => {
      unsub1();
      unsub2();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [name, orderField, currentUid, isMainOwner]);

  const add = (data) => addDoc(collection(db, name), { ...data, createdAt: serverTimestamp() });
  const update = (id, data) => updateDoc(doc(db, name, id), data);
  const remove = (id) => deleteDoc(doc(db, name, id));

  return { items, loading, add, update, remove };
}
