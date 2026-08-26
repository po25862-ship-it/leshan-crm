import { useEffect, useState } from "react";
import { collection, onSnapshot } from "firebase/firestore";
import { db } from "../firebase";

// 逐一訂閱使用者實際看得到的買方，避免 collectionGroup 查詢因分享權限無法證明而被整批拒絕。
export function useAppointmentsForContacts(contactIds) {
  const [byContact, setByContact] = useState({});
  const key = JSON.stringify(contactIds || []);

  useEffect(() => {
    if (!contactIds?.length) {
      setByContact({});
      return undefined;
    }
    const unsubscribers = contactIds.map((contactId) => onSnapshot(
      collection(db, `contacts/${contactId}/appointments`),
      (snapshot) => setByContact((current) => ({
        ...current,
        [contactId]: snapshot.docs.map((document) => ({ id: document.id, parentId: contactId, ...document.data() })),
      })),
      () => setByContact((current) => ({ ...current, [contactId]: [] }))
    ));
    return () => unsubscribers.forEach((unsubscribe) => unsubscribe());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  return Object.values(byContact).flat();
}
