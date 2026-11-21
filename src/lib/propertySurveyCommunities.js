const FIELDS = Object.freeze([
  ['school', '學校'], ['park', '公園'], ['market', '市場'], ['transport', '交通'],
  ['completion_date', '建築完成日期'], ['community_units', '社區總戶數'],
  ['security', '警衛管理'], ['garbage', '垃圾處理']
]);
const MAX_PRESETS = 100;
const keyFor = name => String(name ?? '').normalize('NFKC').replace(/\s+/g, '').toLowerCase();
const clean = value => typeof value === 'string' ? value.trim() : '';

// Source: 竹城甲子園捷運四房車物調表, 契約 2603104. Other towers can override the completion date.
const STARTER_PRESETS = [{
  name: '竹城甲子園',
  values: {
    school: '樂善國小、文青國中小', park: '樂善公園', market: '文德黃昏市場', transport: '體育大學捷運站',
    completion_date: '民國110年11月19日', community_units: '1209 戶', security: '24 小時', garbage: '集中處理'
  }
}];

function communityValues(data) {
  return Object.fromEntries(FIELDS.map(([key]) => [key, clean(data?.[key])]).filter(([, value]) => value));
}
function normalizeCommunityPreset(preset) {
  const name = clean(preset?.name);
  if (!name || name.length > 80) throw new Error('請填寫 80 字以內的社區名稱。');
  const values = communityValues(preset.values);
  if (Object.keys(values).length === 0) throw new Error('請先填寫至少一項社區資料。');
  if (Object.values(values).some(value => value.length > 180)) throw new Error('每項社區資料請填寫 180 字以內。');
  return { name, values };
}

function applyCommunity(data, previous, name, preset) {
  const salesData = { ...data, community_name: name };
  const applied = {}, retained = [];
  const switching = keyFor(data.community_name) !== keyFor(name);
  for (const [key, label] of FIELDS) {
    const value = clean(salesData[key]);
    const inherited = value && value === previous?.[key];
    const next = preset?.values[key];
    if (inherited && switching) salesData[key] = '';
    if (next && (!clean(salesData[key]) || inherited)) {
      salesData[key] = next;
      applied[key] = next;
    } else if (inherited && !switching) {
      applied[key] = value;
    } else if (value && next && value !== next) {
      retained.push(label);
    }
  }
  return { salesData, communityAppliedValues: applied, retained };
}

module.exports = { FIELDS, MAX_PRESETS, STARTER_PRESETS, keyFor, communityValues, normalizeCommunityPreset, applyCommunity };
