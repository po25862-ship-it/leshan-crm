import { parse } from 'parse5';

export const MAX_SOURCE_BYTES = 5 * 1024 * 1024;
export const SOURCE_DETAILS = ['propertyAddress','buildingNo','landNo','completedOn','mainArea','accessoryArea','balconyArea','canopyArea','commonArea','parkingArea','totalArea','netArea','parkingNo','parkingType','floor','totalFloors','purpose','material','title','listingNo','url','price','layout','parkingPrice','managementFee','listingArea','listingAddress','listingFloor'];
const PING = 0.3025;
const clean = value => String(value || '').normalize('NFKC').replace(/臺/g, '台').replace(/\s+/g, ' ').trim();
const compact = value => clean(value).replace(/\s/g, '');
const descendants = (node, predicate, result = []) => { if (predicate(node)) result.push(node); (node.childNodes || []).forEach(child => descendants(child, predicate, result)); return result; };
const text = node => !node ? '' : ['script','style','noscript'].includes(node.tagName) ? '' : node.nodeName === '#text' ? node.value : (node.childNodes || []).map(text).join(node.tagName === 'tr' || node.tagName === 'p' ? ' ' : '');
const attr = (node, key) => node?.attrs?.find(a => a.name === key)?.value || '';
const cells = row => (row.childNodes || []).filter(n => ['td','th'].includes(n.tagName));
const nearestTable = node => { let p = node.parentNode; while (p && p.tagName !== 'table') p = p.parentNode; return p; };
const rows = table => descendants(table, n => n.tagName === 'tr').filter(row => nearestTable(row) === table);
const tableTitle = table => compact(text((table.childNodes || []).find(n => n.tagName === 'caption')));
function field(table, label) {
  for (const row of rows(table)) { const list = cells(row); for (let i = 0; i < list.length - 1; i++) if (compact(text(list[i])).replace(/[:：]$/, '') === label) return list[i + 1]; }
  return null;
}
const sqm = value => { const match = clean(value).replace(/,/g, '').match(/([\d.]+)\s*平方公尺/); return match && Number.isFinite(Number(match[1])) ? Number(match[1]) : null; };
const fraction = value => { const match = compact(value).match(/(\d+)分之(\d+)/); if (!match || !Number(match[1]) || Number(match[2]) > Number(match[1])) return null; return { numerator:Number(match[2]), denominator:Number(match[1]) }; };
const area = value => value == null ? null : Number((value * PING).toFixed(8));
const rocd = value => { const m = compact(value).match(/(?:民國)?(\d{2,3})年(\d{1,2})月(\d{1,2})日/); return m ? `${Number(m[1]) + 1911}-${m[2].padStart(2,'0')}-${m[3].padStart(2,'0')}` : ''; };
const filename = value => { if(String(value).startsWith('data:'))return '';try { return decodeURIComponent(String(value).split(/[?#]/)[0]).replace(/\\/g,'/').split('/').pop(); } catch { return ''; } };
function chineseNumber(value) {
  const map = {'〇':0,'零':0,'一':1,'二':2,'兩':2,'三':3,'四':4,'五':5,'六':6,'七':7,'八':8,'九':9};
  if (!/[十百]/.test(value)) return [...value].map(c => map[c] ?? c).join('');
  let sum = 0, current = 0; for (const c of value) { if (c === '十' || c === '百') { sum += (current || 1) * (c === '十' ? 10 : 100); current = 0; } else current = map[c] || 0; } return String(sum + current);
}
export function normalizeCaseAddress(value) {
  return compact(value).replace(/[，,。．.]/g,'').replace(/([零〇一二兩三四五六七八九十百]+)(?=[段巷弄號樓層鄰])/g, chineseNumber)
    .replace(/([市縣][^市縣路街]{1,6}[區鄉鎮市])([^路街道段巷弄號]{1,12}[里村])?(?:[\d]+鄰)?/, '$1');
}
export function hasMailingDoorNumber(value) {
  return /[\d零〇一二兩三四五六七八九十百千]+(?:[-之][\d零〇一二兩三四五六七八九十百千]+)?號/.test(compact(value));
}
export function parseDeedHtml(html) {
  if (!html || html.length > MAX_SOURCE_BYTES) throw new Error('電傳 HTML 為空或超過 5MB。');
  // parse5 builds an inert tree: never executes imported scripts or loads image/link URLs.
  const root = parse(html), tables = descendants(root, n => n.tagName === 'table');
  const main = tables.find(t => tableTitle(t) === '建物標示部');
  if (!main) throw new Error('找不到建物標示部，請上傳完整的建號電傳 HTML。');
  const heading = compact(rows(main).map(text).join(' ')), match = heading.match(/(.{2,5}?[市縣])(.{1,5}?[區鄉鎮市])(.+?段)(\d{5})-?(\d{3})建號/);
  if (!match) throw new Error('無法辨認縣市、行政區與建號，請確認檔案完整。');
  const [,city,district,section,number,suffix] = match;
  const details = { propertyAddress:city + district + clean(text(field(main,'建物門牌'))), buildingNo:`${section}${number}-${suffix}`, landNo:clean(text(field(main,'建物坐落地號'))), completedOn:rocd(text(field(main,'建築完成日期'))), floor:clean(text(field(main,'層次'))), totalFloors:parseInt(clean(text(field(main,'層數'))),10) || null, purpose:clean(text(field(main,'主要用途'))), material:clean(text(field(main,'主要建材'))), parkingNo:'', parkingType:'' };
  const mainSqm = sqm(text(field(main,'總面積'))), attached = [];
  for (const row of rows(main)) { const list = cells(row); if (compact(text(list[0])) === '附屬建物用途') attached.push({ purpose:clean(text(list[1])), sqm:sqm(text(list[3])) }); }
  const shared = [], parking = [];
  for (const table of tables.filter(t => attr(t,'id') === 'info_mb')) {
    let current;
    for (const row of rows(table)) {
      const list = cells(row), label = compact(text(list[0]));
      if (label === '共有部分') { const share = fraction(text(list[3])), size = sqm(text(list[1])); current = { label:compact(text(list[1])).replace(/[\d.]+平方公尺.*/,''), sqm:size, share }; shared.push(current); }
      if (label === '含停車位') {
        const nested=descendants(list[1]||{},n=>n.tagName==='tr'),values=nested.length?nested.map(text):[text(list[1])];
        for(const line of values){const value=compact(line),share=fraction(value),no=value.match(/編號(.+?)權利範圍/);if(current&&share&&current.sqm!=null)parking.push({no:no?.[1]?.replace(/號$/,'')||'',sharedIndex:shared.length-1,sqm:current.sqm*share.numerator/share.denominator});}
      }
    }
  }
  const attachedSqm = attached.every(a=>a.sqm!=null) ? attached.reduce((sum,a)=>sum+a.sqm,0) : null;
  const sharedSqm = shared.length && shared.every(a=>a.sqm!=null&&a.share) ? shared.reduce((sum,a)=>sum+a.sqm*a.share.numerator/a.share.denominator,0) : null;
  const validParking=shared.every((part,index)=>!parking.some(p=>p.sharedIndex===index)||(part.share&&parking.filter(p=>p.sharedIndex===index).reduce((sum,p)=>sum+p.sqm,0)<=part.sqm*part.share.numerator/part.share.denominator+0.000001));
  const parkingSqm = parking.length&&validParking ? parking.reduce((sum,a)=>sum+a.sqm,0) : null;
  const totalSqm = mainSqm != null && attachedSqm != null && sharedSqm != null ? mainSqm + attachedSqm + sharedSqm : null;
  Object.assign(details, { mainArea:area(mainSqm), accessoryArea:area(attachedSqm), balconyArea:area(attached.filter(a=>/陽台/.test(a.purpose)).reduce((s,a)=>s+(a.sqm||0),0)), canopyArea:area(attached.filter(a=>/雨遮/.test(a.purpose)).reduce((s,a)=>s+(a.sqm||0),0)), commonArea:parkingSqm!=null && sharedSqm!=null && parkingSqm<=sharedSqm ? area(sharedSqm-parkingSqm) : null, parkingArea:area(parkingSqm), totalArea:area(totalSqm), netArea:totalSqm!=null && parkingSqm!=null ? area(totalSqm-parkingSqm) : null, parkingNo:parking.map(p=>p.no).join('、') });
  const owners = tables.filter(t=>tableTitle(t)==='建物所有權部').map((table,index)=>{
    const addressCell = field(table,'地址'), share = fraction(text(field(table,'權利範圍'))), key = compact(text(field(table,'登記次序'))) || `owner-${index+1}`;
    return { key, maskedName:clean(text(field(table,'所有權人'))), recipient:'屋主', address:clean(text(addressCell)), originalAddress:clean(text(addressCell)), share:share ? `${share.numerator}/${share.denominator}` : '', imageRefs:descendants(addressCell || {},n=>n.tagName==='img').map((image,i)=>({id:`${key}-${i}`,filename:filename(attr(image,'src')), inline:/^data:image\/(png|jpeg|webp);base64,/i.test(attr(image,'src')) ? attr(image,'src') : ''})), confirmed:false, zip:'', recordId:'', recordRevision:null, selected:false };
  });
  if (owners.length > 50 || new Set(owners.map(o=>o.key)).size !== owners.length) throw new Error('所有權人筆數或登記次序有異常，請先核對。');
  const plainText = clean(text(root));
  return { key:`${city}/${district}/${section}/${number}${suffix}`, details, owners, deedText:plainText.slice(0,500000), calculations:{mainSqm,attached,shared,parking}, queriedAt:plainText.match(/查詢時間[:：]\s*([^,，]+)[,，]/)?.[1] || '', warnings:[...(parkingSqm==null ? ['尚無法拆分車位與公設，請核對完整持分資料。'] : []),...(!owners.length ? ['這份檔案沒有所有權部，可先保存案件，之後再補收件人。'] : [])] };
}
export function imageMime(bytes) { return bytes[0]===137 && bytes[1]===80 && bytes[2]===78 ? 'image/png' : bytes[0]===255 && bytes[1]===216 ? 'image/jpeg' : String.fromCharCode(...bytes.slice(0,4))==='RIFF' && String.fromCharCode(...bytes.slice(8,12))==='WEBP' ? 'image/webp' : ''; }
const dataUrl = (bytes,type) => { let value=''; for(let i=0;i<bytes.length;i+=32768)value+=String.fromCharCode(...bytes.subarray(i,i+32768)); return `data:${type};base64,${btoa(value)}`; };
export async function readDeedFiles(files) {
  const entries=[]; let total=0;
  const add=(name,bytes)=>{ if(bytes.length>MAX_SOURCE_BYTES || (total+=bytes.length)>MAX_SOURCE_BYTES)throw new Error('電傳及地址圖片合計限 5MB，請縮小圖片或分次匯入。'); entries.push({name,bytes}); };
  for(const file of files) {
    if(file.size>MAX_SOURCE_BYTES)throw new Error('單檔限 5MB。');
    if(/\.zip$/i.test(file.name)) { const {default:JSZip}=await import('jszip');const zip=await JSZip.loadAsync(await file.arrayBuffer());const values=Object.values(zip.files).filter(e=>!e.dir);if(values.length>100)throw new Error('ZIP 最多 100 個檔案。');for(const entry of values){if(/\.(?:html?|png|jpe?g|webp)$/i.test(entry.name)){if((entry._data?.uncompressedSize||0)>MAX_SOURCE_BYTES)throw new Error('ZIP 解壓後超過限制。');add(entry.name,await entry.async('uint8array'));}} }
    else if(/\.(?:html?|png|jpe?g|webp)$/i.test(file.name))add(file.webkitRelativePath || file.name,new Uint8Array(await file.arrayBuffer()));
  }
  const htmlFiles=entries.filter(e=>/\.html?$/i.test(e.name)); if(htmlFiles.length!==1)throw new Error('每次請提供一份 HTML；可連同地址圖片或完整網頁資料夾打包 ZIP。');
  let html=new TextDecoder('utf-8').decode(htmlFiles[0].bytes);if(/charset\s*=\s*["']?(?:big5|big-5)/i.test(html.slice(0,3000)))html=new TextDecoder('big5').decode(htmlFiles[0].bytes);
  const parsed=parseDeedHtml(html), images=[];
  for(const owner of parsed.owners)for(const image of owner.imageRefs){
    const matches=entries.filter(e=>filename(e.name)===image.filename && imageMime(e.bytes));
    if(image.inline){const base64=image.inline.split(',')[1];if(base64.length>MAX_SOURCE_BYTES*1.4)throw new Error('地址圖片過大。');images.push({id:image.id,filename:image.filename||image.id,type:image.inline.slice(5,image.inline.indexOf(';')),data:image.inline});}
    else if(matches.length===1)images.push({id:image.id,filename:matches[0].name,type:imageMime(matches[0].bytes),data:dataUrl(matches[0].bytes,imageMime(matches[0].bytes))});
  }
  parsed.owners=parsed.owners.map(o=>({...o,imageRefs:o.imageRefs.map(({inline,...r})=>r)}));
  return {...parsed,images,sourceName:htmlFiles[0].name.slice(-200)};
}
export function matchingOutreachRecords(records, caseKey, propertyAddress, recipientAddress) {
  return records.filter(r=>(r.caseKey===caseKey || (normalizeCaseAddress(r.propertyAddress) && normalizeCaseAddress(r.propertyAddress)===normalizeCaseAddress(propertyAddress))) && normalizeCaseAddress(r.address)===normalizeCaseAddress(recipientAddress));
}
export function prepareIntegratedOwners(owners, records, caseKey, propertyAddress) {
  return owners.map(o=>{const matches=matchingOutreachRecords(records,caseKey,propertyAddress,o.address);const linked=records.find(r=>r.id===o.recordId&&(!r.caseId||r.caseKey===caseKey));const r=linked||(matches.length===1?matches[0]:null);return {...o,recipient:r?.recipient || o.recipient || '屋主',address:r?.address || o.address,zip:r?.zip || o.zip || '',recordId:r?.id || o.recordId || '',recordRevision:r?.revision ?? o.recordRevision ?? null,selected:!!r&&o.present!==false,confirmed:false};});
}
export function printableArea(value) { return value == null || !Number.isFinite(Number(value)) ? '待確認' : `${Number(value).toFixed(2)} 坪`; }
export function extractListingText(input) {
  const lines=String(input||'').normalize('NFKC').split(/\r?\n/).map(s=>s.trim()).filter(Boolean),details={},warnings=[];
  const prices=[];for(const line of lines){if(/[?？|]/.test(line)||/單價|每坪|萬\s*[\/／]\s*坪/.test(line))continue;const match=line.match(/(?:最新售價|總價|售價)\s*[:：]?\s*([\d,]+(?:\.\d+)?)\s*萬/)||line.match(/^([\d,]+(?:\.\d+)?)\s*萬(?:元)?$/);if(match)prices.push(Number(match[1].replace(/,/g,'')));}
  const unique=[...new Set(prices.filter(p=>p>0&&p<1e8))];if(unique.length===1)details.price=unique[0];else if(unique.length>1)warnings.push('有多個不同售價，請自行確認本件總價。');
  const source=lines.join('\n');const layouts=[...new Set([...source.matchAll(/\d+\s*房\s*\d+\s*廳\s*\d+\s*衛/g)].map(m=>m[0].replace(/\s/g,'')))];if(layouts.length===1)details.layout=layouts[0];
  const areas=[...new Set([...source.matchAll(/(?:建坪|權狀(?:總坪數)?)\s*[:：]?\s*([\d.]+)\s*坪/g)].map(m=>Number(m[1])))];if(areas.length===1)details.listingArea=areas[0];
  const floors=[...new Set([...source.matchAll(/(\d+)\s*樓\s*[\/／]\s*(\d+)\s*樓/g)].map(m=>`${m[1]}/${m[2]}`))];if(floors.length===1){const [floor,total]=floors[0].split('/');details.listingFloor=floor;details.totalFloors=Number(total);}
  const name=source.match(/(?:案名|案件名稱)\s*[:：]\s*([^\n]+)/);if(name)details.title=name[1].slice(0,200);
  return {details,warnings};
}
