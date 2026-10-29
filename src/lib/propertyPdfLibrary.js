export const PDF_LIBRARY_LIMIT = 5;
const DATABASE = "leshan-viewing-pdf-library";
const MAX_PROPERTIES = 200;
const MAX_PDF_BYTES = 120 * 1024 * 1024;

function recordKey(ownerUid, kind, slot) {
  if (!ownerUid || !["draft", "favorite"].includes(kind) || !Number.isInteger(slot) || slot < 0 || slot >= PDF_LIBRARY_LIMIT) {
    throw new Error("請先登入，再選擇有效的儲存位置。");
  }
  return `${encodeURIComponent(ownerUid)}:${kind}:${slot}`;
}

export function makePdfSelection(properties, buyerId = "", buyerName = "", name = "") {
  if (!Array.isArray(properties) || !properties.length) throw new Error("請先勾選物件。");
  if (properties.length > MAX_PROPERTIES) throw new Error("一次最多保留 200 間物件，請分組整理。");
  const seen = new Set();
  const refs = properties.filter((property) => {
    if (!property?.id || seen.has(property.id)) return false;
    seen.add(property.id);
    return true;
  }).map((property) => ({
    id: String(property.id).slice(0, 180),
    listingNo: String(property.listingNo || "").slice(0, 80),
    title: String(property.title || property.listingNo || "未命名物件").slice(0, 160),
  }));
  if (!refs.length) throw new Error("這組物件沒有可保存的編號。");
  return {
    name: String(name || (buyerName ? `${buyerName}的帶看物件` : `帶看 ${refs.length} 間物件`)).trim().slice(0, 60),
    buyerId: String(buyerId || "").slice(0, 180),
    buyerName: String(buyerName || "").slice(0, 60),
    properties: refs,
    signature: JSON.stringify([String(buyerId || ""), refs.map((property) => property.id)]),
  };
}

export function chooseDraftSlot(records, signature) {
  const drafts = records.filter((record) => record.kind === "draft");
  const previous = drafts.find((record) => record.signature === signature);
  if (previous) return previous.slot;
  for (let slot = 0; slot < PDF_LIBRARY_LIMIT; slot += 1) {
    if (!drafts.some((record) => record.slot === slot)) return slot;
  }
  return [...drafts].sort((a, b) => (a.generatedAt || a.updatedAt) - (b.generatedAt || b.updatedAt) || a.slot - b.slot)[0].slot;
}

// Use the current property data, never the saved title/price snapshot. A unique
// listing number can reconnect a record after a property document was replaced.
export function resolvePdfSelection(record, properties) {
  const byId = new Map(properties.map((property) => [property.id, property]));
  const byNumber = new Map();
  for (const property of properties) {
    const number = String(property.listingNo || "").trim().toUpperCase();
    if (number) byNumber.set(number, [...(byNumber.get(number) || []), property]);
  }
  const resolved = [];
  const missing = [];
  for (const saved of record.properties || []) {
    const candidates = byNumber.get(String(saved.listingNo || "").trim().toUpperCase()) || [];
    const property = byId.get(saved.id) || (candidates.length === 1 ? candidates[0] : null);
    if (!property) missing.push(saved);
    else if (!resolved.some((entry) => entry.id === property.id)) resolved.push(property);
  }
  return { properties: resolved, missing };
}

function openLibrary() {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") {
      reject(new Error("這個瀏覽器無法保留暫存，請先下載 PDF，或使用一般瀏覽模式。"));
      return;
    }
    const request = indexedDB.open(DATABASE, 1);
    request.onupgradeneeded = () => {
      const db = request.result;
      const records = db.createObjectStore("records", { keyPath: "key" });
      records.createIndex("ownerUid", "ownerUid");
      db.createObjectStore("pdfFiles");
    };
    request.onerror = () => reject(request.error);
    request.onblocked = () => reject(new Error("暫存空間正在更新，請關閉其他系統分頁後重試。"));
    request.onsuccess = () => {
      const db = request.result;
      db.onversionchange = () => db.close();
      resolve(db);
    };
  });
}

async function transact(mode, run) {
  const db = await openLibrary();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(["records", "pdfFiles"], mode);
    let result;
    tx.oncomplete = () => { db.close(); resolve(result); };
    tx.onabort = () => { db.close(); reject(tx.error || new Error("暫存未完成，請重試。")); };
    tx.onerror = () => { /* onabort reports the final transaction failure. */ };
    try {
      run(tx.objectStore("records"), tx.objectStore("pdfFiles"), (value) => { result = value; });
    } catch (error) {
      tx.abort();
      db.close();
      reject(error);
    }
  });
}

export function listPdfRecords(ownerUid) {
  recordKey(ownerUid, "draft", 0);
  return transact("readonly", (records, files, done) => {
    records.index("ownerUid").getAll(ownerUid).onsuccess = (event) => done(event.target.result);
  });
}

export function saveDraftPdf(ownerUid, selection, pdf, now = Date.now()) {
  recordKey(ownerUid, "draft", 0);
  if (!(pdf?.bytes instanceof Uint8Array) || !pdf.bytes.length) throw new Error("沒有可暫存的 PDF。");
  if (pdf.bytes.length > MAX_PDF_BYTES) throw new Error("PDF 超過 120 MB，請先下載保留，或分批製作。");
  return transact("readwrite", (records, files, done) => {
    records.index("ownerUid").getAll(ownerUid).onsuccess = (event) => {
      const slot = chooseDraftSlot(event.target.result, selection.signature);
      const key = recordKey(ownerUid, "draft", slot);
      const record = {
        ...selection, key, ownerUid, kind: "draft", slot, updatedAt: now, generatedAt: now,
        filename: String(pdf.filename || "帶看物件資料表.pdf").slice(0, 200),
        pageCount: pdf.pageCount || 0, fileCount: pdf.fileCount || 0, summaryCount: pdf.summaryCount || 0,
        hasPdf: true,
      };
      records.put(record);
      files.put(pdf.bytes, key);
      done(record);
    };
  });
}

export function saveFavoritePdfSelection(ownerUid, slot, selection, now = Date.now()) {
  const key = recordKey(ownerUid, "favorite", slot);
  return transact("readwrite", (records, files, done) => {
    const record = { ...selection, key, ownerUid, kind: "favorite", slot, updatedAt: now, hasPdf: false };
    records.put(record);
    done(record);
  });
}

export function readSavedPdf(ownerUid, slot) {
  const key = recordKey(ownerUid, "draft", slot);
  return transact("readonly", (records, files, done) => {
    files.get(key).onsuccess = (event) => {
      const bytes = event.target.result;
      done(bytes instanceof Uint8Array ? bytes : null);
    };
  });
}

export function renamePdfRecord(ownerUid, kind, slot, name, now = Date.now()) {
  const key = recordKey(ownerUid, kind, slot);
  const cleanName = String(name || "").trim().slice(0, 60);
  if (!cleanName) throw new Error("請輸入紀錄名稱。");
  return transact("readwrite", (records, files, done) => {
    records.get(key).onsuccess = (event) => {
      const record = event.target.result;
      if (!record) return done(null);
      const updated = { ...record, name: cleanName, updatedAt: now };
      records.put(updated);
      done(updated);
    };
  });
}

export function removePdfRecord(ownerUid, kind, slot) {
  const key = recordKey(ownerUid, kind, slot);
  return transact("readwrite", (records, files) => {
    records.delete(key);
    files.delete(key);
  });
}

export function pdfLibraryError(error) {
  return error?.name === "QuotaExceededError"
    ? "這台裝置的暫存空間已滿。PDF 仍可下載；請刪除不需要的暫存後重試。"
    : error?.message || "無法讀寫這台裝置的暫存，請先下載 PDF 保留。";
}
