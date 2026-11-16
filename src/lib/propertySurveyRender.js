import model from './propertySurveyModel';

export const SURVEY_FONT='"Hannotate TC","物調文楷","PingFang TC","Microsoft JhengHei",sans-serif';
export async function imageOf(url) { return new Promise((resolve,reject)=>{const image=new Image();image.onload=()=>resolve(image);image.onerror=()=>reject(new Error('照片無法讀取，請重新選取。'));image.src=url;}); }
export async function prepareSurveyPhoto(file) {
  if(!file||file.size>15*1024*1024)throw new Error('請選擇 15MB 以內的照片。');
  const url=URL.createObjectURL(file);
  try { const image=await imageOf(url),scale=Math.min(1,1600/image.width,1600/image.height),canvas=document.createElement('canvas');canvas.width=Math.max(1,Math.round(image.width*scale));canvas.height=Math.max(1,Math.round(image.height*scale));const ctx=canvas.getContext('2d');ctx.fillStyle='#fff';ctx.fillRect(0,0,canvas.width,canvas.height);ctx.drawImage(image,0,0,canvas.width,canvas.height);for(const quality of [.88,.78,.65,.5,.35]){const result=canvas.toDataURL('image/jpeg',quality);if(result.length<=500000)return result;}throw new Error('照片仍然過大，請先裁減或縮小照片。'); }
  finally { URL.revokeObjectURL(url); }
}
export function downloadSurvey(blob,name) { const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=name.replace(/[\\/:*?"<>|]/g,'');document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),60000); }
export async function renderSurveyCanvas(record) {
  await document.fonts?.load('20px "物調文楷"');await document.fonts?.ready;
  const canvas=document.createElement('canvas');canvas.width=1588;canvas.height=2246;const ctx=canvas.getContext('2d');if(!ctx)throw new Error('瀏覽器無法產生物調圖片。');ctx.scale(2,2);ctx.fillStyle='#fff';ctx.fillRect(0,0,794,1123);
  const d=model.values(record.salesData||{}),green='#23766c',ink='#182431',orange='#b8512d',line='#858585';
  const shown=k=>d[k]||'-';
  function rectangle(x,y,w,h,fill='#fff'){ctx.fillStyle=fill;ctx.fillRect(x,y,w,h);ctx.strokeStyle=line;ctx.lineWidth=.55;ctx.strokeRect(x,y,w,h);}
  function write(text,x,y,w,size=20,color=ink,bold=false,align='left'){
    const value=String(text??'');let font=size;ctx.font=`${bold?700:400} ${font}px ${SURVEY_FONT}`;
    while(ctx.measureText(value).width>w&&font>9){font-=.5;ctx.font=`${bold?700:400} ${font}px ${SURVEY_FONT}`;}
    if(ctx.measureText(value).width>w)throw new Error('欄位內容過長，請精簡後產生預覽：'+value.slice(0,50));
    ctx.fillStyle=color;ctx.textAlign=align;ctx.textBaseline='middle';ctx.fillText(value,align==='center'?x+w/2:x,y);ctx.textAlign='left';
  }
  let logo;try{logo=await imageOf('/survey/company-logo.png');ctx.drawImage(logo,177,29,43,43);}catch{ /* The text header remains readable if the logo is unavailable. */ }
  write('台灣房屋 物件銷售資料表',234,54,510,35,'#000',true);
  write('案名：',29,122,55,19);write(shown('case_name'),84,116,510,36, '#203d4c',true);write('契約編號：'+shown('contract_no'),635,116,135,14);
  const x=24,w=746,bx=144,bw=626,third=bw/3;let y=142;
  rectangle(x,y,505,32);rectangle(529,y,241,32);write('地址：'+shown('address'),30,y+16,491,19);write('電話：'+shown('phone'),535,y+16,229,19);y+=32;
  rectangle(x,y,120,107,'#efefef');write('售　價',x,y+54,120,25,green,true,'center');rectangle(bx,y,250,107);write(shown('price_wan')+' 萬',151,y+58,234,52,orange,true);
  rectangle(394,y,135,34,'#efefef');write('建坪：'+d.building_ping+'坪',400,y+17,123,18,green);rectangle(394,y+34,135,73,'#efefef');write('車位：'+shown('parking_price_wan')+'萬',400,y+58,123,18,green);write('單價：'+d.unit_price+'萬',400,y+82,123,18,green);
  rectangle(529,y,241,34);write('所有權登記日：'+shown('ownership_reg_date'),535,y+17,229,18);rectangle(529,y+34,241,73);write('土地坪數',535,y+49,229,18);write('坪數：'+shown('land_ping')+'坪',535,y+72,229,18,green);write('基地持分：'+shown('land_share'),535,y+94,229,18);y+=107;
  rectangle(x,y,120,137,'#efefef');write('建物坪數',x,y+68,120,24,green,true,'center');rectangle(bx,y,bw,137);
  [['主建物','main_area_ping','附屬建物','attached_area_ping'],['公設','common_area_ping','車位','parking_area_ping'],['總坪數','total_ping','公設比','common_ratio_percent']].forEach((r,i)=>{
    const yy=y+28+i*36;for(let j=0;j<2;j++){const xx=150+j*309;write('·',xx,yy,14,24,orange,true);write(`${r[j*2]}：${shown(r[j*2+1])} ${r[j*2+1]==='common_ratio_percent'?'%':'坪'}`,xx+21,yy,276,25,i===2?green:ink,i===2);}
  });y+=137;
  rectangle(x,y,120,259,'#efefef');write('物件現況',x,y+130,120,24,green,true,'center');
  const row=(cells)=>{let xx=bx;cells.forEach(([text,span=1])=>{const width=third*span;rectangle(xx,y,width,37);write(text,xx+5,y+18.5,width-10,20);xx+=width;});y+=37;};
  row([[d.building_type_line],[d.floors_line,2]]);row([[d.layout_line],[d.has_suite_line],[d.has_addition_line]]);row([[d.completion_date_line,2],[d.community_units_line]]);row([[d.orientation_line],[d.lane_width_line],[d.management_fee_line]]);row([[d.parking_spot_line],[d.garbage_line],[d.gas_line]]);row([[d.bathroom_window_line],[d.security_line],[d.occupancy_line]]);row([[d.frontage_line],[d.rent_line],[d.rent_period_line]]);
  rectangle(x,y,120,90,'#efefef');write('生活圈',x,y+45,120,24,green,true,'center');
  [['學　校：'+shown('school'),'公　園：'+shown('park')],['市　場：'+shown('market'),'交　通：'+shown('transport')],['帶看方式：'+shown('viewing_method'),'裝　潢：'+shown('renovation')]].forEach(cells=>{cells.forEach((value,i)=>{rectangle(bx+i*bw/2,y,bw/2,30);write(value,bx+i*bw/2+5,y+15,bw/2-10,20);});y+=30;});
  rectangle(x,y,260,216);rectangle(284,y,486,216);
  if(record.floorplanBase64){const image=await imageOf(record.floorplanBase64),scale=Math.min(246/image.width,194/image.height);ctx.drawImage(image,x+(260-image.width*scale)/2,y+(216-image.height*scale)/2,image.width*scale,image.height*scale);}else write('（未提供照片）',x+8,y+108,244,18,'#777',false,'center');
  write('介紹分析欄：',290,y+30,474,22,green,true);
  const points=model.sellingPoints(record.sellingPointsText);if(!points.length)points.push('（尚未填寫賣點文案）');
  function wrapped(size){ctx.font=`${size}px ${SURVEY_FONT}`;const lines=[];points.forEach((point,i)=>{let row=`${i+1}. `;for(const char of point){if(ctx.measureText(row+char).width>465){lines.push({text:row,index:i});row='　';}row+=char;}lines.push({text:row,index:i});});return lines;}
  let size=23,lines=wrapped(size);while(lines.length*size*1.2>158&&size>10){size--;lines=wrapped(size);}if(lines.length*size*1.2>158)throw new Error('介紹分析欄超過一頁版面，請精簡後產生預覽。');
  lines.forEach((row,i)=>write(row.text,290,y+69+i*size*1.2,474,size,row.index%2?green:ink,true));y+=216;
  rectangle(x,y,260,96,'#efefef');rectangle(284,y,244,96);rectangle(528,y,242,96);write(shown('store_name'),32,y+48,244,28,'#203d4c',true,'center');write('店長：'+shown('store_manager'),290,y+39,232,18);write('不動產經紀人：'+shown('agent_broker'),290,y+64,232,18);write('不動產營業員',535,y+19,227,14);write(shown('sales_rep'),535,y+44,227,27,'#203d4c',true);write(shown('sales_rep_phone'),535,y+75,227,28,'#203d4c',true);
  return canvas;
}
export async function surveyPdf(canvas,title) { const {PDFDocument}=await import('pdf-lib');const pdf=await PDFDocument.create();pdf.setTitle(title);const image=await pdf.embedPng(canvas.toDataURL('image/png')),page=pdf.addPage([595.28,841.89]);page.drawImage(image,{x:0,y:0,width:595.28,height:841.89});return new Blob([await pdf.save()],{type:'application/pdf'}); }
