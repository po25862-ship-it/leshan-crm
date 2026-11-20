import React from 'react';
import appearance from '../lib/propertySurveyAppearance';

export default function SurveyAppearancePanel({value,onChange,salesData={},disabled=false}) {
  const colors=appearance.resolveAppearance(value);
  return <details className="survey-colors panel">
    <summary><strong>字體與版面顏色</strong><span className="survey-color-dots" aria-hidden="true">{['textColor','headingColor','accentColor','panelColor'].map(key=><i key={key} style={{backgroundColor:colors[key]}}/>)}</span><small>展開／收起</small></summary>
    <fieldset className="survey-color-controls" disabled={disabled}>
      <legend className="survey-color-legend">物調配色設定</legend>
      <div className="survey-color-presets" aria-label="物調現成配色">{appearance.APPEARANCE_PRESETS.map(preset=><button type="button" className="btn ghost" key={preset.name} aria-pressed={appearance.COLOR_FIELDS.every(([key])=>colors[key]===preset.colors[key])} onClick={()=>onChange({...preset.colors})}><i style={{backgroundColor:preset.colors.headingColor}} aria-hidden="true"/>{preset.name}</button>)}</div>
      <div className="survey-color-layout">
        <div className="survey-color-fields">{[['字體顏色',appearance.COLOR_FIELDS.slice(0,3)],['版面顏色',appearance.COLOR_FIELDS.slice(3)]].map(([title,fields])=><fieldset key={title}><legend>{title}</legend>{fields.map(([key,label])=><label key={key} htmlFor={'survey-color-'+key}><span>{label}</span><input id={'survey-color-'+key} type="color" value={colors[key]} onChange={event=>onChange({...colors,[key]:event.target.value})}/><code>{colors[key].toUpperCase()}</code></label>)}</fieldset>)}</div>
        <figure className="survey-color-sample" style={{color:colors.textColor,borderColor:colors.borderColor}}>
          <div className="survey-color-sample-title" style={{borderColor:colors.borderColor}}>{salesData.case_name||'物件銷售資料表'}</div>
          <div className="survey-color-sample-price"><span style={{backgroundColor:colors.panelColor,color:colors.headingColor,borderColor:colors.borderColor}}>售價</span><strong style={{color:colors.accentColor}}>{salesData.price_wan||'1,598'} 萬</strong></div>
          <div className="survey-color-sample-row" style={{borderColor:colors.borderColor}}><b style={{backgroundColor:colors.panelColor,color:colors.headingColor,borderColor:colors.borderColor}}>物件資料</b><span>主建物・車位・管理費</span></div>
          <figcaption>配色即時示意；完整物調請按「產生／更新預覽」。</figcaption>
        </figure>
      </div>
      <div className="survey-color-footer"><p>只調整這份物調的配色，並隨案件儲存；PDF、JPG 和 Word 都會套用。照片及公司標誌保留原色。</p><button type="button" className="btn ghost" onClick={()=>onChange({...appearance.DEFAULT_APPEARANCE})}>恢復預設配色</button></div>
    </fieldset>
  </details>;
}
