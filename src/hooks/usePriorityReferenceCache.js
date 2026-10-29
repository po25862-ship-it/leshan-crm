import { useCallback, useEffect, useState } from "react";
import { compactPriorityReference, loadPriorityReferences, priorityReferenceKey, savePriorityReferences } from "../lib/propertyPriorityWorklist";

function storage() { try { return window.localStorage; } catch { return null; } }

export function usePriorityReferenceCache(uid) {
  const [state, setState] = useState(() => ({ uid, records: loadPriorityReferences(uid, storage()) }));
  useEffect(() => {
    if (state.uid !== uid) setState({ uid, records: loadPriorityReferences(uid, storage()) });
  }, [uid, state.uid]);
  useEffect(() => {
    if (state.uid === uid) savePriorityReferences(uid, state.records, storage());
  }, [uid, state]);
  const recordReference = useCallback((property, data, error = "") => {
    const compact = compactPriorityReference(property, data);
    setState((current) => ({ uid, records: {
      ...(current.uid === uid ? current.records : {}),
      [property.id]: { key: priorityReferenceKey(property), data: compact, error },
    } }));
  }, [uid]);
  return { records: state.uid === uid ? state.records : {}, recordReference };
}
