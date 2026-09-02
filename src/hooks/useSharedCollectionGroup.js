import { useCallback, useEffect, useMemo, useState } from "react";
import { collectionGroup, getDocs, query, where } from "firebase/firestore";
import { db } from "../firebase";
import { loadReadCache, subscribeReadCache } from "./firestoreReadCache";

const MAIN_OWNER_UID = "KiYlsnWcChW5muRkG167r7Mi1132";

function mapDocument(item) {
  return {
    id: item.id,
    parentId: item.ref.parent.parent ? item.ref.parent.parent.id : null,
    ...item.data(),
  };
}

function mergeSnapshots(snapshots) {
  const merged = new Map();
  snapshots.forEach((snapshot) => snapshot.docs.forEach((item) => {
    const data = mapDocument(item);
    merged.set(`${data.parentId || ""}/${data.id}`, data);
  }));
  return [...merged.values()];
}

export function useSharedCollectionGroup(name, currentUid) {
  const isMainOwner = currentUid === MAIN_OWNER_UID;
  const key = useMemo(
    () => `sharedCollectionGroup::${name}::${currentUid || "signed-out"}`,
    [currentUid, name]
  );
  const [items, setItems] = useState([]);

  const load = useCallback((force = false) => {
    if (!currentUid) return Promise.resolve([]);
    return loadReadCache(
      key,
      async () => {
        if (isMainOwner) {
          return mergeSnapshots([await getDocs(collectionGroup(db, name))]);
        }
        const [own, shared] = await Promise.all([
          getDocs(query(collectionGroup(db, name), where("ownerUid", "==", currentUid))),
          getDocs(query(collectionGroup(db, name), where("sharedWith", "array-contains", currentUid))),
        ]);
        return mergeSnapshots([own, shared]);
      },
      force
    ).catch((error) => {
      console.error(`讀取 ${name}（跨集合）失敗`, error);
      return [];
    });
  }, [currentUid, isMainOwner, key, name]);

  useEffect(() => {
    if (!currentUid) {
      setItems([]);
      return undefined;
    }
    const unsubscribe = subscribeReadCache(key, (state) => {
      if (state.data !== undefined) setItems(state.data);
    });
    load(false);
    return unsubscribe;
  }, [currentUid, key, load]);

  return items;
}
