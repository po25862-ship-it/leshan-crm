import { useEffect, useState } from "react";
import { collectionGroup, onSnapshot, query, where } from "firebase/firestore";
import { db } from "../firebase";

const MAIN_OWNER_UID = "KiYlsnWcChW5muRkG167r7Mi1132";

// 跟 useSharedCollection 邏輯一樣，但用在「跨所有客戶底下」這種 collectionGroup 查詢
// （例如所有賣方委託物件），同事登入時只抓自己的＋分享給自己的，你登入則抓全部
export function useSharedCollectionGroup(name, currentUid) {
  const [items, setItems] = useState([]);
  const isMainOwner = currentUid === MAIN_OWNER_UID;

  useEffect(() => {
    if (!currentUid) return;

    if (isMainOwner) {
      const q = collectionGroup(db, name);
      const unsub = onSnapshot(
        q,
        (snap) => {
          setItems(snap.docs.map((d) => ({ id: d.id, parentId: d.ref.parent.parent ? d.ref.parent.parent.id : null, ...d.data() })));
        },
        (err) => console.error(`讀取 ${name}（跨集合）失敗`, err)
      );
      return () => unsub();
    }

    let ownItems = [];
    let sharedItems = [];
    const merge = () => {
      const map = {};
      [...ownItems, ...sharedItems].forEach((it) => (map[it.id] = it));
      setItems(Object.values(map));
    };

    const qOwn = query(collectionGroup(db, name), where("ownerUid", "==", currentUid));
    const unsub1 = onSnapshot(
      qOwn,
      (snap) => {
        ownItems = snap.docs.map((d) => ({ id: d.id, parentId: d.ref.parent.parent ? d.ref.parent.parent.id : null, ...d.data() }));
        merge();
      },
      (err) => console.error(`讀取 ${name}（自己的，跨集合）失敗`, err)
    );

    const qShared = query(collectionGroup(db, name), where("sharedWith", "array-contains", currentUid));
    const unsub2 = onSnapshot(
      qShared,
      (snap) => {
        sharedItems = snap.docs.map((d) => ({ id: d.id, parentId: d.ref.parent.parent ? d.ref.parent.parent.id : null, ...d.data() }));
        merge();
      },
      (err) => console.error(`讀取 ${name}（分享給我的，跨集合）失敗`, err)
    );

    return () => {
      unsub1();
      unsub2();
    };
  }, [name, currentUid, isMainOwner]);

  return items;
}
