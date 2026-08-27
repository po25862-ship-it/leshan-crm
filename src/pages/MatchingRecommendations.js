import React, { useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { Check, X, Image as ImageIcon, TrendingDown, PhoneCall } from "lucide-react";
import { useAuth } from "../AuthContext";
import { useNeedsCollection } from "../hooks/useNeedsCollection";
import { useCollection } from "../hooks/useCollection";
import { matchPropertiesForNeed } from "../lib/needsMatch";
import { getPropertyImage, getRecentPriceDrop, propertyParkingText } from "../lib/propertyPresentation";

export default function MatchingRecommendations() {
  const { user } = useAuth();
  const { items: needs } = useNeedsCollection(user.uid);
  const { items: properties } = useCollection("properties", "createdAt");
  const [searchParams] = useSearchParams();
  const isRepriced = searchParams.get("mode") === "repriced";
  const [threshold, setThreshold] = useState(isRepriced ? 70 : 80);

  const activeNeeds = useMemo(() => needs.filter((need) => (need.statusTag || "正在找") === "正在找"), [needs]);
  const activeProperties = useMemo(() => properties.filter((property) => (property.status || "active") === "active"), [properties]);
  const repricedProperties = useMemo(() => activeProperties
    .map((property) => ({ property, drop: getRecentPriceDrop(property) }))
    .filter((item) => item.drop)
    .sort((a, b) => String(b.drop.date).localeCompare(String(a.drop.date))), [activeProperties]);
  const repricedIds = useMemo(() => new Set(repricedProperties.map((item) => item.property.id)), [repricedProperties]);

  const matches = useMemo(() => activeNeeds
    .flatMap((need) => matchPropertiesForNeed(need, activeProperties).map((match) => ({ ...match, need })))
    .filter((match) => match.percent >= threshold && (!isRepriced || repricedIds.has(match.property.id)))
    .sort((a, b) => b.percent - a.percent), [activeNeeds, activeProperties, threshold, isRepriced, repricedIds]);

  const repricedGroups = useMemo(() => repricedProperties.map(({ property, drop }) => ({
    property,
    drop,
    matches: matches.filter((match) => match.property.id === property.id).slice(0, 5),
  })).sort((a, b) => (b.matches[0]?.percent || 0) - (a.matches[0]?.percent || 0)), [repricedProperties, matches]);

  return <main className="matching-page">
    <div className="matching-page-head"><div><div className="eyebrow">MATCHING ENGINE V2</div><h2>{isRepriced ? "降價重配工作台" : "配對推薦"}</h2><p>{isRepriced ? "價格下降後自動重新計算所有進行中的客需，優先找出值得再次聯絡的買方。" : "同時檢視所有買方客需，依加權百分比找出最接近成交的組合。"}</p></div><label>最低配對<select value={threshold} onChange={(event) => setThreshold(Number(event.target.value))}><option value={90}>90%+</option><option value={80}>80%+</option><option value={70}>70%+</option></select></label></div>
    <nav className="matching-mode-tabs" aria-label="配對模式"><Link className={!isRepriced ? "active" : ""} to="/matching">全部推薦</Link><Link className={isRepriced ? "active" : ""} to="/matching?mode=repriced"><TrendingDown size={14} />降價重配</Link></nav>
    <div className="matching-summary"><strong>{isRepriced ? repricedProperties.length : matches.length}</strong><span>{isRepriced ? "筆近 14 天降價案件" : "組符合門檻"}</span><b>{new Set(matches.map((match) => match.need.contactId).filter(Boolean)).size}</b><span>位可聯絡買方</span></div>

    {isRepriced ? <div className="reprice-list">
      {repricedGroups.map(({ property, drop, matches: propertyMatches }) => {
        const image = getPropertyImage(property);
        return <article className="reprice-card" key={property.id}>
          <div className="reprice-property">
            <div className="reprice-image">{image ? <img src={image} alt={`${property.title} 物件照片`} /> : <span><ImageIcon size={24} />尚未上傳案件照片</span>}<b><TrendingDown size={13} />降 {drop.percent}%</b></div>
            <div className="reprice-copy"><small>{drop.date || "近期調價"}</small><h3>{property.title}</h3><div className="reprice-prices"><del>{drop.oldPrice.toLocaleString()} 萬</del><strong>{drop.newPrice.toLocaleString()} 萬</strong><span>現省 {drop.amount.toLocaleString()} 萬</span></div><p>{property.titlePing || property.mainBuildingPing || "—"} 坪・{property.layout || "格局未填"}・{property.floor || "樓層未填"}</p><Link className="btn ghost" to={`/properties?open=${property.id}`}>查看物件</Link></div>
          </div>
          <div className="reprice-buyers"><div className="reprice-buyers-head"><div><span>RE-MATCHED BUYERS</span><h4>建議重新聯絡</h4></div><strong>{propertyMatches.length} 位</strong></div>
            {propertyMatches.length ? propertyMatches.map((match) => <div className="reprice-buyer-row" key={`${match.need.id}-${property.id}`}>
              <span className="buyer-avatar">{(match.need.contactName || "客").slice(0, 1)}</span>
              <div><strong>{match.need.contactName || "未指定買方"}</strong><small>{match.need.title}</small><p>{[...match.reasons.slice(0, 2), ...match.missedReasons.slice(0, 1)].join("・")}</p></div>
              <b>{match.percent}%</b>
              <div className="reprice-row-actions">{match.need.contactId && <Link title="重新聯絡買方" to={`/buyers?open=${match.need.contactId}`}><PhoneCall size={14} /></Link>}<Link to={`/needs?open=${match.need.id}`}>客需</Link></div>
            </div>) : <div className="workbench-empty">目前沒有達到 {threshold}% 的客需；可降低門檻或補齊客需條件。</div>}
          </div>
        </article>;
      })}
      {repricedGroups.length === 0 && <div className="workbench-empty">近 14 天沒有有效的降價案件。</div>}
    </div> : <div className="matching-page-grid">
      {matches.map((match) => {
        const image = getPropertyImage(match.property);
        return <article className="matching-page-card" key={`${match.need.id}-${match.property.id}`}>
          <div className="matching-page-image">{image ? <img src={image} alt={`${match.property.title} 物件照片`} /> : <span><ImageIcon size={26} />尚未上傳案件照片</span>}<b>{match.percent}%</b></div>
          <div className="matching-page-copy"><small>{match.need.contactName || "未指定買方"}・{match.need.title}</small><h3>{match.property.title}</h3><div className="property-price">{match.property.totalPrice ? Number(match.property.totalPrice).toLocaleString() : "—"}<small> 萬</small></div><p>{match.property.titlePing || match.property.mainBuildingPing || "—"} 坪・{match.property.layout || "格局未填"}・{match.property.floor || "樓層未填"}・{propertyParkingText(match.property)}</p><div className="match-reasons">{match.reasons.slice(0, 4).map((reason) => <span className="hit" key={reason}><Check size={12} />{reason}</span>)}{match.missedReasons.slice(0, 2).map((reason) => <span className="miss" key={reason}><X size={12} />{reason}</span>)}</div><div className="matching-page-actions"><Link className="btn" to={`/needs?open=${match.need.id}`}>查看客需</Link><Link className="btn ghost" to={`/properties?open=${match.property.id}`}>查看物件</Link></div></div>
        </article>;
      })}
      {matches.length === 0 && <div className="workbench-empty">目前沒有符合門檻的配對，請補齊客需條件或調整最低配對百分比。</div>}
    </div>}
  </main>;
}
