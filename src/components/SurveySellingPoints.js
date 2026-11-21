import React, {useState} from 'react';
import model from '../lib/propertySurveyModel';
import {normalizeEmphasis} from '../lib/propertySurveyTypography';

export default function SurveySellingPoints({value='', emphasis, onChange, onEmphasisChange, onAnalyze, disabled}) {
  const [selection,setSelection] = useState('');
  const points = [...new Set(model.sellingPoints(value))];
  const marked = normalizeEmphasis(emphasis,points);
  const selectedText = selection && !selection.includes('\n') && points.some(point=>point.includes(selection)) ? selection : '';
  const add = text => onEmphasisChange(normalizeEmphasis([...marked,text],points));
  const remove = text => onEmphasisChange(marked.filter(item=>item!==text));

  return <div className="survey-selling-points">
    <label htmlFor="survey-points">介紹與賣點（一行一點）</label>
    <textarea id="survey-points" value={value} onChange={event=>{setSelection('');onChange(event.target.value);}} onSelect={event=>{const {value:text,selectionStart,selectionEnd}=event.target;setSelection(text.slice(selectionStart,selectionEnd).trim());}}/>
    <div className="survey-import-row">
      <button type="button" className="btn ghost" disabled={disabled} onClick={onAnalyze}>AI 整理賣點</button>
      <button type="button" className="btn ghost" disabled={disabled||!selectedText||marked.includes(selectedText)||marked.length>=24} onMouseDown={event=>event.preventDefault()} onClick={()=>{add(selectedText);setSelection('');}}>強調選取的文字</button>
    </div>
    {points.length>0&&<div className="survey-emphasis">
      <p className="survey-hint">點選整句賣點，或反白其中幾個字再按「強調選取的文字」。最多可強調 24 項。</p>
      <div className="survey-emphasis-options" aria-label="整句賣點">
        {points.map(point=><button type="button" key={point} className="btn ghost" aria-pressed={marked.includes(point)} disabled={disabled||(!marked.includes(point)&&marked.length>=24)} onClick={()=>marked.includes(point)?remove(point):add(point)}>{point}</button>)}
      </div>
      {marked.some(text=>!points.includes(text))&&<div className="survey-emphasis-options" aria-label="已強調的詞句">
        {marked.filter(text=>!points.includes(text)).map(text=><button type="button" key={text} className="btn ghost" aria-label={'取消強調 '+text} disabled={disabled} onClick={()=>remove(text)}>{text} ×</button>)}
      </div>}
    </div>}
  </div>;
}
