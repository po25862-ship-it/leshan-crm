export const OUTREACH_STATUSES = ['待寄出', '已寄出', '已聯繫', '退件待處理', '暫停追蹤', '不再寄送'];
export const MAX_OUTREACH_SELECTION = 200;
export const MAX_LETTER_BYTES = 5 * 1024 * 1024;
export const MAX_LIBRARY_BYTES = 50 * 1024 * 1024;
export const EMPTY_OUTREACH = { title: '', listingNo: '', propertyId: '', propertyAddress: '', url: '', recipient: '', address: '', zip: '', zipVerifiedAddress: '', letterId: '', status: '待寄出', followOn: '', notes: '', caseId: '', caseKey: '', sourceOwnerKey: '' };
export function outreachToday(now = new Date()) {
  return new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Taipei' }).format(now);
}
export function shiftOutreachDay(day, offset) {
  const d = new Date(`${day}T00:00:00Z`); d.setUTCDate(d.getUTCDate() + offset); return d.toISOString().slice(0, 10);
}
export const normalizeOutreachAddress = value => String(value || '').normalize('NFKC').replace(/臺/g, '台').replace(/[\s，,。]/g, '').trim();
export function validOutreachDay(day) { if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return false; const parsed = new Date(day+'T00:00:00Z'); return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0,10) === day; }
export function outreachFields(input) {
  return Object.fromEntries(Object.keys(EMPTY_OUTREACH).map(key => [key, String(input[key] ?? EMPTY_OUTREACH[key]).trim()]));
}
export function validateOutreach(input) {
  const d = outreachFields(input);
  if (!d.title || !d.recipient || !d.address) throw new Error('請填案件名稱、收件人與完整收件地址。');
  if (d.title.length > 200 || d.address.length > 500 || d.recipient.length > 100 || d.notes.length > 3000) throw new Error('內容太長，請縮短案件名稱、地址或備註。');
  if (d.zip && !/^\d{6}$/.test(d.zip)) throw new Error('郵遞區號須為六碼；不確定時可先留白。');
  if (d.url) { let url; try { url = new URL(d.url); } catch { throw new Error('請填完整案件網址。'); } if (!['https:', 'http:'].includes(url.protocol) || d.url.length > 2000) throw new Error('案件網址只支援 http 或 https。'); }
  if (!OUTREACH_STATUSES.includes(d.status)) throw new Error('案件狀態不正確。');
  if (d.followOn && !validOutreachDay(d.followOn)) throw new Error('請填正確追蹤日期。');
  if (d.caseId && !/^[a-f0-9]{64}$/.test(d.caseId)) throw new Error('案件連結格式不正確。');
  if (d.caseKey.length > 300 || d.sourceOwnerKey.length > 40) throw new Error('案件來源資料過長。');
  return d;
}
export function duplicateOutreach(records, candidate) {
  return records.find(r => {
    if (r.id === candidate.id) return false;
    if (r.caseId && candidate.caseId && r.caseId !== candidate.caseId) return false;
    if (r.caseId && r.caseId === candidate.caseId && r.sourceOwnerKey && candidate.sourceOwnerKey && r.sourceOwnerKey !== candidate.sourceOwnerKey) return false;
    if ((r.caseId || candidate.caseId) && r.propertyAddress && candidate.propertyAddress && normalizeOutreachAddress(r.propertyAddress) !== normalizeOutreachAddress(candidate.propertyAddress)) return false;
    return normalizeOutreachAddress(r.address) === normalizeOutreachAddress(candidate.address) && normalizeOutreachAddress(r.recipient) === normalizeOutreachAddress(candidate.recipient);
  });
}
export function followLabel(record, today = outreachToday()) {
  if (['不再寄送', '暫停追蹤'].includes(record.status)) return record.status;
  if (!record.followOn) return '尚未安排追蹤';
  if (record.followOn > today) return `${record.followOn} 追蹤`;
  if (record.followOn === today) return '今天要追蹤';
  return `已逾期 ${Math.round((Date.parse(today) - Date.parse(record.followOn)) / 86400000)} 天`;
}
export function outreachPrintProblems(record, letters, settings, mode) {
  const problems = [];
  if (['不再寄送', '暫停追蹤', '退件待處理'].includes(record.status)) problems.push(`目前是「${record.status}」，請先確認狀態`);
  if (mode !== 'labels' && !letters.some(l => l.id === record.letterId && !l.archived)) problems.push('尚未指定可用開發信');
  if (mode !== 'letters') {
    if (!record.recipient || !record.address) problems.push('收件人或地址待補');
    if (!/^\d{6}$/.test(record.zip) || normalizeOutreachAddress(record.zipVerifiedAddress) !== normalizeOutreachAddress(record.address)) problems.push('請核對地址與六碼郵遞區號');
    if (!settings.senderAddress || !/^\d{6}$/.test(settings.senderZip || '') || normalizeOutreachAddress(settings.senderZipVerifiedAddress) !== normalizeOutreachAddress(settings.senderAddress)) problems.push('固定寄件地址與郵遞區號尚未確認');
  }
  return problems;
}
export function outreachFromProperty(property) {
  return { ...EMPTY_OUTREACH, title: property.title || property.listingNo || '物件開發', propertyId: property.id || '', listingNo: property.listingNo || '', propertyAddress: property.address || '', url: property.websiteUrl || '' };
}
export function safeOutreachFilename(name) { return String(name).replace(/[\\/:*?"<>|\u0000-\u001f]/g, '_').slice(0, 100); }
