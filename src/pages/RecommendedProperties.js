import React, { useMemo, useState } from "react";
import { Image as ImageIcon, Check, X, ExternalLink } from "lucide-react";
import { useCollection } from "../hooks/useCollection";
import { matchPropertiesForNeed } from "../lib/needsMatch";
import { getPropertyImage, propertyParkingText } from "../lib/propertyPresentation";
import PropertyShare from "./PropertyShare";

function MatchBadge({ percent }) {
  const value = Number.isFinite(percent) ? percent : null;
  return <span className={`match-badge ${value >= 90 ? "excellent" : value >= 80 ? "good" : "neutral"}`}>{value === null ? "手動" : `${value}%`}</span>;
}

function PropertyMatchCard({ property, match, action, selected, onSelect, introduced, onIntroduced, onRemove }) {
  const image = getPropertyImage(property);
  return (
    <article className={`property-match-card ${selected ? "selected" : ""}`}>
      <div className="property-match-media">
        {image ? <img src={image} alt={`${property.title} 物件照片`} /> : <div className="property-image-empty"><ImageIcon size={28} /><span>尚未上傳案件照片</span></div>}
        <MatchBadge percent={match?.percent} />
        {onSelect && <input className="property-select" type="checkbox" checked={!!selected} onChange={onSelect} aria-label={`選取 ${property.title}`} />}
      </div>
      <div className="property-match-body">
        <div className="property-match-title-row">
          <div><span className="property-category">{property.category || "未分類"}</span><h4>{property.title || "未命名物件"}</h4></div>
          <a href={`#/properties?open=${property.id}`} target="_blank" rel="noopener noreferrer" aria-label="查看物件詳情"><ExternalLink size={17} /></a>
        </div>
        <div className="property-price">{property.totalPrice ? Number(property.totalPrice).toLocaleString() : "—"}<small> 萬</small></div>
        <div className="property-facts">
          <span>{property.titlePing || property.mainBuildingPing || "—"} 坪</span>
          <span>{property.layout || "格局未填"}</span>
          <span>{property.floor || "樓層未填"}</span>
          <span>{propertyParkingText(property)}</span>
        </div>
        <div className="property-address">{property.address || "地址未填"}</div>
        {match && (
          <div className="match-reasons">
            {match.reasons.slice(0, 4).map((reason) => <span className="hit" key={reason}><Check size={12} />{reason}</span>)}
            {match.missedReasons.slice(0, 3).map((reason) => <span className="miss" key={reason}><X size={12} />{reason}</span>)}
          </div>
        )}
        <div className="property-match-actions">
          {action}
          {onIntroduced && <label><input type="checkbox" checked={!!introduced} onChange={onIntroduced} /> 已介紹</label>}
          {onRemove && <button type="button" className="text-danger" onClick={onRemove}>移除</button>}
        </div>
      </div>
    </article>
  );
}

export default function RecommendedProperties({ value, onChange, need }) {
  const { items: properties } = useCollection("properties", "title");
  const recommended = value || [];
  const recommendedIds = recommended.map((item) => item.propertyId);
  const [showAll, setShowAll] = useState(false);
  const [showPicker, setShowPicker] = useState(false);
  const [keyword, setKeyword] = useState("");
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [showShare, setShowShare] = useState(false);

  const propertyMap = useMemo(() => Object.fromEntries(properties.map((property) => [property.id, property])), [properties]);
  const matches = useMemo(() => matchPropertiesForNeed(need, properties), [need, properties]);
  const matchMap = useMemo(() => Object.fromEntries(matches.map((match) => [match.property.id, match])), [matches]);
  const suggestions = matches.filter((match) => !recommendedIds.includes(match.property.id));
  const strongSuggestions = suggestions.filter((match) => match.percent >= 80);
  const visibleSuggestions = showAll ? strongSuggestions : strongSuggestions.slice(0, 6);

  const addProperty = (propertyId) => onChange([...recommended, { propertyId, introduced: false, addedAt: new Date().toISOString().slice(0, 10) }]);
  const removeProperty = (propertyId) => onChange(recommended.filter((item) => item.propertyId !== propertyId));
  const toggleIntroduced = (propertyId) => onChange(recommended.map((item) => item.propertyId === propertyId ? { ...item, introduced: !item.introduced } : item));
  const toggleSelect = (propertyId) => setSelectedIds((current) => {
    const next = new Set(current);
    if (next.has(propertyId)) next.delete(propertyId); else next.add(propertyId);
    return next;
  });
  const filtered = properties.filter((property) => !recommendedIds.includes(property.id) && (!keyword.trim() || `${property.title} ${property.address}`.includes(keyword.trim())));

  return (
    <div className="recommended-properties-v2">
      <div className="recommendation-heading">
        <div><span>MATCHING ENGINE V2</span><h3>系統推薦物件</h3><p>區域硬篩、預算 10% 容忍，依必要與偏好條件加權排序。</p></div>
        <div className="recommendation-count"><strong>{strongSuggestions.length}</strong><span>筆 80%+</span></div>
      </div>

      {visibleSuggestions.length > 0 ? (
        <div className="property-match-grid">
          {visibleSuggestions.map((match) => <PropertyMatchCard key={match.property.id} property={match.property} match={match} action={<button type="button" className="btn" onClick={() => addProperty(match.property.id)}>＋ 加入推薦</button>} />)}
        </div>
      ) : <div className="match-empty">目前沒有 80% 以上的新配對；可調整必要條件或從物件清單手動加入。</div>}
      {strongSuggestions.length > 6 && <button type="button" className="btn ghost" onClick={() => setShowAll((current) => !current)}>{showAll ? "收合推薦" : `查看全部 ${strongSuggestions.length} 筆`}</button>}

      <div className="recommended-list-heading">
        <div><strong>已加入推薦</strong><span>{recommended.length} 筆</span></div>
        {recommended.length > 0 && <button type="button" className={selectionMode ? "btn" : "btn ghost"} onClick={() => { setSelectionMode((current) => !current); setSelectedIds(new Set()); setShowShare(false); }}>{selectionMode ? "結束勾選" : "勾選傳送"}</button>}
      </div>
      {selectedIds.size > 0 && <div className="share-selection-bar"><strong>已選 {selectedIds.size} 筆</strong><button type="button" className="btn" onClick={() => setShowShare(true)}>分享給客人</button><button type="button" className="btn ghost" onClick={() => setSelectedIds(new Set())}>清除</button></div>}
      {showShare && <PropertyShare properties={recommended.map((item) => propertyMap[item.propertyId]).filter((property) => property && selectedIds.has(property.id))} onClose={() => setShowShare(false)} defaultBuyerId={need?.contactId || ""} />}
      <div className="property-match-grid recommended-grid">
        {recommended.map((item) => {
          const property = propertyMap[item.propertyId];
          if (!property) return <div className="match-empty" key={item.propertyId}>物件已刪除或無法讀取 <button type="button" onClick={() => removeProperty(item.propertyId)}>移除</button></div>;
          return <PropertyMatchCard key={item.propertyId} property={property} match={matchMap[item.propertyId]} selected={selectedIds.has(item.propertyId)} onSelect={selectionMode ? () => toggleSelect(item.propertyId) : null} introduced={item.introduced} onIntroduced={() => toggleIntroduced(item.propertyId)} onRemove={() => removeProperty(item.propertyId)} />;
        })}
      </div>

      {!showPicker ? <button type="button" className="btn ghost" onClick={() => setShowPicker(true)}>＋ 從物件清單挑選</button> : (
        <div className="property-picker-v2">
          <input value={keyword} onChange={(event) => setKeyword(event.target.value)} placeholder="搜尋案名、地址…" autoFocus />
          {filtered.slice(0, 30).map((property) => <button type="button" key={property.id} onClick={() => addProperty(property.id)}><span><strong>{property.title}</strong><small>{property.address}・{property.totalPrice || "—"} 萬</small></span><b>加入</b></button>)}
          <button type="button" className="btn ghost" onClick={() => setShowPicker(false)}>關閉</button>
        </div>
      )}
    </div>
  );
}
