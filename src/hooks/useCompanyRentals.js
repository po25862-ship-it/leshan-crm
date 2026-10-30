import { useCallback, useEffect, useState } from "react";
import { loadReadCache, subscribeReadCache } from "./firestoreReadCache";
import { companyRentalCacheKey, readCompanyRentals } from "../lib/companyRentalRepository";

export function useCompanyRentals(uid) {
  const [state, setState] = useState({ items: [], loading: true, error: null });
  const key = companyRentalCacheKey(uid);
  const load = useCallback((force = false) => loadReadCache(key, readCompanyRentals, force), [key]);
  useEffect(() => {
    const unsubscribe = subscribeReadCache(key, value => setState({ items: value.data || [], loading: value.loading && value.data === undefined, error: value.error }));
    load().catch(() => {});
    return unsubscribe;
  }, [key, load]);
  return { ...state, refresh: () => load(true) };
}
