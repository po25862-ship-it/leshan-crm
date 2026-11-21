import React from 'react';
import typography from '../lib/propertySurveyTypography';
import model from '../lib/propertySurveyModel';
import {resolveAppearance} from '../lib/propertySurveyAppearance';

export default function SurveyTypographyPanel({record, disabled, onChange}) {
  const [expanded, setExpanded] = React.useState(false);
  const settings = typography.resolveTypography(record.typography);
  const font = typography.FONTS[settings.font];
  const colors = resolveAppearance(record.appearance);
  const points = model.sellingPoints(record.sellingPointsText);
  const sample = points.slice(0, 2);
  const set = (key, value) => onChange({...settings, [key]: value});

  return <details className="survey-colors panel" onToggle={event=>setExpanded(event.currentTarget.open)}>
    <summary><strong>字型與文字大小</strong><small>{font.label} · {settings.sizePercent}%</small></summary>
    {expanded&&<fieldset className="survey-type-settings" disabled={disabled}>
      <div className="survey-fields">
        <label>物調字型
          <select value={settings.font} onChange={event=>set('font',event.target.value)}>
            {Object.entries(typography.FONTS).map(([key, option])=><option key={key} value={key}>{option.label}</option>)}
          </select>
        </label>
        <label>字級比例
          <select value={settings.sizePercent} onChange={event=>set('sizePercent',Number(event.target.value))}>
            {[...new Set([85,90,95,100,105,110,115,settings.sizePercent])].sort((a,b)=>a-b).map(size=><option key={size} value={size}>{size}%</option>)}
          </select>
        </label>
        <label>介紹文字行距
          <select value={settings.lineSpacing} onChange={event=>set('lineSpacing',Number(event.target.value))}>
            {[...new Set([1.1,1.2,1.4,1.6,1.8,2,settings.lineSpacing])].sort((a,b)=>a-b).map(spacing=><option key={spacing} value={spacing}>{spacing} 倍</option>)}
          </select>
        </label>
      </div>
      <label className="survey-check"><input type="checkbox" checked={settings.bold} onChange={event=>set('bold',event.target.checked)}/>介紹文字整段加粗</label>
      <div className="survey-type-sample" style={{fontFamily:typography.canvasFamily(font),fontSize:settings.sizePercent+'%',lineHeight:settings.lineSpacing,color:colors.textColor}}>
        <strong style={{color:colors.headingColor}}>{record.salesData?.case_name||'物件銷售資料表'}</strong>
        <ol style={{fontWeight:settings.bold?700:400}}>{(sample.length?sample:['邊間採光，雙衛浴開窗','社區近公園與捷運站']).map((point,index)=><li key={index}>{typography.sellingPointRuns(point,sample.length?record.sellingPointEmphasis:['雙衛浴開窗']).map((run,i)=>run.highlighted?<strong key={i} style={{color:colors.accentColor}}>{run.text}</strong>:run.text)}</li>)}</ol>
      </div>
      <div className="survey-color-footer">
        <p>完整排版請按「產生／更新預覽」。Word 開啟時需要安裝同款字型才能維持字體樣式。</p>
        <button type="button" className="btn ghost" onClick={()=>onChange(typography.DEFAULT_TYPOGRAPHY)}>恢復預設字型</button>
      </div>
    </fieldset>}
  </details>;
}
