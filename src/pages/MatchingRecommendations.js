import React, { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Check, X, Image as ImageIcon } from "lucide-react";
import { useAuth } from "../AuthContext";
import { useNeedsCollection } from "../hooks/useNeedsCollection";
import { useCollection } from "../hooks/useCollection";
import { matchPropertiesForNeed } from "../lib/needsMatch";
import { getPropertyImage, propertyParkingText } from "../lib/propertyPresentation";

export default function MatchingRecommendations() {
  const { user } = useAuth();
  const { items: needs } = useNeedsCollection(user.uid);
  const { items: properties } = useCollection("properties", "createdAt");
  const [threshold, setThreshold] = useState(80);
  const matches = useMemo(() => needs.filter((need) => (need.statusTag || "正在找") === "正在找")
    .flatMap((need) => matchPropertiesForNeed(need, properties).map((match) => ({ ...match, need })))
    .filter((match) => match.percent >= threshold)
    .sort((a, b) => b.percent - a.percent), [needs, properties, threshold]);

  return <main className="matching-page">
    <div className="matching-page-head"><div><div className="eyebrow">MATCHING ENGINE V2</div><h2>配對推薦</h2><p>同時檢視所有買方客需，依加權百分比找出最接近成交的組合。</p></div><label>最低配對<select value={threshold} onChange={(event) => setThreshold(Number(event.target.value))}><option value={90}>90%+</option><option value={80}>80%+</option><option value={70}>70%+</option></select></label></div>
    <div className="matching-summary"><strong>{matches.length}</strong><span>組符合門檻</span><b>{new Set(matches.map((match) => match.need.contactId).filter(Boolean)).size}</b><span>位買方</span></div>
    <div className="matching-page-grid">
      {matches.map((match) => {
        const image = getPropertyImage(match.property);
        return <article className="matching-page-card" key={`${match.need.id}-${match.property.id}`}>
          <div className="matching-page-image">{image ? <img src={image} alt={`${match.property.title} 物件照片`} /> : <span><ImageIcon size={26} />尚未上傳案件照片</span>}<b>{match.percent}%</b></div>
          <div className="matching-page-copy"><small>{match.need.contactName || "未指定買方"}・{match.need.title}</small><h3>{match.property.title}</h3><div className="property-price">{match.property.totalPrice ? Number(match.property.totalPrice).toLocaleString() : "—"}<small> 萬</small></div><p>{match.property.titlePing || match.property.mainBuildingPing || "—"} 坪・{match.property.layout || "格局未填"}・{match.property.floor || "樓層未填"}・{propertyParkingText(match.property)}</p><div className="match-reasons">{match.reasons.slice(0, 4).map((reason) => <span className="hit" key={reason}><Check size={12} />{reason}</span>)}{match.missedReasons.slice(0, 2).map((reason) => <span className="miss" key={reason}><X size={12} />{reason}</span>)}</div><div className="matching-page-actions"><Link className="btn" to={`/needs?open=${match.need.id}`}>查看客需</Link><Link className="btn ghost" to={`/properties?open=${match.property.id}`}>查看物件</Link></div></div>
        </article>;
      })}
      {matches.length === 0 && <div className="workbench-empty">目前沒有符合門檻的配對，請補齊客需條件或調整最低配對百分比。</div>}
    </div>
  </main>;
}
