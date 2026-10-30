import { doc, getDocFromServer } from "firebase/firestore";
import { db } from "../firebase";

export async function readLatestPdfProperties(properties, read = (id) => getDocFromServer(doc(db, "properties", id))) {
  const rows = new Array(properties.length);
  let cursor = 0;
  async function worker() {
    while (cursor < properties.length) {
      const index = cursor++, property = properties[index];
      let snapshot;
      try { snapshot = await read(property.id); }
      catch { throw new Error(`無法取得「${property.title || property.listingNo || "物件"}」的最新售價，請確認網路連線後重試。`); }
      if (!snapshot.exists()) throw new Error(`「${property.title || property.listingNo || "物件"}」已不存在，請重新選擇物件。`);
      rows[index] = { ...snapshot.data(), id: property.id };
    }
  }
  await Promise.all(Array.from({ length: Math.min(properties.length, 6) }, worker));
  return rows;
}
