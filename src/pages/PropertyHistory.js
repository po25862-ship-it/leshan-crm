import React from "react";
import { useCollection } from "../hooks/useCollection";
import { formatDate } from "../lib/dates";

const STATUS_LABELS = { active: "在售", onHold: "暫時不賣", sold: "已售出" };

function formatTimestamp(ts) {
  if (!ts) return null;
  try {
    const d = ts.toDate ? ts.toDate() : new Date(ts);
    return d.toLocaleDateString("zh-TW");
  } catch {
    return null;
  }
}

export default function PropertyHistory({ propertyId, createdAt }) {
  const { items: statusLogs } = useCollection(`properties/${propertyId}/statusLogs`, "date");
  const { items: priceLogs } = useCollection(`properties/${propertyId}/priceLogs`, "date");

  const sortedStatus = [...statusLogs].sort((a, b) => (a.date < b.date ? 1 : -1));
  const sortedPrice = [...priceLogs].sort((a, b) => (a.date < b.date ? 1 : -1));
  const createdLabel = formatTimestamp(createdAt);

  return (
    <div>
      {createdLabel && (
        <div style={{ fontSize: 13, color: "var(--muted)", marginBottom: 16 }}>
          建檔日期：<span className="mono">{createdLabel}</span>
        </div>
      )}

      <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 10 }}>狀態歷史</div>
      {sortedStatus.length === 0 && (
        <div style={{ fontSize: 12, color: "var(--muted)", marginBottom: 18 }}>尚無紀錄</div>
      )}
      {sortedStatus.map((l) => (
        <div
          key={l.id}
          style={{ fontSize: 13, padding: "8px 0", borderBottom: "1px solid var(--border)" }}
        >
          <span className="mono" style={{ color: "var(--muted)" }}>{formatDate(l.date)}</span>
          {"　"}
          {STATUS_LABELS[l.status] || l.status}
        </div>
      ))}

      <div style={{ fontSize: 13, fontWeight: 700, margin: "18px 0 10px" }}>價格調整紀錄</div>
      {sortedPrice.length === 0 && (
        <div style={{ fontSize: 12, color: "var(--muted)" }}>尚無調整紀錄</div>
      )}
      {sortedPrice.map((l) => (
        <div
          key={l.id}
          style={{ fontSize: 13, padding: "8px 0", borderBottom: "1px solid var(--border)" }}
        >
          <span className="mono" style={{ color: "var(--muted)" }}>{formatDate(l.date)}</span>
          {"　"}
          {l.oldPrice} 萬 → <strong>{l.newPrice} 萬</strong>
        </div>
      ))}
    </div>
  );
}
