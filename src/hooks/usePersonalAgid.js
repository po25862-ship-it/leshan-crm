import { useAuth } from "../AuthContext";
import { useDoc } from "./useDoc";
import { MAIN_OWNER_AGID, MAIN_OWNER_UID } from "../lib/url";

export function usePersonalAgid() {
  const { user } = useAuth();
  const defaultAgid = user?.uid === MAIN_OWNER_UID ? MAIN_OWNER_AGID : "";
  const path = user ? `userSettings/${user.uid}` : "userSettings/_placeholder";
  const { data, loading, save } = useDoc(path, { agid: defaultAgid });
  const agid = String(data.agid || defaultAgid).trim();

  return {
    agid,
    loading,
    saveAgid: (value) => save({ agid: String(value || "").trim() }),
  };
}
