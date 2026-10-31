const TENANT_NEED_FIELDS = [
  ["type", "需求類型"], ["name", "姓名"], ["budgetText", "租金預算"], ["includedFees", "預算包含費用"],
  ["areas", "區域"], ["communityStreet", "指定社區／路段"], ["roomText", "房型／房數"], ["minPingText", "最低坪數"],
  ["carParking", "汽車位"], ["motorbikeParking", "機車位"], ["pets", "寵物"], ["subsidy", "是否需要租補"],
  ["cook", "是否需要開伙"], ["equipment", "家具／設備"], ["moveIn", "入住時間"], ["leaseTerm", "預計租期"],
  ["requiredConditions", "其他必要條件"], ["notes", "備註"],
];
const TENANT_NEED_STATUSES = { searching: "找房中", viewing: "已帶看", rented: "已租到", paused: "暫停找房" };
const normalize = value => String(value ?? "").normalize("NFKC").trim();
const labelKey = value => normalize(value).replace(/[\s/／：:]/g, "");
const aliases = Object.fromEntries(TENANT_NEED_FIELDS.map(([key, label]) => [labelKey(label), key]));
for (const [label, key] of Object.entries({ 類型:"type", 客戶姓名:"name", 預算:"budgetText", 每月預算:"budgetText", 每月租金:"budgetText", 每月總預算:"budgetText", 地區:"areas", 社區:"communityStreet", 路段:"communityStreet", 房數:"roomText", 房型:"roomText", 坪數:"minPingText", 租補:"subsidy", 開伙:"cook", 家具設備:"equipment", 入住日期:"moveIn", 租期:"leaseTerm" })) aliases[labelKey(label)] = key;
const blank = value => !normalize(value) || /^(未指定|待確認|不知道|未提供|尚未指定)$/.test(normalize(value));
const amount = (value, unit) => Number(value) * (unit === "萬" ? 10000 : unit === "千" ? 1000 : 1);
function parseRentalBudget(value) {
  const text = normalize(value).replace(/[,，\s]/g, "");
  if (/^(不限|無上限|預算不限)$/.test(text)) return { min:null, max:null, unlimited:true };
  if (!text || /[-－]\d/.test(text[0] || "") || /^[-－]/.test(text)) return null;
  const range = text.match(/^(\d+(?:\.\d+)?)(萬|千)?(?:元)?[~～\-至到](\d+(?:\.\d+)?)(萬|千)?(?:元)?(?:\/月|每月|以內|以下|內)?$/);
  let min = null, max;
  if (range) { const unit = range[4] || range[2] || ""; min = amount(range[1], range[2] || unit); max = amount(range[3], range[4] || unit); }
  else { const match = text.match(/^(\d+(?:\.\d+)?)(萬|千)?(?:元)?(?:\/月|每月)?(以內|以下|內|以上|起)?$/); if (!match) return null; max = amount(match[1], match[2]); if (/以上|起/.test(match[3] || "")) { min = max; max = null; } }
  if ([min,max].some(n => n !== null && (!Number.isFinite(n) || n <= 0 || n > 10000000)) || (min !== null && max !== null && min > max)) return null;
  return { min, max, unlimited:false };
}
function tenantNeedForm(row = {}) {
  row = row || {};
  return { ...Object.fromEntries(TENANT_NEED_FIELDS.map(([key]) => [key, normalize(row[key])])), type:"租屋", status: TENANT_NEED_STATUSES[row.status] ? row.status : "searching", sharedWith:Array.isArray(row.sharedWith) ? [...row.sharedWith] : [] };
}
function tenantNeedErrors(form) {
  const errors = [];
  if (normalize(form.type) !== "租屋") errors.push("需求類型：請填「租屋」，買房需求請到買方客需處理。");
  if (blank(form.name)) errors.push("姓名：請填租客稱呼。");
  if (!parseRentalBudget(form.budgetText)) errors.push("租金預算：請填每月金額，例如 35000 元內、3.5 萬或不限。");
  if (blank(form.areas)) errors.push("區域：請填 A7、A8、A9 或縣市／行政區。");
  for (const [key,label] of TENANT_NEED_FIELDS) if (normalize(form[key]).length > (key === "notes" || key === "requiredConditions" ? 2000 : 500)) errors.push(`${label}：內容太長，請簡化。`);
  if (normalize(form.minPingText) && !/^(不限|無限制)$/.test(normalize(form.minPingText)) && !/^\d+(?:\.\d+)?\s*(?:坪)?\s*(?:以上)?$/.test(normalize(form.minPingText))) errors.push("最低坪數：請填數字（例如 20 坪）或留白。");
  if (form.status && !TENANT_NEED_STATUSES[form.status]) errors.push("找房狀態不正確。");
  if (form.sharedWith && (!Array.isArray(form.sharedWith) || form.sharedWith.length > 50 || form.sharedWith.some(uid => typeof uid !== "string" || !uid || uid.length > 128))) errors.push("分享對象不正確。");
  return errors;
}
function tenantNeedPayload(form) {
  const errors = tenantNeedErrors(form); if (errors.length) throw new Error(errors.join("\n"));
  const data = tenantNeedForm(form), budget = parseRentalBudget(data.budgetText);
  return { ...data, budgetMin:budget.min, budgetMax:budget.max, budgetUnlimited:budget.unlimited, minPing: parseFloat(data.minPingText) || null };
}
function tenantNeedTemplate(form = {}) {
  return "客需\n" + TENANT_NEED_FIELDS.map(([key,label]) => `${label}：${key === "type" ? "租屋" : normalize(form[key])}`).join("\n");
}
function parseTenantTemplate(value) {
  const text = normalize(value);
  const form = { ...tenantNeedForm(), type:"" }, errors = [], present = [], unknown = [];
  if (text.length > 10000) return { form, present, errors:["內容太長，請分開傳送，每次只傳一位租客的需求。"], unknown };
  let current = "";
  for (const line of text.split(/\r?\n/).map(normalize)) {
    if (!line || /^客需\s*[:：]?$/.test(line)) continue;
    const match = line.match(/^([^:：]{1,30})[:：](.*)$/);
    if (match) {
      current = aliases[labelKey(match[1])] || "";
      if (!current) { unknown.push(match[1]); continue; }
      const content = normalize(match[2]);
      if (form[current] && content && form[current] !== content) errors.push(`${match[1]}有兩個不同內容，請只保留一個。`);
      if (!present.includes(current)) present.push(current);
      form[current] = content;
    } else if (current) form[current] = [form[current], line].filter(Boolean).join("\n");
    else errors.push("請使用表格的「欄位：內容」格式；輸入「客需表格」可取得完整表格。");
  }
  if (unknown.length) errors.push(`不認識欄位「${unknown.join("、")}」，請依客需表格填寫。`);
  return { form, present, errors, unknown };
}
function mergeTenantDraft(draft, parsed) {
  const next = { ...(draft || { ...tenantNeedForm(), type:"" }) };
  for (const key of parsed.present) next[key] = parsed.form[key];
  return next;
}
function tenantNeedBudgetLabel(row) {
  const budget = parseRentalBudget(row.budgetText);
  if (!budget) return row.budgetText || "未指定";
  const money = n => Number(n).toLocaleString("zh-TW", { maximumFractionDigits:2 });
  return budget.unlimited ? "租金不限" : budget.max === null ? `${money(budget.min)} 元起／月` : budget.min === null ? `${money(budget.max)} 元內／月` : `${money(budget.min)}～${money(budget.max)} 元／月`;
}
const countWords = value => normalize(value).replace(/兩/g,"2").replace(/[一二三四五六七八九]/g, char => String("一二三四五六七八九".indexOf(char)+1));
const requested = value => !blank(value) && !/^(不需要|不用|無|沒有|否|不限|無限制|可有可無|無寵物|沒有寵物|不養寵物|不需租補|不需開伙)$/.test(normalize(value));
function matchTenantRental(need, rental) {
  if (rental.status !== "available") return null;
  const uncertain = [], matched = [], reject = () => null;
  const listingText = normalize([rental.title,rental.community,rental.area,rental.city,rental.district,rental.street].filter(Boolean).join(" ")).toLowerCase();
  const areaText = normalize(need.areas).toLowerCase();
  if (areaText && !/^(不限|皆可|全區)$/.test(areaText)) {
    const terms = areaText.split(/[、,，／/或\s]+/).filter(Boolean);
    if (!terms.some(term => listingText.includes(term))) return reject();
    matched.push("區域");
  }
  if (requested(need.communityStreet)) {
    const terms = normalize(need.communityStreet).toLowerCase().split(/[、,，／/或]+/).map(normalize).filter(Boolean);
    if (!terms.some(term => listingText.includes(term))) return reject();
    matched.push("社區／路段");
  }
  const rooms = countWords(need.roomText);
  if (/\d+\s*(?:\+|[-~–至到、])\s*\d+/.test(rooms)) uncertain.push("房數範圍／彈性房");
  else if (/套房|雅房/.test(rooms)) { const kind=/雅房/.test(rooms)?"雅房":"套房"; if (!(rental.type || "").includes(kind)) return reject(); matched.push("房型"); }
  else if (rooms) {
    const match = rooms.match(/(\d+)\s*房/); const exact = match || rooms.match(/^(\d+)(?:\s*\/|$)/);
    if (exact) {
      const n = Number(exact[1]); if (rental.rooms == null || rental.rooms === "") uncertain.push("房數");
      else if (/以上|至少/.test(rooms) ? Number(rental.rooms) < n : Number(rental.rooms) !== n) return reject(); else matched.push("房數");
    } else if (!/不限|皆可/.test(rooms)) uncertain.push("房型／房數");
  }
  const minimum = parseFloat(need.minPingText);
  if (minimum > 0) {
    if (!Number(rental.size) || !/室內使用/.test(rental.sizeBasis || "")) uncertain.push("最低坪數（坪數口徑需確認）");
    else if (Number(rental.size) < minimum) return reject(); else matched.push("坪數");
  }
  const parking = (text, kind) => {
    if (!requested(text)) return true;
    const value = normalize(kind === "car" ? rental.parking : rental.motorbikeParking);
    if (/^無/.test(value)) return false;
    if (kind === "car" && /平面/.test(text) && /機械/.test(value)) return false;
    if (kind === "car" && /機械/.test(text) && /平面/.test(value)) return false;
    const label = kind === "car" ? "汽車位" : "機車位";
    if (!value || /待確認|其他|先到先停/.test(value)) uncertain.push(label);
    else { matched.push(label); const count = countWords(text).match(/(\d+)\s*(?:個|格|位)/); if (count && Number(count[1]) > 1) uncertain.push(`${label}數量`); }
    return true;
  };
  if (!parking(need.carParking,"car") || !parking(need.motorbikeParking,"motorbike")) return reject();
  const budget = parseRentalBudget(need.budgetText);
  let knownMonthly = Number(rental.rent) || 0;
  if (!knownMonthly) uncertain.push("租金");
  const fees = normalize(need.includedFees), allFees = /全包|全部|全含|所有/.test(fees);
  if (/水電|水費|電費|瓦斯|網路|第四台|清潔|服務費/.test(fees) || allFees) uncertain.push("預算內其他費用");
  const addFee = (condition, mode, amountValue, label) => {
    if (!condition) return;
    if (/已含租金|無需|無管理費|無車位|無機車位/.test(mode || "")) return;
    if (mode === "另計" && amountValue !== "" && amountValue != null && Number.isFinite(Number(amountValue))) knownMonthly += Number(amountValue);
    else uncertain.push(label);
  };
  addFee(allFees || /管理/.test(fees), rental.mgmtMode, rental.mgmt, "管理費");
  addFee((allFees || /汽車|平面|機械|(?<!機)車位/.test(fees)) && !/^無車位$/.test(rental.parking || ""), rental.parkMode, rental.parkFee, "汽車位費");
  addFee((allFees || /機車/.test(fees)) && !/^無機車位$/.test(rental.motorbikeParking || ""), rental.motorbikeParkMode, rental.motorbikeParkFee, "機車位費");
  if (budget?.max && knownMonthly > budget.max) return reject();
  if (!fees) uncertain.push("預算包含費用");
  if (requested(need.pets)) {
    const value = normalize(rental.pets); if (/不可|禁止|不接受/.test(value)) return reject();
    if (!/可養寵物/.test(value)) uncertain.push("寵物種類／數量"); else matched.push("可養寵物");
  }
  for (const [key,label,field] of [["subsidy","租補","subsidy"],["cook","開伙","cook"]]) if (requested(need[key])) {
    const value = normalize(rental[field]); if (/不可|禁止|不接受/.test(value)) return reject();
    if (!/可申請|可開伙|可以|^可$/.test(value)) uncertain.push(label); else matched.push(label);
  }
  if (requested(need.equipment)) {
    const available = (rental.furniture || []).join("、");
    for (const item of normalize(need.equipment).split(/[、,，／/\s]+/).filter(Boolean)) if (!available.includes(item)) uncertain.push(`設備：${item}`);
  }
  if (requested(need.moveIn) && rental.moveIn !== "隨時入住") uncertain.push("可入住時間");
  if (requested(need.leaseTerm)) uncertain.push("租期");
  if (requested(need.requiredConditions)) uncertain.push("其他必要條件");
  return { rental, knownMonthly, matched:[...new Set(matched)], uncertain:[...new Set(uncertain)] };
}
module.exports = { TENANT_NEED_FIELDS, TENANT_NEED_STATUSES, tenantNeedForm, tenantNeedErrors, tenantNeedPayload, tenantNeedTemplate, parseRentalBudget, parseTenantTemplate, mergeTenantDraft, tenantNeedBudgetLabel, matchTenantRental };
