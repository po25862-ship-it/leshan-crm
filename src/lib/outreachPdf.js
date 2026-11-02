import { PDFDocument } from 'pdf-lib';
const MM = 72 / 25.4, A4 = [210 * MM, 297 * MM];
export function wrapOutreachText(ctx, text, width) {
  const lines = []; let line = '';
  for (const char of String(text)) {
    if (char === '\n') { lines.push(line); line = ''; continue; }
    if (line && ctx.measureText(line + char).width > width) { lines.push(line); line = char; } else line += char;
  }
  lines.push(line); return lines;
}
const font = (ctx, size, weight = 500) => { ctx.font = `${weight} ${size}px "Noto Sans TC","PingFang TC","Microsoft JhengHei",sans-serif`; };
async function png(canvas) { const blob = await new Promise(r => canvas.toBlob(r, 'image/png')); if (!blob) throw new Error('目前無法製作列印圖片。'); return new Uint8Array(await blob.arrayBuffer()); }
export function createLabelGeometry(count, start = 1, offsetX = 0, offsetY = 0) {
  if (!Number.isInteger(start) || start < 1 || start > 8 || !Number.isFinite(offsetX) || !Number.isFinite(offsetY) || Math.abs(offsetX) > 4 || Math.abs(offsetY) > 4) throw new Error('標籤起始格或校正值不正確。');
  return Array.from({ length: count }, (_, n) => { const slot = start - 1 + n; return { page: Math.floor(slot / 8), slot: slot % 8, x: (slot % 2 * 105 + offsetX) * MM, y: (297 - .5 - (Math.floor(slot % 8 / 2) + 1) * 74 - offsetY) * MM, width: 105 * MM, height: 74 * MM }; });
}
async function labelImage(record, sender) {
  const canvas = document.createElement('canvas'); canvas.width = 1240; canvas.height = 874;
  const ctx = canvas.getContext('2d'); if (!ctx) throw new Error('瀏覽器無法繪製標籤。');
  ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, 1240, 874); ctx.fillStyle = '#111';
  font(ctx, 38); const senderLines = wrapOutreachText(ctx, `寄件：${sender.senderZip} ${sender.senderAddress}`, 1120);
  if (senderLines.length > 3) throw new Error('寄件地址過長，請縮短後再印。');
  senderLines.forEach((line, i) => ctx.fillText(line, 60, 90 + i * 49));
  font(ctx, 96, 700); ctx.fillText(record.zip, 60, 315);
  let size = 65, lines;
  do { font(ctx, size); lines = wrapOutreachText(ctx, record.address, 1120); if (lines.length <= 4) break; size -= 2; } while (size >= 40);
  if (lines.length > 4) throw new Error(`「${record.title}」收件地址過長，請先整理。`);
  lines.forEach((line, i) => ctx.fillText(line, 60, 410 + i * 78));
  font(ctx, 64, 700); const recipientLines = wrapOutreachText(ctx, `${record.recipient} 收`, 1120);
  if (recipientLines.length > 1) throw new Error(`「${record.title}」收件人名稱過長，請縮短。`);
  ctx.fillText(recipientLines[0], 60, 785); return png(canvas);
}
export async function createOutreachLabels(records, settings, { start = 1, offsetX = 0, offsetY = 0 } = {}, renderLabel = labelImage) {
  const doc = await PDFDocument.create(), positions = createLabelGeometry(records.length, start, offsetX, offsetY);
  doc.setTitle('開發信收件標籤'); doc.catalog.set(doc.context.obj('ViewerPreferences'), doc.context.obj({ PrintScaling: 'None' }));
  for (const [index, record] of records.entries()) {
    const p = positions[index]; while (doc.getPageCount() <= p.page) doc.addPage(A4);
    const image = await doc.embedPng(await renderLabel(record, settings)); doc.getPage(p.page).drawImage(image, { x: p.x, y: p.y, width: p.width, height: p.height });
  }
  if (!doc.getPageCount()) throw new Error('請先選擇收件人。');
  return { bytes: await doc.save(), pages: doc.getPageCount() };
}
export function fillOutreachTemplate(text, record) {
  const fields = { 姓名: record.recipient, 案名: record.title, 地址: record.address, 物件地址: record.propertyAddress || '' };
  return String(text).replace(/\{\{(姓名|案名|地址|物件地址)\}\}/g, (_, key) => fields[key]);
}
async function addTextPages(doc, text) {
  const canvas = document.createElement('canvas'); canvas.width = 1654; canvas.height = 2339;
  const ctx = canvas.getContext('2d'); font(ctx, 42);
  const lines = wrapOutreachText(ctx, text, 1374), perPage = 28;
  for (let start = 0; start < lines.length; start += perPage) {
    ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, canvas.width, canvas.height); ctx.fillStyle = '#111'; font(ctx, 42);
    lines.slice(start, start + perPage).forEach((line, i) => ctx.fillText(line, 140, 180 + i * 70));
    const page = doc.addPage(A4), image = await doc.embedPng(await png(canvas)); page.drawImage(image, { x: 0, y: 0, width: A4[0], height: A4[1] });
  }
}
export async function createOutreachLetters(records, letters, loadFile) {
  const doc = await PDFDocument.create(), cache = new Map(); let totalBytes = 0;
  doc.setTitle('開發信');
  const manifest = [];
  for (const record of records) {
    const letter = letters.find(l => l.id === record.letterId && !l.archived); if (!letter) throw new Error(`「${record.title}」尚未指定開發信。`);
    const firstPage = doc.getPageCount() + 1;
    if (letter.type === 'text/plain') await addTextPages(doc, fillOutreachTemplate(letter.text, record));
    else {
      if (!cache.has(letter.id)) { const blob = await loadFile(letter); totalBytes += blob.size; if (totalBytes > 80 * 1024 * 1024) throw new Error('這批檔案超過 80MB，請分批列印。'); cache.set(letter.id, new Uint8Array(await blob.arrayBuffer())); }
      const bytes = cache.get(letter.id);
      if (letter.type === 'application/pdf') { const source = await PDFDocument.load(bytes); if (source.getForm().getFields().length) source.getForm().flatten(); for (const page of await doc.copyPages(source, source.getPageIndices())) doc.addPage(page); }
      else { const image = letter.type === 'image/png' ? await doc.embedPng(bytes) : await doc.embedJpg(bytes), page = doc.addPage(A4), fitted = image.scaleToFit(A4[0] - 40, A4[1] - 40); page.drawImage(image, { x: (A4[0] - fitted.width) / 2, y: (A4[1] - fitted.height) / 2, width: fitted.width, height: fitted.height }); }
    }
    if (doc.getPageCount() > 400) throw new Error('這批超過 400 頁，請分批列印。');
    manifest.push({ id: record.id, recipient: record.recipient, letterName: letter.name, firstPage, lastPage: doc.getPageCount() });
  }
  if (!doc.getPageCount()) throw new Error('請先選擇案件。');
  return { bytes: await doc.save(), pages: doc.getPageCount(), manifest };
}
