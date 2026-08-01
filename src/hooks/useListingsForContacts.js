import { useEffect, useState } from "react";
import { collection, onSnapshot } from "firebase/firestore";
import { db } from "../firebase";

// 針對「已經確定看得到」的客戶清單，各自訂閱他底下的 listings 子集合，合併起來
// 用意是避開 collectionGroup（跨集合）查詢在權限規則限制下，同事登入時會被整個擋掉的問題
// （這種寫法已經在買方/賣方詳情頁的子集合驗證過可以正常運作）
export function useListingsForContacts(contactIds) {
  const [listingsByContact, setListingsByContact] = useState({});

  useEffect(() => {
    if (!contactIds || contactIds.length === 0) {
      setListingsByContact({});
      return;
    }
    const unsubs = contactIds.map((contactId) => {
      const q = collection(db, `contacts/${contactId}/listings`);
      return onSnapshot(
        q,
        (snap) => {
          const docs = snap.docs.map((d) => ({ id: d.id, contactId, ...d.data() }));
          setListingsByContact((prev) => ({ ...prev, [contactId]: docs }));
        },
        (err) => console.error(`讀取委託物件失敗（${contactId}）`, err)
      );
    });
    return () => unsubs.forEach((u) => u());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JSON.stringify(contactIds)]);

  // 攤平成單一陣列，格式跟原本 useCollectionGroup 回傳的一致（多一個 parentId 方便沿用舊邏輯）
  const items = Object.entries(listingsByContact).flatMap(([contactId, listings]) =>
    listings.map((l) => ({ ...l, parentId: contactId }))
  );

  return items;
}
