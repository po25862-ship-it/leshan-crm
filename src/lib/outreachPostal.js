import { auth } from '../firebase';
export async function lookupOutreachPostal(address, signal) {
  const user = auth.currentUser; if (!user) throw new Error('請先登入。');
  const token = await user.getIdToken();
  const response = await fetch('/api/outreach-postal', { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ address }), cache: 'no-store', signal });
  const result = await response.json(); if (!response.ok) throw new Error(result.error || '郵局查詢暫時無法連線。');
  if (auth.currentUser?.uid !== user.uid) throw new Error('登入帳號已變更。');
  return result;
}
