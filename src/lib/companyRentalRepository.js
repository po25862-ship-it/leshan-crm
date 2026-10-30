import { collection, doc, getDoc, getDocs, runTransaction, serverTimestamp } from "firebase/firestore";
import { ref, uploadBytes, getDownloadURL, deleteObject } from "firebase/storage";
import { db, storage } from "../firebase";
import { canEditCompanyRental, rentalSavePayload, validateCompanyRental, normalizeRentalFurniture, MAX_RENTAL_PHOTO_BYTES, MAX_RENTAL_PHOTOS, validRentalDate } from "./companyRental";
import { normalizeTimeInput } from "./timeInput";
import { todayTaipeiStr } from "./dates";
import { updateReadCache } from "../hooks/firestoreReadCache";
import { rentalWebsiteKey, rentalWebsitePatch, rentalCheckTime } from "./companyRentalWebsite";

export const COMPANY_RENTAL_COLLECTION = "companyRentals";
export const companyRentalCacheKey = uid => `companyRentals::${uid}`;
const snapshotRow = snap => snap.exists() ? { id: snap.id, ...snap.data() } : null;
export async function readCompanyRentals() { return (await getDocs(collection(db, COMPANY_RENTAL_COLLECTION))).docs.map(snapshotRow); }
export async function readRentalInternal(id) { return (await getDoc(doc(db, COMPANY_RENTAL_COLLECTION, id, "internal", "details"))).data() || {}; }
function publishLocal(uid, row) {
  updateReadCache(companyRentalCacheKey(uid), current => [row, ...(Array.isArray(current) ? current : []).filter(item => item.id !== row.id)]);
}
const storedPhoto = photo => Object.fromEntries(["id", "sha256", "name", "size", "originalSize", "type", "url", "storagePath"].filter(key => photo[key] !== undefined).map(key => [key, photo[key]]));
export async function saveCompanyRental({ original, form, status, photos, user, profile, onProgress }) {
  const error = validateCompanyRental(form, status, photos); if (error) throw new Error(error);
  if (original && !canEditCompanyRental(original, user.uid)) throw new Error("只有建案同事或管理者可以編輯。");
  const target = original?.id ? doc(db, COMPANY_RENTAL_COLLECTION, original.id) : doc(collection(db, COMPANY_RENTAL_COLLECTION));
  const ownerUid = original?.ownerUid || user.uid, uploaded = [], nextPhotos = [];
  try {
    for (const [index, photo] of photos.entries()) {
      if (!photo.blob) { nextPhotos.push(storedPhoto(photo)); continue; }
      if (photo.blob.size > MAX_RENTAL_PHOTO_BYTES || photo.blob.type !== "image/jpeg") throw new Error("照片必須是 300KB 內的 JPG。");
      if (!/^[a-f0-9]{64}$/.test(photo.sha256 || "")) throw new Error("照片識別資料不完整，請重新選取照片。");
      const uploadId = crypto.randomUUID();
      const storagePath = `companyRentals/${ownerUid}/${target.id}/${photo.sha256}-${uploadId}.jpg`, storageRef = ref(storage, storagePath);
      await uploadBytes(storageRef, photo.blob, { contentType: "image/jpeg", cacheControl: "private, max-age=3600" });
      uploaded.push(storagePath);
      nextPhotos.push(storedPhoto({ ...photo, storagePath, url: await getDownloadURL(storageRef) }));
      onProgress?.(`照片 ${index + 1}／${photos.length} 已上傳`);
    }
    const { listing, internal } = rentalSavePayload(form, status);
    let saved;
    await runTransaction(db, async transaction => {
      const snap = await transaction.get(target), current = snapshotRow(snap);
      if (current && (!canEditCompanyRental(current, user.uid) || current.ownerUid !== ownerUid)) throw new Error("本案權限已變更，請重新整理。");
      if (original && (!current || (current.revision || 0) !== (original.revision || 0))) throw new Error("這筆案件已被其他人更新，請先重新整理再編輯。");
      if (!original && current) throw new Error("案件已存在，請重新開啟資料。");
      if (nextPhotos.length > MAX_RENTAL_PHOTOS) throw new Error("每案最多 10 張照片。");
      const equipmentCatalog = normalizeRentalFurniture([...normalizeRentalFurniture(current?.equipmentCatalog), ...normalizeRentalFurniture(current?.furniture), ...listing.equipmentCatalog]);
      const equipmentError = validateCompanyRental({ ...form, equipmentCatalog }, status, photos); if (equipmentError) throw new Error(equipmentError);
      const website = { ...listing };
      if (current && rentalWebsiteKey(current.websiteUrl) === rentalWebsiteKey(listing.websiteUrl)) {
        if ((rentalCheckTime(current.websiteCheckedAt) || 0) > (rentalCheckTime(listing.websiteCheckedAt) || 0)) {
          for (const key of ["websiteCheckStatus", "websiteCheckedUrl", "websiteCheckedAt"]) if (current[key] !== undefined) website[key] = current[key];
          website.websiteCheckedAt = rentalCheckTime(current.websiteCheckedAt) || 0;
        }
        if (original && form.websiteExpiresOn === (original.websiteExpiresOn || "") && form.websiteExpirySource === (original.websiteExpirySource || "")) {
          website.websiteExpiresOn = current.websiteExpiresOn || ""; website.websiteExpirySource = current.websiteExpirySource || "";
        }
      }
      const payload = { ...website, equipmentCatalog, ownerUid, photos: nextPhotos, revision: (current?.revision || 0) + 1, createdAt: current?.createdAt || serverTimestamp(), updatedAt: serverTimestamp(), lastModifiedByUid: user.uid };
      transaction.set(target, payload);
      transaction.set(doc(db, COMPANY_RENTAL_COLLECTION, target.id, "internal", "details"), { ...internal, updatedAt: serverTimestamp() });
      saved = { id: target.id, ...payload, createdAt: current?.createdAt || new Date(), updatedAt: new Date() };
    });
    publishLocal(user.uid, saved);
    // Only unlinking a saved photo removes its storage object; canceling a form never does.
    const cleanupFailures = [];
    for (const old of original?.photos || []) {
      if (!nextPhotos.some(photo => photo.storagePath === old.storagePath) && old.storagePath?.startsWith(`companyRentals/${ownerUid}/${target.id}/`)) {
        try { await deleteObject(ref(storage, old.storagePath)); } catch (error) { if (error.code !== "storage/object-not-found") cleanupFailures.push(old.name); }
      }
    }
    return { rental: saved, cleanupFailures };
  } catch (error) {
    for (const path of uploaded) {
      if (!(original?.photos || []).some(photo => photo.storagePath === path)) {
        try { await deleteObject(ref(storage, path)); } catch { /* Preserve the original error; never delete another save’s photo. */ }
      }
    }
    throw error;
  }
}
export async function saveRentalWebsiteCheck(rental, info, user) {
  if (!canEditCompanyRental(rental, user.uid)) return null;
  const target = doc(db, COMPANY_RENTAL_COLLECTION, rental.id); let saved = null;
  await runTransaction(db, async transaction => {
    const current = snapshotRow(await transaction.get(target));
    if (!current || !canEditCompanyRental(current, user.uid) || rentalWebsiteKey(current.websiteUrl) !== rentalWebsiteKey(rental.websiteUrl)) return;
    const patch = rentalWebsitePatch(current, info);
    if (!patch || (rentalCheckTime(current.websiteCheckedAt) || 0) > Date.parse(info.checkedAt)) return;
    // Source metadata does not reorder listings or invalidate a colleague's open edit form.
    transaction.update(target, { ...patch, lastModifiedByUid: user.uid });
    saved = { ...current, ...patch, lastModifiedByUid: user.uid };
  });
  if (saved) publishLocal(user.uid, saved);
  return saved;
}
export async function setCompanyRentalStatus(rental, status, user) {
  if (!["available", "rented", "paused", "draft"].includes(status)) throw new Error("招租狀態不正確。");
  const target = doc(db, COMPANY_RENTAL_COLLECTION, rental.id); let next;
  await runTransaction(db, async transaction => {
    const current = snapshotRow(await transaction.get(target));
    if (!current || !canEditCompanyRental(current, user.uid)) throw new Error("只有建案同事或管理者可以變更狀態。");
    if (status === "available") {
      const internal = (await transaction.get(doc(db, COMPANY_RENTAL_COLLECTION, rental.id, "internal", "details"))).data() || {};
      const error = validateCompanyRental({ ...current, ...internal }, status, current.photos || []);
      if (error) throw new Error(error);
    }
    const patch = { status, revision: (current.revision || 0) + 1, updatedAt: serverTimestamp(), lastModifiedByUid: user.uid };
    transaction.update(target, patch); next = { ...current, ...patch, updatedAt: new Date() };
  });
  publishLocal(user.uid, next); return next;
}
export async function saveRentalViewing({ rental, user, contact, newName, newPhone, date, time, notes }) {
  const normalizedTime = normalizeTimeInput(time);
  if (!validRentalDate(date) || !normalizedTime) throw new Error("請填寫有效日期與時間，例如 14:30。");
  if (!contact && !String(newName || "").trim()) throw new Error("請選擇客人或輸入新客人姓名。");
  const contactRef = contact ? doc(db, "contacts", contact.id) : doc(collection(db, "contacts"));
  const appointmentRef = doc(collection(contactRef, "appointments"));
  const today = todayTaipeiStr();
  await runTransaction(db, async transaction => {
    const latest = snapshotRow(await transaction.get(doc(db, COMPANY_RENTAL_COLLECTION, rental.id)));
    const customer = contact ? await transaction.get(contactRef) : null;
    if (!latest || latest.status !== "available") throw new Error("這間物件目前不在招租中，請重新確認。");
    if (contact && !customer.exists()) throw new Error("客戶資料已變更，請重新選擇。");
    if (!contact) transaction.set(contactRef, { name: String(newName).trim().slice(0, 80), phone: String(newPhone || "").trim().slice(0, 40), tags: ["買方", "租賃"], ownerUid: user.uid, sharedWith: [], lastContactDate: today, createdAt: serverTimestamp() });
    else transaction.update(contactRef, { lastContactDate: today });
    transaction.set(appointmentRef, { date, time: normalizedTime, propertyLabel: latest.title, propertyId: null, companyRentalId: rental.id, notes: String(notes || "").slice(0, 3000), byUid: user.uid, createdAt: serverTimestamp() });
  });
  const localCustomer = contact ? { ...contact, lastContactDate: today } : { id: contactRef.id, name: String(newName).trim(), phone: newPhone || "", tags: ["買方", "租賃"], ownerUid: user.uid, sharedWith: [], lastContactDate: today, createdAt: new Date() };
  updateReadCache(`sharedCollection::contacts::${user.uid}`, current => [localCustomer, ...(Array.isArray(current) ? current : []).filter(item => item.id !== contactRef.id)]);
  updateReadCache(`collection::contacts/${contactRef.id}/appointments`, current => [{ id: appointmentRef.id, date, time: normalizedTime, propertyLabel: rental.title, companyRentalId: rental.id, byUid: user.uid }, ...(Array.isArray(current) ? current : [])]);
  return { contactId: contactRef.id, appointmentId: appointmentRef.id };
}
