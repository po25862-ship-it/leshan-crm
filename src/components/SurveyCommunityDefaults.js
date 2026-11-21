import React, {useEffect,useMemo,useState} from 'react';
import SearchSelect from './SearchSelect';
import catalog from '../lib/a7-community-options.json';
import {applyCommunity,communityValues,keyFor,STARTER_PRESETS} from '../lib/propertySurveyCommunities';

const catalogByAlias = new Map(catalog.communities.flatMap(({name,aliases=[]})=>[name,...aliases].map(alias=>[keyFor(alias),name])));
const canonical = name => catalogByAlias.get(keyFor(name)) || String(name||'').trim();

export default function SurveyCommunityDefaults({record,properties,presets,loading,disabled,onApply,onSave}) {
  const current = canonical(record.salesData?.community_name);
  const [candidate,setCandidate] = useState(current);
  useEffect(()=>setCandidate(current),[current,record.id]);
  const {options,byName,owned} = useMemo(()=>{
    const byName = new Map(STARTER_PRESETS.map(preset=>[keyFor(preset.name),preset]));
    const owned = new Set();
    for(const preset of presets){
      const key=keyFor(canonical(preset.name));
      owned.add(key);
      byName.set(key,preset);
    }
    const rows = new Map();
    for(const item of [...catalog.communities,...properties.map(property=>({name:property.communityName})),...presets,{name:current}]){
      const name=canonical(item.name), key=keyFor(name);
      if(name&&!rows.has(key)){
        const preset=byName.get(key);
        rows.set(key,{value:name,label:name,searchText:item.aliases?.join(' '),description:preset?'可帶入 '+Object.keys(preset.values).length+' 項':undefined});
      }
    }
    const options=[...rows.values()].sort((a,b)=>Number(byName.has(keyFor(b.value)))-Number(byName.has(keyFor(a.value)))||a.label.localeCompare(b.label,'zh-Hant'));
    return {options,byName,owned};
  },[current,properties,presets]);
  const name = canonical(candidate), key = keyFor(name), preset = byName.get(key);
  const values = communityValues(record.salesData);
  const busy = loading||disabled;

  function apply() {
    const result=applyCommunity(record.salesData||{},record.communityAppliedValues,name,preset);
    let message=preset?`已帶入「${name}」的 ${Object.keys(result.communityAppliedValues).length} 項資料。`:`已選擇「${name}」。填好生活圈及物件現況後，可儲存為預設。`;
    if(result.retained.length)message+=`保留單案已填的${result.retained.join('、')}。`;
    onApply(result,message);
  }

  return <section className="panel survey-community">
    <h3>社區資料</h3>
    <div className="survey-import-row survey-crm-import">
      <SearchSelect label="選擇社區" value={candidate} options={options} onChange={setCandidate} disabled={busy} maxLength={80} placeholder="搜尋社區名稱，或輸入其他社區"/>
      <button type="button" className="btn ghost" disabled={busy||!name} onClick={apply}>帶入社區資料</button>
      <button type="button" className="btn ghost" disabled={busy||!current||key!==keyFor(current)||!Object.keys(values).length} onClick={()=>onSave({name:current,values})}>{owned.has(key)?'更新我的社區預設':'儲存為我的社區預設'}</button>
    </div>
    <p className="survey-hint">{loading?'正在讀取社區預設…':current?`目前社區　${current}`:'選好社區，再按「帶入社區資料」。'} 可帶入學校、公園、市場、交通、完工日、總戶數、警衛管理及垃圾處理。</p>
  </section>;
}
