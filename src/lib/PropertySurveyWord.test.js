import fs from 'fs';
import JSZip from 'jszip';
import {surveyWord} from './propertySurveyWord';

const W='http://schemas.openxmlformats.org/wordprocessingml/2006/main';
const readBlob=blob=>new Promise((resolve,reject)=>{
  const reader=new FileReader();
  reader.onload=()=>resolve(reader.result);
  reader.onerror=()=>reject(reader.error);
  reader.readAsArrayBuffer(blob);
});

test('the existing editable Word template exports the chosen Chinese font and emphasizes only the marked words',async()=>{
  const template=fs.readFileSync('public/survey/sales-sheet-a4.docx');
  const originalFetch=global.fetch;
  try{
    global.fetch=jest.fn(async()=>({ok:true,arrayBuffer:async()=>Uint8Array.from(template).buffer}));
    const result=await surveyWord({
      salesData:{case_name:'測試物調',school:'樂善國小',park:'樂善公園'},
      sellingPointsText:'1. 邊間採光、雙衛浴開窗',
      sellingPointEmphasis:['雙衛浴開窗'],
      typography:{font:'serif',sizePercent:105,lineSpacing:1.4,bold:false},
      appearance:{accentColor:'#A34220'}
    });
    const zip=await JSZip.loadAsync(await readBlob(result));
    const raw=await zip.file('word/document.xml').async('string');
    const doc=new DOMParser().parseFromString(raw,'application/xml');
    const runs=Array.from(doc.getElementsByTagNameNS(W,'r'));
    const property=(text,tag,attr='val')=>runs.find(el=>el.textContent===text)?.getElementsByTagNameNS(W,tag)[0]?.getAttributeNS(W,attr);
    expect(property('雙衛浴開窗','rFonts','eastAsia')).toBe('Noto Serif TC');
    expect(property('雙衛浴開窗','color')).toBe('A34220');
    expect(property('雙衛浴開窗','b')).toBe('1');
    expect(property('邊間採光、','b')).toBe('0');
    expect(raw).toContain('樂善國小');
    expect(raw).not.toContain('{{');
  }finally{global.fetch=originalFetch;}
});
