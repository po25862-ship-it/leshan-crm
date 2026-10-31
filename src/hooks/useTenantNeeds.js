import { useCallback, useEffect, useState } from "react";
import { loadReadCache, subscribeReadCache } from "./firestoreReadCache";
import { readTenantNeeds, tenantNeedsCacheKey } from "../lib/tenantNeedRepository";
export function useTenantNeeds(uid) {
  const key = tenantNeedsCacheKey(uid), [state,setState] = useState({ items:[], loading:true, error:null });
  const load = useCallback((force=false) => loadReadCache(key, () => readTenantNeeds(uid), force), [key,uid]);
  useEffect(() => {
    const unsubscribe = subscribeReadCache(key, value => setState({ items:value.data || [], loading:value.loading && value.data === undefined, error:value.error }));
    load().catch(()=>{}); return unsubscribe;
  }, [key,load]);
  return { ...state, refresh:() => load(true) };
}
