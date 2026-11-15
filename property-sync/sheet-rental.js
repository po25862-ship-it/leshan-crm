// Read only explicitly labelled rental terms. Missing, ranged or per-room
// amounts must never be turned into a whole-property monthly rent.
const normalize = value => String(value || '').normalize('NFKC').replace(/[﹕；;]/g, ':').trim();
const empty = value => value == null || String(value).trim() === '';
function addressKey(value) {
  const {floorplanAddressKey}=require('./floorplan-address');
  const digits={一:1,二:2,兩:2,三:3,四:4,五:5,六:6,七:7,八:8,九:9};
  const number=s=>{if(!s.includes('十'))return digits[s]||s;const [t,u]=s.split('十');return (t?digits[t]:1)*10+(u?digits[u]:0);};
  return floorplanAddressKey(value).replace(/([一二三四五六七八九十兩]+)(?=樓|層)/g,(_,n)=>number(n)).replace(/(樓之)([一二三四五六七八九十兩]+)$/g,(_,p,n)=>p+number(n));
}
const fields = ['monthlyRent', 'rentFeeNote', 'leaseStartDate', 'leaseEndDate', 'leaseTermNote'];
const compact = value => normalize(value).toUpperCase().replace(/[^A-Z0-9\u4e00-\u9fff]/g, '');
function dateValue(value) {
  const m=normalize(value).match(/^(\d{2,4})[./年-](\d{1,2})[./月-](\d{1,2})日?$/);
  if(!m)return null;const y=+m[1]+(m[1].length<4?1911:0),month=+m[2],day=+m[3],d=new Date(Date.UTC(y,month-1,day));
  return y>=1912&&y<=2199&&d.getUTCFullYear()===y&&d.getUTCMonth()===month-1&&d.getUTCDate()===day?`${y}-${String(month).padStart(2,'0')}-${String(day).padStart(2,'0')}`:null;
}
function rowTexts(lines) {
  const rows=[];
  for(const line of lines.filter(l=>l&&normalize(l.text)).sort((a,b)=>(b.y+b.height/2)-(a.y+a.height/2))) {
    const center=line.y+line.height/2;
    const row=rows.find(r=>Math.abs(r.center-center)<=Math.max(r.height,line.height)*.65);
    if(row){row.lines.push(line);row.height=Math.max(row.height,line.height);}else rows.push({center,height:line.height,lines:[line]});
  }
  return rows.map(row=>{let text='';const parts=[];for(const line of row.lines.sort((a,b)=>a.x-b.x)){if(text)text+=' ';const start=text.length;text+=normalize(line.text);parts.push({start,end:text.length,text:normalize(line.text),confidence:line.confidence||0});}return {text,parts};});
}
function rowConfidence(row,start,end) {
  const overlapping=row.parts.filter(p=>p.start<end&&p.end>start),numeric=overlapping.filter(p=>/\d/.test(p.text));
  return Math.min(...(numeric.length?numeric:overlapping).map(p=>p.confidence));
}
function readRent(raw) {
  const text=normalize(raw).replace(/^[:：\s]+/,'');
  if(!text||/^(?:無|X|元\s*[／/]\s*月|萬元\s*[／/]\s*月|待確認|--?)$/i.test(text))return {};
  if(/^(?:[0-9]+[F樓]|每[間房套]|每月每)/i.test(text)||/\d\s*[-~～至]\s*\d|每[間房套]|單間|各[間房套]|每年|元[／/]年|[／/]\s*[間房套日週季年]|年租|日租/.test(text))return {issue:'租金為區間、部分樓層或非整間月租，需確認'};
  const match=text.match(/^(?:NT\$|\$|新台幣)?\s*(\d[\d,]*(?:\.\d+)?)\s*(萬(?:元)?|千(?:元)?|元)?\s*((?:[／/]\s*月|每月)?)\s*(.*)$/i);
  if(!match)return {issue:'租金文字無法確定'};
  const amount=Number(match[1].replace(/,/g,''))*(/^萬/.test(match[2])?10000:/^千/.test(match[2])?1000:1),tail=match[4].trim();
  if(!(amount>0&&amount<=100000000)||/\d/.test(tail)||(!match[2]&&!match[3]&&tail&&!/^(?:[（(]?(?:含|未含|不含|實|稅|管))/.test(tail)))return {issue:'租金有多個金額或不明單位，需確認'};
  const note=[];
  if(/未含管|不含管|未含管理費|不含管理費/.test(tail))note.push('未含管理費');else if(/含管|含管理費/.test(tail))note.push('含管理費');
  if(/未稅|不含稅/.test(tail))note.unshift('未稅');else if(/含稅/.test(tail))note.unshift('含稅');
  if(/實/.test(tail))note.push('原表註記「實」；其他費用待確認');
  return {monthlyRent:amount,...(note.length?{rentFeeNote:note.join('、')}:{})};
}
function readLease(raw) {
  const text=normalize(raw).replace(/^[:：\s]+/,'').trim();
  if(!text||/^(?:無|X|待確認|--?)$/i.test(text))return {};
  const dates=[...text.matchAll(/\d{2,4}[./年-]\d{1,2}[./月-]\d{1,2}日?/g)];
  if(dates.length===2){const start=dateValue(dates[0][0]),end=dateValue(dates[1][0]);const middle=text.slice(dates[0].index+dates[0][0].length,dates[1].index).trim();
    if(start&&end&&start<=end&&/^[-~～—–至到]+$/.test(middle))return {leaseStartDate:start,leaseEndDate:end};
    return {issue:'租期日期有誤或起訖不明，需確認'};
  }
  if(dates.length===1&&/^(?:至|到|迄|截至|到期[:：]?|-|~|～)\s*$/.test(text.slice(0,dates[0].index))){const end=dateValue(dates[0][0]);if(end)return {leaseEndDate:end};}
  if(dates.some(m=>!dateValue(m[0]))||dates.length>2)return {issue:'租期日期無法確定'};
  if(text.length>150)return {issue:'租期文字過長，需確認'};
  // Keep open-ended, month-only and single-date terms verbatim. Do not invent
  // an expiry day, a start day, or treat an unlabelled single date as an expiry.
  return {leaseTermNote:text};
}
function extractRentalFields(lines) {
  const values={rent:[],lease:[]},issues=[];
  for(const row of rowTexts(lines)){
    const matches=[...row.text.matchAll(/(?:(?:月租金|租金)(?=\s*[:：]|\s*[$\d元萬X無])|租約期間|租約起訖|租約起迄|租約到期|租約迄日|租期)\s*[:：]?/g)];
    for(let i=0;i<matches.length;i++){
      const m=matches[i],kind=/租金/.test(m[0])?'rent':'lease',raw=row.text.slice(m.index+m[0].length,matches[i+1]?.index??row.text.length).split(/(?:電話|管理費|自住|空屋|面寬|備註)\s*[:：]/)[0].trim();
      // An empty '租金' embedded in an unrelated title is never an amount.
      if(raw)values[kind].push({raw,confidence:rowConfidence(row,m.index,matches[i+1]?.index??row.text.length)});
    }
    if(!matches.some(m=>/租金/.test(m[0]))){const m=row.text.match(/出租(?:中)?\s*(\d[\d,]*(?:\.\d+)?\s*(?:萬|千|元)?\s*[／/]\s*月)/);if(m)values.rent.push({raw:m[1],confidence:rowConfidence(row,m.index,m.index+m[0].length)});}
  }
  // A narrow lease cell sometimes prints its value on the line below the
  // label. Read only an immediately adjacent date/term in that same column.
  for(const label of lines.filter(l=>/租期\s*[:：]\s*$/.test(normalize(l.text)))) {
    const center=label.y+label.height/2;
    for(const next of lines) {
      const delta=center-(next.y+next.height/2),raw=normalize(next.text);
      if(delta>label.height*.65&&delta<label.height*2.6&&Math.abs(next.x-label.x)<.04&&/^(?:[-~～至到]?\s*\d{2,4}[./年-]|不定期)/.test(raw))values.lease.push({raw,confidence:next.confidence||0});
    }
  }
  const proposed={},evidence={};
  for(const [kind,read] of [['rent',readRent],['lease',readLease]]){
    const results=values[kind].map(v=>({...v,...read(v.raw)}));
    results.filter(v=>v.issue).forEach(v=>issues.push(v.issue));
    const useful=results.filter(v=>fields.some(f=>v[f]!==undefined));
    const unique=new Map(useful.map(v=>[JSON.stringify(Object.fromEntries(fields.filter(f=>v[f]!==undefined).map(f=>[f,v[f]]))),v]));
    if(unique.size>1){issues.push(kind==='rent'?'物調有不同租金，需確認':'物調有不同租期，需確認');continue;}
    const entry=[...unique.values()][0];if(!entry)continue;
    if(entry.confidence<.5){issues.push(kind==='rent'?'租金辨識信心不足':'租期辨識信心不足');continue;}
    // A ranged/partial rent elsewhere on the same sheet blocks a simple number
    // from a second row; all such cases must be reviewed together.
    if(results.some(v=>v.issue))continue;
    for(const field of fields)if(entry[field]!==undefined)proposed[field]=entry[field];
    evidence[kind]=entry.raw;
  }
  return {proposed,evidence,issues:[...new Set(issues)]};
}
function identityMatches(lines,property,properties=[]) {
  const texts=lines.map(l=>normalize(l.text)),all=texts.join("\n");
  const codes=[...all.matchAll(/(?:編號|NO\.?)[\s:：]*([A-Z]{0,3}\s*\d{6,10})/gi)].map(m=>compact(m[1]));
  const parts=s=>compact(s).match(/^([A-Z]{0,3})(\d{6,10})$/),actual=parts(property.listingNo);
  const matches=(code,p)=>{const m=parts(code),n=parts(p.listingNo);if(!m||!n)return false;const source=m[2].replace(/^0+/,""),target=n[2].replace(/^0+/,"");return m[1]?m[1]===n[1]&&source===target:source.length>=6&&target.endsWith(source);};
  if(actual&&codes.some(code=>matches(code,property)&&((parts(code)[1])||new Set(properties.filter(p=>matches(code,p)).map(p=>p.listingNo)).size<=1)))return true;
  // Reject a code pointing at a different known case. If OCR missed/garbled a
  // code, require an exact title AND a full door/floor match, both unique.
  if(codes.some(code=>properties.some(p=>p.id!==property.id&&matches(code,p))))return false;
  const title=texts.find(t=>/案名\s*[:：]/.test(t))?.replace(/^.*?案名\s*[:：]\s*/,"").replace(/(?:契約)?編號.*$/,"").replace(/[（(]專[）)]$/,"").trim();
  const address=texts.find(t=>/地址\s*[:：]/.test(t))?.replace(/^.*?地址\s*[:：]\s*/,"").replace(/電話.*$/,"").trim();
  if(!title||compact(title).length<6||!address)return false;
  const key=addressKey(address);if(!key||key.length<10||!/號/.test(address))return false;
  const peers=properties.filter(p=>compact(p.title)===compact(title)&&addressKey(p.address)===key);
  return peers.length===1&&peers[0].id===property.id;
}
function rentalPatch(existing,extracted) {
  const patch={},conflicts=[];const p=extracted.proposed||{};
  for(const field of fields){
    if(p[field]===undefined)continue;
    const same=field==='monthlyRent'?Number(String(existing[field]).replace(/,/g,''))===p[field]:String(existing[field]||'').trim()===String(p[field]);
    if(empty(existing[field]))patch[field]=p[field];else if(!same)conflicts.push(field);
  }
  if(conflicts.includes('monthlyRent')){delete patch.monthlyRent;delete patch.rentFeeNote;}
  if(conflicts.some(f=>['leaseStartDate','leaseEndDate','leaseTermNote'].includes(f))){delete patch.leaseStartDate;delete patch.leaseEndDate;delete patch.leaseTermNote;}
  if (p.leaseTermNote && (existing.leaseStartDate || existing.leaseEndDate)) delete patch.leaseTermNote;
  if (existing.leaseTermNote && (p.leaseStartDate || p.leaseEndDate) && !p.leaseTermNote) { delete patch.leaseStartDate; delete patch.leaseEndDate; conflicts.push('leaseTermNote'); }
  const start=patch.leaseStartDate||existing.leaseStartDate,end=patch.leaseEndDate||existing.leaseEndDate;
  if(start&&end&&start>end){delete patch.leaseStartDate;delete patch.leaseEndDate;conflicts.push('leaseDateOrder');}
  return {patch,conflicts};
}
function latestSheet(property) {
  const files=property.sheetFiles?.length?property.sheetFiles:property.sheetFileUrl?[{url:property.sheetFileUrl,name:property.sheetFileName,type:property.sheetFileType}]:[];
  const stamp=v=>typeof v?.seconds==='number'?v.seconds*1000:typeof v==='number'?(v<1e11?v*1000:v):Date.parse(v)||0;
  const ranked=files.map((f,i)=>{const file=typeof f==='string'?{url:f}:f;const dates=[...String(file.name||'').matchAll(/(?:^|\D)((?:20\d{2})[./-]?[01]\d[./-]?[0-3]\d|\d{2}[01]\d[0-3]\d)(?=\D|$)/g)].map(m=>{const n=m[1].replace(/\D/g,'');return Date.parse(`${n.length===8?n.slice(0,4):(+n.slice(0,2)<80?'20':'19')+n.slice(0,2)}-${n.slice(-4,-2)}-${n.slice(-2)}`)||0;});const uploaded=stamp(file.uploadedAt||file.createdAt);return {file,i,date:Math.max(0,...dates)||uploaded,uploaded};});
  ranked.sort((a,b)=>b.date-a.date||b.uploaded-a.uploaded||b.i-a.i);return ranked[0]?.file||null;
}
module.exports={extractRentalFields,readRent,readLease,dateValue,rentalPatch,latestSheet,identityMatches,fields};
