import { todayStr } from "./dates";

export function newBuyerContact({ name, phone, notes }, ownerUid) {
  return {
    name: String(name || "").trim(),
    phone: String(phone || "").trim(),
    tags: ["買方"],
    source: "",
    notes: String(notes || "").trim(),
    lastContactDate: todayStr(),
    ownerUid,
    lastModifiedByUid: ownerUid,
    sharedWith: [],
  };
}
