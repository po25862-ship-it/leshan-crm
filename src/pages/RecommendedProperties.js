import React, { useMemo, useState } from "react";
import { Image as ImageIcon, Check, X, ExternalLink, RotateCcw } from "lucide-react";
import { useCollection } from "../hooks/useCollection";
import { matchPropertiesForNeed } from "../lib/needsMatch";
import { getPropertyImage, propertyParkingText } from "../lib/propertyPresentation";
import PropertyShare from "./PropertyShare";
import { getRecommendationStatus, isActiveRecommendation, RECOMMENDATION_STATUS_LABELS } from "../lib/recommendationStatus";

function MatchBadge({ percent }) {
  const value = Number.isFinite(percent) ? percent : null;
  return <span className={`match-badge ${value >= 90 ? "excellent" : value >= 80 ? "good" : "neutral"}`}>{value === null ? "手動" : `${value}%`}</span>;
}

function PropertyMatchCard({ property, match, action, selected, onSelect, status, onStatus, onRemove }) {
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
        <div className="property-address">{[property.communityName, property.area, property.address].filter(Boolean).join("・") || "位置未填"}</div>
        {match && (
          <div className="match-reasons">
            {match.reasons.slice(0, 4).map((reason) => <span className="hit" key={reason}><Check size={12} />{reason}</span>)}
            {match.missedReasons.slice(0, 3).map((reason) => <span className="miss" key={reason}><X size={12} />{reason}</span>)}
          </div>
        )}
        <div className="property-match-actions">
          {action}
          {onStatus && <label className="recommendation-status-control"><span>客戶反應</span><select value={status} onChange={(event) => onStatus(event.target.value)} aria-label={`${property.title} 客戶反應`}>{Object.entries(RECOMMENDATION_STATUS_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>}
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
  const [showHistory, setShowHistory] = useState(false);

  const propertyMap = useMemo(() => Object.fromEntries(properties.map((property) => [property.id, property])), [properties]);
  const matches = useMemo(() => matchPropertiesForNeed(need, properties), [need, properties]);
  const matchMap = useMemo(() => Object.fromEntries(matches.map((match) => [match.property.id, match])), [matches]);
  const suggestions = matches.filter((match) => !recommendedIds.includes(match.property.id));
  const strongSuggestions = suggestions.filter((match) => match.percent >= 80);
  const visibleSuggestions = showAll ? strongSuggestions : strongSuggestions.slice(0, 6);

  const activeRecommendations = recommended.filter(isActiveRecommendation);
  const recommendationHistory = recommended.filter((item) => !isActiveRecommendation(item));

  const addProperty = (propertyId) => onChange([...recommended, { propertyId, status: "pending", introduced: false, addedAt: new Date().toISOString().slice(0, 10) }]);
  const removeProperty = (propertyId) => onChange(recommended.filter((item) => item.propertyId !== propertyId));
  const updateStatus = (propertyId, status) => onChange(recommended.map((item) => item.propertyId === propertyId ? { ...item, status, introduced: status === "introduced", statusUpdatedAt: new Date().toISOString() } : item));
  const toggleSelect = (propertyId) => setSelectedIds((current) => {
    const next = new Set(current);
    if (next.has(propertyId)) next.delete(propertyId); else next.add(propertyId);
    return next;
  });
  const filtered = properties.filter((property) => !recommendedIds.includes(property.id) && (!keyword.trim() || `${property.title} ${property.communityName || ""} ${property.area || ""} ${property.address || ""}`.includes(keyword.trim())));

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
        <div><strong>待處理推薦</strong><span>{activeRecommendations.length} 筆</span></div>
        {activeRecommendations.length > 0 && <button type="button" className={selectionMode ? "btn" : "btn ghost"} onClick={() => { setSelectionMode((current) => !current); setSelectedIds(new Set()); setShowShare(false); }}>{selectionMode ? "結束勾選" : "勾選傳送"}</button>}
      </div>
      {selectedIds.size > 0 && <div className="share-selection-bar"><strong>已選 {selectedIds.size} 筆</strong><button type="button" className="btn" onClick={() => setShowShare(true)}>分享給客人</button><button type="button" className="btn ghost" onClick={() => setSelectedIds(new Set())}>清除</button></div>}
      {showShare && <PropertyShare properties={recommended.map((item) => propertyMap[item.propertyId]).filter((property) => property && selectedIds.has(property.id))} onClose={() => setShowShare(false)} defaultBuyerId={need?.contactId || ""} />}
      <div className="property-match-grid recommended-grid">
        {activeRecommendations.map((item) => {
          const property = propertyMap[item.propertyId];
          if (!property) return <div className="match-empty" key={item.propertyId}>物件已刪除或無法讀取 <button type="button" onClick={() => removeProperty(item.propertyId)}>移除</button></div>;
          return <PropertyMatchCard key={item.propertyId} property={property} match={matchMap[item.propertyId]} selected={selectedIds.has(item.propertyId)} onSelect={selectionMode ? () => toggleSelect(item.propertyId) : null} status={getRecommendationStatus(item)} onStatus={(status) => updateStatus(item.propertyId, status)} onRemove={() => removeProperty(item.propertyId)} />;
        })}
      </div>
      {activeRecommendations.length === 0 && <div className="match-empty">目前沒有待處理推薦。已介紹與沒興趣的物件會保留在下方歷程，不會重新冒出。</div>}

      {recommendationHistory.length > 0 && <div className="recommendation-history">
        <button type="button" className="recommendation-history-toggle" onClick={() => setShowHistory((current) => !current)}><span><strong>介紹／客戶反應歷程</strong><small>{recommendationHistory.length} 筆（沒興趣的物件不再重複推薦）</small></span><b>{showHistory ? "收合" : "查看"}</b></button>
        {showHistory && <div className="property-match-grid recommended-grid">{recommendationHistory.map((item) => {
          const property = propertyMap[item.propertyId];
          if (!property) return null;
          const status = getRecommendationStatus(item);
          return <PropertyMatchCard key={item.propertyId} property={property} match={matchMap[item.propertyId]} status={status} onStatus={(nextStatus) => updateStatus(item.propertyId, nextStatus)} action={<span className={`recommendation-state ${status}`}>{RECOMMENDATION_STATUS_LABELS[status]}</span>} />;
        })}</div>}
        {showHistory && <p className="recommendation-history-help"><RotateCcw size={13} /> 要重新推薦時，將客戶反應改回「待介紹」即可。</p>}
      </div>}

      {!showPicker ? <button type="button" className="btn ghost" onClick={() => setShowPicker(true)}>＋ 從物件清單挑選</button> : (
        <div className="property-picker-v2">
          <input value={keyword} onChange={(event) => setKeyword(event.target.value)} placeholder="搜尋案名、社區、商圈、地址…" autoFocus />
          {filtered.slice(0, 30).map((property) => <button type="button" key={property.id} onClick={() => addProperty(property.id)}><span><strong>{property.title}</strong><small>{[property.communityName, property.area, property.address].filter(Boolean).join("・") || "位置未填"}・{property.totalPrice || "—"} 萬</small></span><b>加入</b></button>)}
          <button type="button" className="btn ghost" onClick={() => setShowPicker(false)}>關閉</button>
        </div>
      )}
    </div>
  );
}
