import { collection, doc, getDocs, getDoc, setDoc, updateDoc, deleteDoc, writeBatch, runTransaction, query, orderBy, limit } from 'firebase/firestore';
import { ref, uploadBytes, getBlob, deleteObject } from 'firebase/storage';
import { auth, db, storage } from '../firebase';
import { validateOutreach, outreachToday, validOutreachDay, MAX_LETTER_BYTES, MAX_LIBRARY_BYTES, MAX_OUTREACH_SELECTION } from './outreachModel';

function owner(uid) { if (!uid || auth.currentUser?.uid !== uid) throw new Error('請重新登入後再試。'); return uid; }
const col = (uid, kind) => collection(db, 'outreachPrivate', owner(uid), kind);
const item = (uid, kind, id) => doc(col(uid, kind), id);
export async function listOutreach(uid) {
  const [records, letters, batches, settings] = await Promise.all(['records', 'letters', 'batches'].map(kind => getDocs(col(uid, kind))).concat(getDoc(item(uid, 'settings', 'main'))));
  owner(uid);
  const rows = snapshot => snapshot.docs.map(d => ({ ...d.data(), id: d.id }));
  return { records: rows(records).sort((a,b) => b.updatedAt - a.updatedAt), letters: rows(letters).sort((a,b) => b.createdAt - a.createdAt), batches: rows(batches).sort((a,b) => b.updatedAt - a.updatedAt), settings: settings.data() || {} };
}
export async function saveOutreach(uid, draft) {
  const data = validateOutreach(draft), target = draft.id ? item(uid, 'records', draft.id) : doc(col(uid, 'records'));
  await runTransaction(db, async tx => {
    const current = await tx.get(target); owner(uid);
    if (draft.id && !current.exists()) throw new Error('案件已不存在，請重新整理。');
    if (current.exists() && draft.revision !== current.data().revision) throw new Error('這筆案件剛在其他裝置更新，請重新整理後再修改。');
    tx.set(target, { ...data, ownerUid: uid, revision: (current.data()?.revision || 0) + 1, createdAt: current.data()?.createdAt || Date.now(), updatedAt: Date.now(), sentCount: current.data()?.sentCount || 0, lastSentOn: current.data()?.lastSentOn || '' });
  });
  return target.id;
}
export async function saveOutreachSettings(uid, settings) {
  await setDoc(item(uid, 'settings', 'main'), { ...settings, ownerUid: uid, updatedAt: Date.now() });
}
export async function outreachHistory(uid, recordId) {
  const result = await getDocs(query(collection(item(uid, 'records', recordId), 'events'), orderBy('createdAt', 'desc'), limit(100)));
  owner(uid); return result.docs.map(d => ({ ...d.data(), id: d.id }));
}
export async function logOutreachBatch(uid, records, { type, day, followOn, note = '', batchId = '', letters = [] }) {
  if (!records.length || records.length > MAX_OUTREACH_SELECTION) throw new Error('請選擇 1 至 200 筆案件。');
  if (!['已產生', '已列印', '已寄出', '追蹤', '退件'].includes(type) || !validOutreachDay(day) || day > outreachToday() || (followOn && !validOutreachDay(followOn))) throw new Error('請填已發生的正確日期與有效追蹤日期。');
  if (note.length > 3000) throw new Error('追蹤內容請縮短至 3000 字內。');
  const targets = records.map(r => item(uid, 'records', r.id));
  const eventTargets = targets.map(r => type === '已寄出' ? doc(collection(r, 'events'), `sent-${day}`) : doc(collection(r, 'events')));
  // Preserve any file referenced by history before adding events. A failed
  // reservation prevents the history from pointing at a concurrently removed file.
  const used = [...new Set(records.map(r=>r.letterId).filter(id=>letters.some(l=>l.id===id)))];
  if (used.length) { const batch = writeBatch(db); used.forEach(id => batch.update(item(uid, 'letters', id), { usedInHistory: true })); await batch.commit(); }
  await runTransaction(db, async tx => {
    const snapshots = await Promise.all(targets.map(r => tx.get(r)));
    const sent = type === '已寄出' ? await Promise.all(eventTargets.map(r => tx.get(r))) : [];
    owner(uid);
    for (let i = 0; i < snapshots.length; i++) {
      if (!snapshots[i].exists()) throw new Error('部分案件已不存在，請重新整理。');
      const previous = snapshots[i].data();
      if (previous.revision !== records[i].revision) throw new Error(`「${previous.title}」已更新，請重新整理後再操作。`);
      if (sent[i]?.exists()) throw new Error(`「${previous.title}」當天已登記寄出，請勿重複登記。`);
      if (type === '已寄出' && ['不再寄送','暫停追蹤','退件待處理'].includes(previous.status)) throw new Error(`「${previous.title}」目前不適合寄出，請先確認案件狀態。`);
    }
    snapshots.forEach((snapshot, index) => {
      const r = snapshot.data(), now = Date.now();
      const letter = letters.find(l => l.id === r.letterId);
      tx.set(eventTargets[index], { ownerUid: uid, type, day, note, followOn: followOn || '', batchId, letterId: letter?.id || '', letterName: letter?.name || '', recipient: r.recipient, address: r.address, zip: r.zip, createdAt: now });
      const changes = { revision: r.revision + 1, updatedAt: now };
      if (type === '已寄出') Object.assign(changes, { status: '已寄出', lastSentOn: day > (r.lastSentOn || '') ? day : r.lastSentOn, sentCount: r.sentCount + 1, followOn: followOn || '' });
      if (type === '追蹤') Object.assign(changes, { status: '已聯繫', followOn: followOn || '' });
      if (type === '退件') Object.assign(changes, { status: '退件待處理', followOn: followOn || '' });
      tx.update(targets[index], changes);
    });
  });
}
export async function saveOutreachSelection(uid, name, ids, id) {
  if (!name.trim() || name.length > 100 || ids.length > MAX_OUTREACH_SELECTION) throw new Error('請填批次名稱，每批最多 200 筆。');
  const target = id ? item(uid, 'batches', id) : doc(col(uid, 'batches'));
  await setDoc(target, { ownerUid: uid, name: name.trim(), recordIds: ids, updatedAt: Date.now() });
  return target.id;
}
export async function uploadOutreachLetter(uid, file, existing, sourceBytes = 0) {
  owner(uid);
  if (!file.size || file.size > MAX_LETTER_BYTES) throw new Error('每份開發信限 5MB，請先縮小檔案。');
  const bytes = new Uint8Array(await file.arrayBuffer());
  let type = bytes[0] === 37 && bytes[1] === 80 && bytes[2] === 68 && bytes[3] === 70 ? 'application/pdf' : bytes[0] === 137 && bytes[1] === 80 && bytes[2] === 78 && bytes[3] === 71 ? 'image/png' : bytes[0] === 255 && bytes[1] === 216 ? 'image/jpeg' : '';
  if (!type) throw new Error('請使用有效的 PDF、JPG 或 PNG。');
  const { PDFDocument } = await import('pdf-lib');
  let pages = 1;
  if (type === 'application/pdf') { const pdf = await PDFDocument.load(bytes); pages = pdf.getPageCount(); if (!pages || pages > 50) throw new Error('每份 PDF 請保留 1 至 50 頁。'); }
  const hash = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)), b => b.toString(16).padStart(2, '0')).join('');
  const duplicate = existing.find(l => l.id === hash); if (duplicate) return { ...duplicate, duplicate: true };
  if (existing.reduce((n, l) => n + l.size, 0) + sourceBytes + bytes.length > MAX_LIBRARY_BYTES) throw new Error('你的開發信檔案庫已達 50MB 上限，請先整理檔案。');
  const path = `outreachPrivate/${uid}/${hash}`, fileRef = ref(storage, path);
  await uploadBytes(fileRef, bytes, { contentType: type, customMetadata: { ownerUid: uid, sha256: hash }, cacheControl: 'private, no-store' });
  owner(uid);
  const meta = { ownerUid: uid, name: file.name.slice(0, 200), type, size: bytes.length, pages, storagePath: path, archived: false, usedInHistory: false, createdAt: Date.now(), updatedAt: Date.now() };
  await setDoc(item(uid, 'letters', hash), meta);
  return { ...meta, id: hash };
}
export async function readOutreachLetter(uid, letter) {
  const expected = `outreachPrivate/${owner(uid)}/${letter.id}`;
  if (letter.storagePath !== expected) throw new Error('檔案不屬於目前帳號。');
  // Authenticated download only. Never create a public token URL for a private file.
  const blob = await getBlob(ref(storage, expected), MAX_LETTER_BYTES); owner(uid); return blob;
}
export async function archiveOutreachLetter(uid, letter, archived) {
  await updateDoc(item(uid, 'letters', letter.id), { archived, updatedAt: Date.now() });
}
export async function saveOutreachTextLetter(uid, name, text) {
  if (!name.trim() || name.length > 200 || !text.trim() || text.length > 6000) throw new Error('請填範本名稱與內容，內容最多 6000 字。');
  const hash = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(name.trim()+'\n'+text))), b => b.toString(16).padStart(2, '0')).join('');
  const target = item(uid, 'letters', hash), previous = await getDoc(target);
  await setDoc(target, { ownerUid: uid, name: name.trim(), text, type: 'text/plain', size: 0, pages: 0, storagePath: '', archived: false, usedInHistory: previous.data()?.usedInHistory || false, createdAt: previous.data()?.createdAt || Date.now(), updatedAt: Date.now() });
  return hash;
}
export async function removeUnusedOutreachLetter(uid, letter, records) {
  if (records.some(r => r.letterId === letter.id)) throw new Error('這份信仍有案件使用，請先改用其他檔案。');
  const latest = await getDoc(item(uid,'letters',letter.id));
  if (!latest.exists()) return;
  if (latest.data().usedInHistory) throw new Error('這份信已有寄信或列印歷程，請用停用保留原檔。');
  if (letter.storagePath) await deleteObject(ref(storage,`outreachPrivate/${owner(uid)}/${letter.id}`));
  await deleteDoc(item(uid,'letters',letter.id));
}
