import React, { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Check, X } from "lucide-react";
import { reverseMatchProperty } from "../lib/needsMatch";

export default function ReverseMatchesPanel({ property, needs, updateNeed }) {
  const [savingId, setSavingId] = useState("");
  const matches = useMemo(() => reverseMatchProperty(property, needs.filter((need) => (need.statusTag || "正在找") === "正在找")), [property, needs]);
  const addToRecommendations = async (match) => {
    const existing = match.need.recommendedProperties || [];
    if (existing.some((item) => item.propertyId === property.id)) return;
    setSavingId(match.need.id);
    await updateNeed(match.need.id, { recommendedProperties: [...existing, { propertyId: property.id, status: "pending", introduced: false, addedAt: new Date().toISOString().slice(0, 10) }] });
    setSavingId("");
  };
  return <div className="panel reverse-match-panel">
    <div className="reverse-match-head"><div><span>REVERSE MATCH</span><h3>最符合的買方／客需</h3></div><strong>{matches.filter((match) => match.percent >= 80).length}</strong></div>
    {matches.slice(0, 8).map((match, index) => {
      const added = (match.need.recommendedProperties || []).some((item) => item.propertyId === property.id);
      return <div className="reverse-match-row" key={match.need.id}><span className="reverse-rank">{index + 1}</span><div className="reverse-match-copy"><strong>{match.need.contactName || "未指定買方"}<b>{match.percent}%</b></strong><Link to={`/needs?open=${match.need.id}`}>{match.need.title}</Link><div>{match.reasons.slice(0, 3).map((reason) => <span className="hit" key={reason}><Check size={11} />{reason}</span>)}{match.missedReasons.slice(0, 1).map((reason) => <span className="miss" key={reason}><X size={11} />{reason}</span>)}</div></div><button type="button" className={added ? "btn ghost" : "btn"} disabled={added || savingId === match.need.id} onClick={() => addToRecommendations(match)}>{added ? "已加入" : savingId === match.need.id ? "加入中" : "加入推薦"}</button></div>;
    })}
    {matches.length === 0 && <div className="workbench-empty">目前沒有符合必要條件的買方客需。</div>}
  </div>;
}
