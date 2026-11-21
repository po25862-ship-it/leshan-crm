import JSZip from 'jszip';
import model from './propertySurveyModel';
import {resolveAppearance} from './propertySurveyAppearance';
import {FONTS,resolveTypography,sellingPointRuns} from './propertySurveyTypography';
const W='http://schemas.openxmlformats.org/wordprocessingml/2006/main',A='http://schemas.openxmlformats.org/drawingml/2006/main',WP='http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing',R='http://schemas.openxmlformats.org/officeDocument/2006/relationships';
const nodes=(root,name,ns=W)=>Array.from(root.getElementsByTagNameNS(ns,name));
const parse=xml=>new DOMParser().parseFromString(xml,'application/xml');
const xml=node=>new XMLSerializer().serializeToString(node);
function setSize(run,size){let pr=nodes(run,'rPr')[0];if(!pr){pr=run.ownerDocument.createElementNS(W,'w:rPr');run.prepend(pr);}for(const name of ['sz','szCs']){let el=nodes(pr,name)[0];if(!el){el=run.ownerDocument.createElementNS(W,'w:'+name);pr.append(el);}el.setAttributeNS(W,'w:val',Math.round(size*2));}}
function getSize(run){return Number(nodes(run,'sz')[0]?.getAttributeNS(W,'val')||30)/2;}
const width=text=>Array.from(text).reduce((sum,c)=>sum+(c.codePointAt(0)>0x2e80?1:.56),0);
function runProperties(run){
  let properties=nodes(run,'rPr')[0];
  if(!properties){properties=run.ownerDocument.createElementNS(W,'w:rPr');run.prepend(properties);}
  return properties;
}
function runProperty(run,name){
  const properties=runProperties(run);
  let element=nodes(properties,name)[0];
  if(!element){
    element=run.ownerDocument.createElementNS(W,'w:'+name);
    if(name==='rFonts')properties.prepend(element);
    else if(name==='b'){
      const font=nodes(properties,'rFonts')[0];
      properties.insertBefore(element,font?font.nextSibling:properties.firstChild);
    }
    else properties.insertBefore(element,nodes(properties,'sz')[0]||null);
  }
  return element;
}
export async function surveyWord(record){
  const response=await fetch('/survey/sales-sheet-a4.docx');if(!response.ok)throw new Error('Word 範本無法讀取，請稍後再試。');
  const zip=await JSZip.loadAsync(await response.arrayBuffer()),root=parse(await zip.file('word/document.xml').async('string')),v=model.values(record.salesData||{});
  const typography=resolveTypography(record.typography), scale=typography.sizePercent/100;
  if(scale!==1)for(const run of nodes(root,'r'))if(nodes(run,'t').length)setSize(run,getSize(run)*scale);
  const reps=model.salesReps(record.salesData);
  if(reps.length>1){
    const cell=nodes(root,'tc').find(c=>c.textContent.includes('{{sales_rep}}'));
    if(!cell)throw new Error('Word 範本缺少業務欄位。');
    const paragraphs=nodes(cell,'p'),prototype=paragraphs.find(p=>p.textContent.includes('{{sales_rep}}'));
    for(const p of paragraphs.slice(1))p.remove();
    for(const [index,rep] of reps.entries()){
      const p=prototype.cloneNode(true),texts=nodes(p,'t');
      const key='survey_rep_'+index;v[key]=`${rep.name||'-'}　${rep.phone||'-'}`;
      texts.forEach((t,i)=>{t.textContent=i===0?'{{'+key+'}}':'';});
      for(const r of nodes(p,'r'))setSize(r,reps.length===3?11.5:13);
      const spacing=nodes(p,'spacing')[0];if(spacing){spacing.setAttributeNS(W,'w:before',0);spacing.setAttributeNS(W,'w:after',0);spacing.setAttributeNS(W,'w:line',reps.length===3?300:420);spacing.setAttributeNS(W,'w:lineRule','exact');}
      cell.append(p);
    }
  }
  for(const cell of nodes(root,'tc')){
    const prototype=nodes(cell,'p').find(p=>p.textContent.includes('{{selling_point}}'));
    if(prototype){
      const points=model.sellingPoints(record.sellingPointsText);
      if(!points.length)points.push('（尚未填寫賣點文案）');
      const gap=points.length<=3?20:4;
      let font=17*scale;
      for(;font>=10;font--){
        const height=points.reduce((sum,point,i)=>sum+Math.ceil(width(`${i+1}. ${point}`)*font/350)*font*typography.lineSpacing+gap,0);
        if(height<=125)break;
      }
      if(font<10)throw new Error('介紹分析欄超過一頁版面，請縮小字體、縮短行距或精簡文字。');
      for(const [index,point] of points.entries()){
        const paragraph=prototype.cloneNode(true);
        const placeholder=nodes(paragraph,'r').find(run=>run.textContent.includes('{{selling_point}}'));
        if(!placeholder)throw new Error('Word 範本缺少介紹分析欄。');
        for(const {text,highlighted} of [{text:`${index+1}. `,highlighted:false},...sellingPointRuns(point,record.sellingPointEmphasis)]){
          const run=placeholder.cloneNode(true);
          for(const child of Array.from(run.children))if(child.localName!=='rPr')child.remove();
          const value=root.createElementNS(W,'w:t');value.setAttributeNS('http://www.w3.org/XML/1998/namespace','xml:space','preserve');value.textContent=text;run.append(value);
          setSize(run,font);
          runProperty(run,'b').setAttributeNS(W,'w:val',highlighted||typography.bold?'1':'0');
          runProperty(run,'color').setAttributeNS(W,'w:val',highlighted?'BD512E':index%2?'23766C':'182431');
          placeholder.before(run);
        }
        placeholder.remove();
        const spacing=nodes(paragraph,'spacing')[0];
        if(spacing){
          spacing.setAttributeNS(W,'w:before',gap*10);spacing.setAttributeNS(W,'w:after',gap*10);
          spacing.setAttributeNS(W,'w:line',Math.round(font*typography.lineSpacing*.95*20));
          spacing.setAttributeNS(W,'w:lineRule','exact');
        }
        cell.insertBefore(paragraph,prototype);
      }
      prototype.remove();
    }
    const cellWidth=Number(nodes(cell,'tcW')[0]?.getAttributeNS(W,'w')||2000)/20-12;
    for(const p of nodes(cell,'p')){let dynamic=false;for(const t of nodes(p,'t'))if(t.textContent.includes('{{')){dynamic=true;t.textContent=t.textContent.replace(/\{\{(\w+)\}\}/g,(_,key)=>key==='land_no_display'?'':v[key]||'-');}if(!dynamic)continue;const runs=nodes(p,'r');if(nodes(p,'tab').length){for(const r of runs)if(/^[\d.,-]+$/.test(r.textContent))setSize(r,Math.min(getSize(r),65/Math.max(1,width(r.textContent))));continue;}const estimated=runs.reduce((sum,r)=>sum+width(r.textContent)*getSize(r),0),ratio=Math.min(1,cellWidth/Math.max(1,estimated));if(ratio<1){if(runs.some(r=>r.textContent.trim()&&getSize(r)*ratio<9))throw new Error('欄位內容過長，請精簡後下載 Word：'+p.textContent);for(const r of runs)setSize(r,getSize(r)*ratio*.98);}}
  }
  const rels=parse(await zip.file('word/_rels/document.xml.rels').async('string'));
  const drawing=nodes(root,'drawing').find(d=>!nodes(d,'docPr',WP).some(x=>x.getAttribute('name')==='company-logo'));
  if(!drawing)throw new Error('Word 範本缺少照片欄位。');
  const embed=nodes(drawing,'blip',A)[0].getAttributeNS(R,'embed'),rel=Array.from(rels.documentElement.children).find(x=>x.getAttribute('Id')===embed);zip.remove('word/'+rel.getAttribute('Target'));
  if(record.floorplanBase64){const match=record.floorplanBase64.match(/^data:image\/(png|jpeg);base64,(.+)$/);if(!match)throw new Error('照片格式不正確。');const ext=match[1]==='jpeg'?'jpg':'png',target='media/property-photo.'+ext;zip.file('word/'+target,match[2],{base64:true});rel.setAttribute('Target',target);const image=await new Promise((resolve,reject)=>{const img=new Image();img.onload=()=>resolve(img);img.onerror=reject;img.src=record.floorplanBase64;});const scale=Math.min(6.5*360000/image.width,4.9*360000/image.height);for(const el of [...nodes(drawing,'extent',WP),...nodes(drawing,'ext',A)]){el.setAttribute('cx',Math.round(image.width*scale));el.setAttribute('cy',Math.round(image.height*scale));}const types=parse(await zip.file('[Content_Types].xml').async('string'));if(!Array.from(types.documentElement.children).some(x=>x.getAttribute('Extension')===ext)){const el=types.createElementNS(types.documentElement.namespaceURI,'Default');el.setAttribute('Extension',ext);el.setAttribute('ContentType','image/'+match[1]);types.documentElement.append(el);}zip.file('[Content_Types].xml',xml(types));}
  else{const parent=drawing.parentNode;drawing.remove();const label=root.createElementNS(W,'w:t');label.textContent='（未提供照片）';parent.append(label);rel.remove();}
  const colors=resolveAppearance(record.appearance),hex=key=>colors[key].slice(1).toUpperCase();
  for(const color of nodes(root,'color')){
    const original=(color.getAttributeNS(W,'val')||'').toUpperCase();
    color.setAttributeNS(W,'w:val',hex(original==='23766C'?'headingColor':['BD512E','C64F2C'].includes(original)?'accentColor':'textColor'));
    for(const attr of ['themeColor','themeTint','themeShade'])color.removeAttributeNS(W,attr);
  }
  const family=FONTS[typography.font].word;
  for(const run of nodes(root,'r')){
    if(!nodes(run,'t').length)continue;
    let pr=nodes(run,'rPr')[0];if(!pr){pr=root.createElementNS(W,'w:rPr');run.prepend(pr);}
    if(!nodes(pr,'color').length){const color=root.createElementNS(W,'w:color');color.setAttributeNS(W,'w:val',hex('textColor'));pr.append(color);}
    if(family){
      const font=runProperty(run,'rFonts');
      for(const attr of ['asciiTheme','hAnsiTheme','eastAsiaTheme','cstheme','csTheme'])font.removeAttributeNS(W,attr);
      for(const attr of ['ascii','hAnsi','eastAsia','cs'])font.setAttributeNS(W,'w:'+attr,family);
    }
  }
  for(const shade of nodes(root,'shd')){shade.setAttributeNS(W,'w:fill',hex('panelColor'));for(const attr of ['themeFill','themeFillTint','themeFillShade'])shade.removeAttributeNS(W,attr);}
  for(const parent of [...nodes(root,'tcBorders'),...nodes(root,'tblBorders'),...nodes(root,'pBdr')])for(const border of Array.from(parent.children)){border.setAttributeNS(W,'w:color',hex('borderColor'));for(const attr of ['themeColor','themeTint','themeShade'])border.removeAttributeNS(W,attr);}
  const result=xml(root);if(result.includes('{{'))throw new Error('Word 範本欄位尚未完全填入。');zip.file('word/document.xml',result);zip.file('word/_rels/document.xml.rels',xml(rels));
  return zip.generateAsync({type:'blob',mimeType:'application/vnd.openxmlformats-officedocument.wordprocessingml.document',compression:'DEFLATE'});
}
