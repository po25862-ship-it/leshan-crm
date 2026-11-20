const DEFAULT_APPEARANCE = Object.freeze({textColor:'#182431',headingColor:'#23766c',accentColor:'#b8512d',panelColor:'#efefef',borderColor:'#858585'});
const COLOR_FIELDS = Object.freeze([
  ['textColor','內文字體'],['headingColor','區塊標題字體'],['accentColor','售價與重點字體'],['panelColor','區塊底色'],['borderColor','表格框線'],
]);
const APPEARANCE_PRESETS = Object.freeze([
  {name:'原始配色',colors:DEFAULT_APPEARANCE},
  {name:'沉穩藍',colors:{textColor:'#1e293b',headingColor:'#245478',accentColor:'#a64325',panelColor:'#edf3f8',borderColor:'#94a8b8'}},
  {name:'暖米色',colors:{textColor:'#352b23',headingColor:'#756049',accentColor:'#a33e24',panelColor:'#f4eee5',borderColor:'#b4a28f'}},
  {name:'黑白列印',colors:{textColor:'#111111',headingColor:'#111111',accentColor:'#111111',panelColor:'#f2f2f2',borderColor:'#777777'}},
]);
function normalizeAppearance(value) {
  if(value==null)return {...DEFAULT_APPEARANCE};
  if(typeof value!=='object'||Array.isArray(value))throw new Error('物調配色格式不正確。');
  const result={...DEFAULT_APPEARANCE};
  for(const [key,label] of COLOR_FIELDS)if(value[key]!=null){
    if(typeof value[key]!=='string'||!/^#[a-f0-9]{6}$/i.test(value[key]))throw new Error(label+'請選擇有效的顏色。');
    result[key]=value[key].toLowerCase();
  }
  return result;
}
function resolveAppearance(value) {
  const result={...DEFAULT_APPEARANCE};
  for(const key of Object.keys(result))if(typeof value?.[key]==='string'&&/^#[a-f0-9]{6}$/i.test(value[key]))result[key]=value[key].toLowerCase();
  return result;
}
module.exports={DEFAULT_APPEARANCE,COLOR_FIELDS,APPEARANCE_PRESETS,normalizeAppearance,resolveAppearance};
