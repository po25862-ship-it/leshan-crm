const GROUPS = [
  ['案件基本資訊', [['case_name','案名'],['contract_no','契約編號'],['address','地址'],['phone','門市電話'],['price_wan','售價（萬）'],['parking_price_wan','車位金額（萬）'],['ownership_reg_date','所有權登記日']]],
  ['坪數與車位', [['main_area_ping','主建物（坪）'],['attached_area_ping','附屬建物（坪）'],['common_area_ping','公設（坪）'],['parking_area_ping','車位（坪）'],['parking_type','車位類型'],['total_ping','總坪數（坪）'],['common_ratio_percent','公設比（%）'],['land_ping','土地坪數（坪）'],['land_share','基地持分']]],
  ['物件現況', [['building_type','房屋型式'],['sale_floor','出售樓層（樓）'],['total_floors','總樓層（層）'],['basement_floors','地下（層）'],['layout','格局（房／廳／衛／陽台）'],['has_suite','有無套房'],['has_addition','有無增建'],['completion_date','建築完成日期'],['community_units','社區總戶數'],['orientation','座向'],['lane_width','巷寬（米）'],['management_fee','管理費（元／月）'],['parking_spot','停車位'],['garbage','垃圾處理'],['gas','天然瓦斯'],['bathroom_window','廁所對外窗'],['security','警衛管理'],['occupancy','自住／空屋'],['frontage','面寬'],['rent','租金（元／月）'],['rent_period','租期']]],
  ['生活圈', [['school','學校'],['park','公園'],['market','市場'],['transport','交通'],['viewing_method','帶看方式'],['renovation','裝潢']]],
  ['店家資訊', [['store_name','門市店名'],['store_manager','店長'],['agent_broker','不動產經紀人'],['sales_rep_count','業務人數'],['sales_rep','不動產營業員'],['sales_rep_phone','營業員電話'],['sales_rep_2','第二位營業員'],['sales_rep_phone_2','第二位營業員電話'],['sales_rep_3','第三位營業員'],['sales_rep_phone_3','第三位營業員電話']]],
];
const FIELD_KEYS = GROUPS.flatMap(([, fields])=>fields.map(([key])=>key));
const SALES_REP_FIELDS = [['sales_rep','sales_rep_phone'],['sales_rep_2','sales_rep_phone_2'],['sales_rep_3','sales_rep_phone_3']];
const SALES_REP_KEYS = ['sales_rep_count',...SALES_REP_FIELDS.flat()];
const CONTACT_KEYS = ['phone','store_name','store_manager','agent_broker',...SALES_REP_KEYS];
function text(value) { return value == null ? '' : String(value).trim(); }
function salesRepCount(data={}) {
  const count=text(data.sales_rep_count).normalize('NFKC');
  if(/^[1-3]$/.test(count))return Number(count);
  for(let index=SALES_REP_FIELDS.length-1;index>0;index--)if(SALES_REP_FIELDS[index].some(key=>text(data[key])))return index+1;
  return 1;
}
function salesReps(data={}) { return SALES_REP_FIELDS.slice(0,salesRepCount(data)).map(([name,phone])=>({name:text(data[name]),phone:text(data[phone])})); }
function number(value) { if (!text(value) || /^[-—]$/.test(text(value))) return null; const n=Number(text(value).replace(/,/g,'')); return Number.isFinite(n)?n:null; }
function floor(value,unit,prefix) { return (text(value).normalize('NFKC').replace(prefix,'').replace(/(?:樓|層|F)$/i,'').trim()||'-')+unit; }
function floorLine(data) { return `出售樓層${floor(data.sale_floor,'樓',/^(?:出售樓層|出售|第)/)}　總樓層${floor(data.total_floors,'層',/^(?:總樓層|地上|共|第)/)}　地下${floor(data.basement_floors,'層',/^(?:地下總樓層|地下|B)/i)}`; }
function sellingPoints(value) { return text(value).split('\n').map(x=>x.replace(/^\s*\d+[.、．]\s*/,'').trim()).filter(Boolean); }
function values(data) {
  const v=Object.fromEntries(FIELD_KEYS.map(k=>[k,text(data[k])]));
  const total=number(v.total_ping),parking=number(v.parking_area_ping)||0;
  const building=total==null?null:total-parking,price=number(v.price_wan),car=number(v.parking_price_wan)||0;
  v.building_ping=building==null?'-':building.toFixed(2);
  v.unit_price=price!=null&&building>0?String(Math.round((price-car)/building)):'-';
  v.floors_line=floorLine(v);v.land_no_display='';
  v.ownership_reg_date=v.ownership_reg_date.replace(/(?:民國)?\s*(\d{1,3})年\s*(\d{1,2})月\s*(\d{1,2})日/,(_,y,m,d)=>`${y}/${m.padStart(2,'0')}/${d.padStart(2,'0')}`);
  const labels={building_type:'房屋型式',layout:'格局',has_suite:'有無套房',has_addition:'有無增建',completion_date:'建築完成日期',community_units:'社區總戶數',orientation:'座向',lane_width:'巷寬',management_fee:'管理費',parking_spot:'停車位',garbage:'垃圾處理',gas:'天然瓦斯',bathroom_window:'廁所對外窗',security:'警衛管理',occupancy:'自住/空屋',frontage:'面寬',rent:'租金',rent_period:'租期'};
  Object.entries(labels).forEach(([key,label])=>{let value=v[key];const unit={lane_width:'米',management_fee:'元/月',rent:'元／月'}[key];if(unit&&(!value||/^[\d,.]+$/.test(value)))value=(value||'　')+unit;v[key+'_line']=label+'：'+(value||'　');});
  return v;
}
function normalizeDraft(input={}) {
  const data=input.salesData||input.data||{};
  const salesData={};
  for(const key of FIELD_KEYS) { const value=text(data[key]);if(value.length>500)throw new Error('欄位內容過長，請精簡後儲存。');salesData[key]=value; }
  if(text(data.sales_rep_count)&&!/^[1-3]$/.test(text(data.sales_rep_count).normalize('NFKC')))throw new Error('業務人數請選擇 1 到 3 人。');
  salesData.sales_rep_count=String(salesRepCount(data));
  if(!salesData.case_name||salesData.case_name.length>120)throw new Error('請填寫 120 字以內的案名。');
  const rawText=text(input.rawText),sellingPointsText=text(input.sellingPointsText),notes=text(input.notes);
  if(rawText.length>80000||sellingPointsText.length>4000||notes.length>5000)throw new Error('文字資料過長，請分開整理後儲存。');
  const points=sellingPoints(sellingPointsText);
  if(points.length>12||points.some(x=>x.length>500))throw new Error('介紹分析欄最多 12 點，每點 500 字。');
  const floorplanBase64=text(input.floorplanBase64);
  if(floorplanBase64&&!/^data:image\/(?:jpeg|png);base64,[A-Za-z0-9+/]+=*$/.test(floorplanBase64))throw new Error('照片請使用 JPG 或 PNG。');
  if(floorplanBase64.length>560000)throw new Error('照片過大，請重新選取讓系統縮小照片。');
  const result={salesData,rawText,sellingPointsText,notes,floorplanBase64};
  if(JSON.stringify(result).length>850000)throw new Error('案件資料過大，請縮小照片或精簡文字。');
  return result;
}
function fromCrm(property={}) {
  const map={title:'case_name',listingNo:'contract_no',address:'address',totalPrice:'price_wan',parkingPrice:'parking_price_wan',titlePing:'total_ping',mainBuildingPing:'main_area_ping',auxiliaryBuildingPing:'attached_area_ping',commonAreaPing:'common_area_ping',parkingPing:'parking_area_ping',landPing:'land_ping',parkingDescription:'parking_type',floor:'sale_floor',totalFloors:'total_floors',layout:'layout',orientation:'orientation',managementFee:'management_fee',occupancy:'occupancy',laneWidth:'lane_width',viewingMethod:'viewing_method',category:'building_type',parkingNumber:'parking_spot'};
  const result=Object.fromEntries(Object.entries(map).map(([source,target])=>[target,text(property[source])]));
  const floors=text(property.floor).match(/^([^/]+)\s*\/\s*(\d+)\s*(?:樓|層)?$/);
  if(floors){result.sale_floor=floors[1].trim();if(!result.total_floors)result.total_floors=floors[2];}
  return result;
}
module.exports={GROUPS,FIELD_KEYS,CONTACT_KEYS,SALES_REP_FIELDS,SALES_REP_KEYS,salesRepCount,salesReps,text,number,floorLine,sellingPoints,values,normalizeDraft,fromCrm};
