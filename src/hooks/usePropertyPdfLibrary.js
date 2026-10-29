import { useCallback, useEffect, useRef, useState } from "react";
import { listPdfRecords, makePdfSelection, pdfLibraryError, removePdfRecord, renamePdfRecord, saveDraftPdf, saveFavoritePdfSelection } from "../lib/propertyPdfLibrary";

export function usePropertyPdfLibrary(ownerUid) {
  const [state, setState] = useState({ ownerUid, records: [], loading: true, error: "" });
  const currentOwner = useRef(ownerUid);
  currentOwner.current = ownerUid;
  const refresh = useCallback(async () => {
    try {
      const records = await listPdfRecords(ownerUid);
      if (currentOwner.current === ownerUid) setState({ ownerUid, records, loading: false, error: "" });
    } catch (error) {
      if (currentOwner.current === ownerUid) setState({ ownerUid, records: [], loading: false, error: pdfLibraryError(error) });
    }
  }, [ownerUid]);

  useEffect(() => {
    refresh();
    // Another tab can update this account's local slots. Refresh only on return,
    // without timers, cloud reads, or a realtime Firebase subscription.
    window.addEventListener("focus", refresh);
    return () => window.removeEventListener("focus", refresh);
  }, [refresh]);

  const mutate = async (operation) => {
    const record = await operation();
    await refresh();
    return record;
  };

  return {
    records: state.ownerUid === ownerUid ? state.records : [],
    loading: state.ownerUid !== ownerUid || state.loading,
    error: state.ownerUid === ownerUid ? state.error : "",
    refresh,
    saveGenerated: ({ properties, buyerId, buyerName }, pdf) => mutate(() => saveDraftPdf(ownerUid, makePdfSelection(properties, buyerId, buyerName), pdf)),
    saveFavorite: (slot, selection) => mutate(() => saveFavoritePdfSelection(ownerUid, slot, selection)),
    rename: (kind, slot, name) => mutate(() => renamePdfRecord(ownerUid, kind, slot, name)),
    remove: (kind, slot) => mutate(() => removePdfRecord(ownerUid, kind, slot)),
  };
}
