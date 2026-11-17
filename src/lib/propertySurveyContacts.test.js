import fs from 'fs';
import path from 'path';
import JSZip from 'jszip';
import model from './propertySurveyModel';
import {renderSurveyCanvas} from './propertySurveyRender';
import {surveyWord} from './propertySurveyWord';

jest.mock('./propertySurveyPhoto',()=>({imageOf:jest.fn(async()=>({width:100,height:100}))}));
const W='http://schemas.openxmlformats.org/wordprocessingml/2006/main';
const fields={case_name:'測試三人共同服務',store_name:'捷運樂善直營店',sales_rep:'測試甲',sales_rep_phone:'0900-000-001',sales_rep_2:'測試乙',sales_rep_phone_2:'0900-000-002',sales_rep_3:'測試丙',sales_rep_phone_3:'0900-000-003',total_ping:'54.59',parking_area_ping:'11.01',main_area_ping:'27.36',attached_area_ping:'3.18',common_area_ping:'13.04',common_ratio_mode:'auto'};
const elements=(root,name)=>Array.from(root.getElementsByTagNameNS(W,name));

test.each([1,2,3])('canvas places exactly %i selected contacts inside the existing A4 footer',async count=>{
 const drawn=[];
 const ctx={scale:jest.fn(),fillRect:jest.fn(),strokeRect:jest.fn(),drawImage:jest.fn(),measureText(value){return {width:Array.from(value).reduce((sum,c)=>sum+(c.charCodeAt(0)>127?1:.56),0)*Number(this.font?.match(/([\d.]+)px/)?.[1]||20)};},fillText(value,x,y){drawn.push({value,x,y,font:this.font});}};
 const getContext=jest.spyOn(HTMLCanvasElement.prototype,'getContext').mockReturnValue(ctx);
 try{
   const data={...fields,sales_rep_count:String(count)};
   const canvas=await renderSurveyCanvas({salesData:data});expect(canvas.width).toBe(1588);expect(canvas.height).toBe(2246);
   const printed=drawn.filter(row=>row.value.includes('測試甲')||row.value.includes('測試乙')||row.value.includes('測試丙'));
   expect(printed).toHaveLength(count);
   for(const [index,rep] of model.salesReps(data).entries()){
     expect(printed[index].value).toContain(rep.name);
     expect(drawn.some(row=>row.value.includes(rep.phone))).toBe(true);
     expect(printed[index].x).toBe(535);expect(printed[index].y).toBeGreaterThan(1000);expect(printed[index].y).toBeLessThan(1070);
   }
   const allText=drawn.map(row=>row.value).join('\n');
   expect(allText).toContain('公設比：29.92 %');
   if(count<3){expect(allText).not.toContain(fields.sales_rep_3);expect(allText).not.toContain(fields.sales_rep_phone_3);}
 }finally{getContext.mockRestore();}
});

test.each([1,2,3])('Word prints %i selected contacts and retains the fixed footer row height',async count=>{
 const template=fs.readFileSync(path.join(process.cwd(),'public/survey/sales-sheet-a4.docx'));
 const originalFetch=global.fetch;
 global.fetch=jest.fn(async()=>({ok:true,arrayBuffer:async()=>Uint8Array.from(template).buffer}));
 try{
   const blob=await surveyWord({salesData:{...fields,sales_rep_count:String(count)}});
   const buffer=await new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result);reader.onerror=()=>reject(reader.error);reader.readAsArrayBuffer(blob);});
   const zip=await JSZip.loadAsync(buffer),xml=await zip.file('word/document.xml').async('string');
   const root=new DOMParser().parseFromString(xml,'application/xml');expect(root.querySelector('parsererror')).toBeNull();expect(xml).not.toContain('{{');
   expect(root.documentElement.textContent).toContain('29.92');
   const cell=elements(root,'tc').find(c=>c.textContent.includes('不動產營業員'));
   const selected=model.salesReps({...fields,sales_rep_count:String(count)});
   for(const rep of selected){expect(cell.textContent).toContain(rep.name);expect(cell.textContent).toContain(rep.phone);}
   if(count<3){expect(cell.textContent).not.toContain(fields.sales_rep_3);expect(cell.textContent).not.toContain(fields.sales_rep_phone_3);}
   expect(elements(cell,'p')).toHaveLength(count===1?3:count+1);
   const tr=cell.parentNode;expect(elements(tr,'trHeight')[0].getAttributeNS(W,'val')).toBe('1417');
   expect(elements(tr,'trHeight')[0].getAttributeNS(W,'hRule')).toBe('exact');
   if(count>1){const lineHeights=elements(cell,'spacing').map(s=>Number(s.getAttributeNS(W,'line')));expect(lineHeights.reduce((a,b)=>a+b,0)).toBeLessThan(1377);}
 }finally{global.fetch=originalFetch;}
});
