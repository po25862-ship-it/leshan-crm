import {safeLoad, FAILSAFE_SCHEMA} from 'js-yaml';
import {parseDeedHtml, hasMailingDoorNumber} from './outreachDeed';

export const MAX_DEED_TEXT = 200000;
const scalar = value => value == null ? '' : typeof value === 'string' || typeof value === 'number' ? String(value).trim() : '';
const list = value => value == null ? [] : Array.isArray(value) ? value : [value];
const escape = value => scalar(value).replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
const row = (...values) => `<tr>${values.map(value => `<td>${escape(value)}</td>`).join('')}</tr>`;
const size = value => {
  const result = scalar(value).normalize('NFKC').replace(/㎡|m[²2]/gi, '平方公尺');
  return /^[\d,.]+$/.test(result) ? `${result}平方公尺` : result;
};
const object = value => value && typeof value === 'object' && !Array.isArray(value);

function validateTree(root) {
  let count = 0;
  const walk = (value, depth) => {
    if (++count > 10000 || depth > 25) throw new Error('文字層次或筆數過多，請一次貼上一間物件。');
    if (value && typeof value === 'object') Object.values(value).forEach(child => walk(child, depth + 1));
  };
  walk(root, 0);
}

// Only translate known fields to inert table text. No scripts, custom YAML tags,
// anchors, remote image requests, or data from the mortgage holder become owners.
export function parseDeedText(input) {
  const source = String(input || '').trim().replace(/^```(?:yaml|yml|json)?\s*\n([\s\S]*?)\n```$/i, '$1');
  if (!source || source.length > MAX_DEED_TEXT) throw new Error('請貼上電傳文字，每次最多 20 萬字。');
  if (/(?:^|[\s:[,{])(?:[&*][\w-]+|!!?[^\s,\]}]+)/m.test(source)) throw new Error('不支援文字別名或特殊標籤，請貼上展開後的 YAML／JSON 電傳文字。');
  let parsed;
  try { parsed = safeLoad(source, {schema:FAILSAFE_SCHEMA}); }
  catch { throw new Error('文字格式無法讀取，請保留「建物標示部」與「建物所有權部」的 YAML／JSON 層次及縮排。'); }
  validateTree(parsed);
  if (!object(parsed) || !object(parsed['建物標示部'])) throw new Error('找不到建物標示部，請貼上完整的 YAML／JSON 電傳文字。');
  const main = parsed['建物標示部'];
  const number = scalar(main['建號']).normalize('NFKC').replace(/\s/g, '');
  const match = number.match(/^(.{2,5}?[市縣])(.{1,5}?[區鄉鎮市])(.+?段)(\d{5})-?(\d{3})(?:建號)?$/);
  if (!match) throw new Error('請在建物標示部提供完整建號，包含縣市、行政區、地段與建號。');
  const prefix = match[1] + match[2];
  const door = scalar(main['建物門牌']).normalize('NFKC').replace(new RegExp(`^${prefix}`), '');
  if (!door) throw new Error('建物標示部缺少建物門牌，請補上後再讀取。');
  const layers = list(main['層次']);
  const attached = list(main['附屬建物']);
  const shared = list(main['共有部分']);
  const owners = list(parsed['建物所有權部']);
  if (owners.length > 50) throw new Error('所有權人最多 50 位，請一次貼上一間物件。');
  if (owners.some(owner => !object(owner) || !/^[a-zA-Z0-9_-]{1,40}$/.test(scalar(owner['登記次序'])))) throw new Error('請為每位所有權人保留登記次序，避免合併錯人。');
  if (owners.some(owner => owner['建號'] && scalar(owner['建號']).normalize('NFKC').replace(/\s|建號/g, '') !== number.replace(/建號$/, ''))) throw new Error('所有權部與建物標示部的建號不同，請一次貼上同一間物件的資料。');
  const land = list(main['建物座落地號'] || main['建物坐落地號']).map(scalar).join('、');
  let html = `<table><caption>建物標示部</caption>${row(number.replace(/建號$/, '') + '建號')}`;
  html += row('建物門牌',door) + row('層數',main['層數'],'總面積',size(main['總面積']));
  html += row('層次',layers.map(layer => object(layer) ? scalar(layer['層次']) : scalar(layer)).join('、'));
  html += row('建物坐落地號',land) + row('建築完成日期',main['建築完成日期']);
  html += row('主要建材',main['主要建材']) + row('主要用途',main['主要用途']);
  attached.forEach(part => { html += row('附屬建物用途',part?.['用途'],'面積',size(part?.['面積'])); });
  html += '</table><table id="info_mb">';
  shared.forEach(part => {
    html += row('共有部分',`${scalar(part?.['建號'])} ${size(part?.['總面積'])}`,'權利範圍',part?.['權利範圍']);
    const parking = list(part?.['含停車位']);
    if (parking.length) html += `<tr><td>含停車位</td><td><table>${parking.map(car => row('編號',car?.['編號'],'權利範圍',car?.['權利範圍'])).join('')}</table></td></tr>`;
  });
  html += '</table>';
  owners.forEach(owner => {
    const address = list(owner['地址（影像辨識）'] || owner['地址(影像辨識)'] || owner['地址']).map(scalar).join('');
    html += `<table><caption>建物所有權部</caption>${row('登記次序',owner['登記次序'])}${row('所有權人',owner['所有權人'])}${row('地址',address)}${row('權利範圍',owner['權利範圍'])}</table>`;
  });
  const result = parseDeedHtml(html);
  result.warnings.push(...result.owners.filter(owner => !hasMailingDoorNumber(owner.address)).map(owner => `登記 ${owner.key}：收件地址缺少門牌號碼，請補齊後再加入寄送名單。`));
  return {...result, deedText:source, queriedAt:scalar(main['查詢時間']), images:[], sourceName:'貼上電傳文字'};
}
