import React, { useMemo, useState } from "react";
import { useCollection } from "../hooks/useCollection";
import { matchPropertiesForNeed } from "../lib/needsMatch";

// value 是推薦物件陣列 [{propertyId, introduced, addedAt}]，onChange 傳回更新後的陣列
// need（選填）是客需表單目前的內容（區域／類型／預算／坪數／房數），有帶入時會自動配對系統建議物件
export default function RecommendedProperties({ value, onChange, need }) {
  const { items: properties } = useCollection("properties", "title");
  const recommended = value || [];
  const recommendedIds = recommended.map((r) => r.propertyId);

  const [showPicker, setShowPicker] = useState(false);
  const [keyword, setKeyword] = useState("");
  const [showAllSuggestions, setShowAllSuggestions] = useState(false);
  const [showPartialSuggestions, setShowPartialSuggestions] = useState(false);
  const [hideSuggestions, setHideSuggestions] = useState(false);

  const propertyMap = {};
  properties.forEach((p) => (propertyMap[p.id] = p));

  const allMatches = useMemo(
    () => matchPropertiesForNeed(need, properties).filter((m) => !recommendedIds.includes(m.property.id)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [need, properties, recommendedIds.join(",")]
  );
  // 完全符合：有填的條件全部都符合，才會直接列出來，避免像只設了「區域」就把整個區域的物件都列出來
  // 部分符合：至少符合一項，但沒有全部符合，收在「還有 N 筆部分符合」裡面，預設收合，需要的時候再展開看
  const exactMatches = allMatches.filter((m) => m.total > 0 && m.score === m.total);
  const partialMatches = allMatches.filter((m) => m.total > 0 && m.score < m.total);
  const visibleSuggestions = showAllSuggestions ? exactMatches : exactMatches.slice(0, 5);
  const visiblePartialSuggestions = partialMatches.slice(0, 5);

  const filtered = properties.filter((p) => {
    if (recommendedIds.includes(p.id)) return false;
    if (!keyword.trim()) return true;
    const k = keyword.trim();
    return (p.title || "").includes(k) || (p.address || "").includes(k);
  });

  const addProperty = (propertyId) => {
    onChange([...recommended, { propertyId, introduced: false, addedAt: new Date().toISOString().slice(0, 10) }]);
  };
  const removeProperty = (propertyId) => {
    onChange(recommended.filter((r) => r.propertyId !== propertyId));
  };
  const toggleIntroduced = (propertyId) => {
    onChange(
      recommended.map((r) => (r.propertyId === propertyId ? { ...r, introduced: !r.introduced } : r))
    );
  };

  const suggestionRow = (p, reasons, { muted = false } = {}) => (
    <div
      key={p.id}
      style={{
        display: "flex",
        justifyContent: "space-between",
        alignItems: "flex-start",
        gap: 10,
        padding: "10px 12px",
        background: "#fff",
        border: "1px solid var(--border)",
        borderRadius: 8,
        marginBottom: 8,
        opacity: muted ? 0.85 : 1,
      }}
    >
      <div style={{ fontSize: 13 }}>
        <div style={{ fontWeight: 700 }}>
          <a
            href={`#/properties?open=${p.id}`}
            target="_blank"
            rel="noopener noreferrer"
            style={{ color: "var(--text)", textDecoration: "none" }}
            title="在新分頁開啟物件詳情，方便傳給客戶"
          >
            {p.title} 🔗
          </a>{" "}
          <span className="tag">{p.category}</span>
        </div>
        <div style={{ color: "var(--muted)", fontSize: 12, marginTop: 2 }}>
          {p.address}
          {p.layout && <>{p.layout}　</>}
          {p.titlePing && <>{p.titlePing} 坪　</>}
          {p.totalPrice && <>總價 {p.totalPrice} 萬</>}
        </div>
        {reasons.length > 0 && (
          <div style={{ marginTop: 4 }}>
            {reasons.map((r) => (
              <span key={r} style={{ fontSize: 10, color: "var(--accent)", background: "var(--accent-soft)", border: "1px solid var(--accent)", borderRadius: 8, padding: "1px 7px", marginRight: 4 }}>
                {r}
              </span>
            ))}
          </div>
        )}
      </div>
      <button type="button" className="btn ghost" style={{ flexShrink: 0, fontSize: 12 }} onClick={() => addProperty(p.id)}>
        ＋ 加入推薦
      </button>
    </div>
  );

  return (
    <div>
      {allMatches.length > 0 && (
        <div style={{ background: "var(--accent-soft)", border: "1px solid var(--accent)", borderRadius: 10, padding: 12, marginBottom: 14 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: hideSuggestions ? 0 : 8 }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: "var(--accent)" }}>
              系統配對建議（{exactMatches.length}）
            </div>
            <button
              type="button"
              onClick={() => setHideSuggestions((v) => !v)}
              style={{ border: "none", background: "none", color: "var(--accent)", cursor: "pointer", fontSize: 12, fontWeight: 700 }}
            >
              {hideSuggestions ? "顯示" : "隱藏"}
            </button>
          </div>

          {!hideSuggestions && (
            <>
              {exactMatches.length === 0 && (
                <div style={{ fontSize: 12, color: "var(--muted)", marginBottom: 8 }}>
                  沒有完全符合所有條件的物件，可以展開下面部分符合的物件參考看看。
                </div>
              )}
              {visibleSuggestions.map(({ property: p, reasons }) => suggestionRow(p, reasons))}
              {exactMatches.length > visibleSuggestions.length && (
                <button type="button" className="btn ghost" style={{ fontSize: 12 }} onClick={() => setShowAllSuggestions(true)}>
                  顯示全部 {exactMatches.length} 筆完全符合
                </button>
              )}

              {partialMatches.length > 0 && (
                <div style={{ marginTop: exactMatches.length > 0 ? 10 : 0 }}>
                  <button
                    type="button"
                    className="btn ghost"
                    style={{ fontSize: 12 }}
                    onClick={() => setShowPartialSuggestions((v) => !v)}
                  >
                    {showPartialSuggestions ? "收合部分符合的物件" : `還有 ${partialMatches.length} 筆部分符合（少一兩個條件）`}
                  </button>
                  {showPartialSuggestions && (
                    <div style={{ marginTop: 8 }}>
                      {visiblePartialSuggestions.map(({ property: p, reasons }) => suggestionRow(p, reasons, { muted: true }))}
                      {partialMatches.length > visiblePartialSuggestions.length && (
                        <div style={{ fontSize: 11, color: "var(--muted)" }}>
                          還有 {partialMatches.length - visiblePartialSuggestions.length} 筆部分符合的物件沒有列出，可以用下面「從物件清單挑選」搜尋。
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}
            </>
          )}
        </div>
      )}

      <div style={{ fontSize: 11, fontWeight: 700, color: "var(--muted)", marginBottom: 8 }}>
        推薦物件（{recommended.length}）
      </div>

      {recommended.length === 0 && (
        <div style={{ fontSize: 13, color: "var(--muted)", marginBottom: 10 }}>還沒有推薦任何物件</div>
      )}

      {recommended.map((r) => {
        const p = propertyMap[r.propertyId];
        if (!p) {
          return (
            <div key={r.propertyId} style={{ padding: "8px 10px", background: "#FAFAF8", border: "1px solid var(--border)", borderRadius: 8, marginBottom: 8, fontSize: 12, color: "var(--muted)" }}>
              （物件已被刪除或找不到）
              <button type="button" onClick={() => removeProperty(r.propertyId)} style={{ marginLeft: 10, border: "none", background: "none", color: "var(--danger)", cursor: "pointer" }}>移除</button>
            </div>
          );
        }
        return (
          <div
            key={r.propertyId}
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "flex-start",
              gap: 10,
              padding: "10px 12px",
              background: r.introduced ? "var(--accent-soft)" : "#FAFAF8",
              border: "1px solid var(--border)",
              borderRadius: 8,
              marginBottom: 8,
            }}
          >
            <div style={{ fontSize: 13 }}>
              <div style={{ fontWeight: 700 }}>
                <a
                  href={`#/properties?open=${p.id}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{ color: "var(--text)", textDecoration: "none" }}
                  title="在新分頁開啟物件詳情，方便傳給客戶"
                >
                  {p.title} 🔗
                </a>{" "}
                <span className="tag">{p.category}</span>
                {(p.status || "active") !== "active" && (
                  <span style={{ fontSize: 11, color: "var(--danger)", marginLeft: 6 }}>
                    （{p.status === "sold" ? "已售出" : "暫時不賣"}）
                  </span>
                )}
              </div>
              <div style={{ color: "var(--muted)", fontSize: 12, marginTop: 2 }}>
                {p.address}　
                {p.layout && <>{p.layout}　</>}
                {p.titlePing && <>{p.titlePing} 坪　</>}
                {p.totalPrice && <>總價 {p.totalPrice} 萬</>}
              </div>
            </div>
            <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 6, flexShrink: 0 }}>
              <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, cursor: "pointer", whiteSpace: "nowrap" }}>
                <input type="checkbox" checked={!!r.introduced} onChange={() => toggleIntroduced(r.propertyId)} />
                已介紹
              </label>
              <button type="button" onClick={() => removeProperty(r.propertyId)} style={{ border: "none", background: "none", color: "var(--muted)", cursor: "pointer", fontSize: 11 }}>移除</button>
            </div>
          </div>
        );
      })}

      {!showPicker ? (
        <button type="button" className="btn ghost" onClick={() => setShowPicker(true)}>
          ＋ 從物件清單挑選
        </button>
      ) : (
        <div style={{ border: "1px solid var(--border)", borderRadius: 8, padding: 10, marginTop: 6 }}>
          <input
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
            placeholder="搜尋案名、地址…"
            style={{ width: "100%", padding: "8px 10px", border: "1px solid var(--border)", borderRadius: 7, fontSize: 13, marginBottom: 8 }}
            autoFocus
          />
          <div style={{ maxHeight: 260, overflowY: "auto" }}>
            {filtered.length === 0 && <div style={{ fontSize: 12, color: "var(--muted)" }}>找不到符合的物件</div>}
            {filtered.slice(0, 30).map((p) => (
              <div
                key={p.id}
                style={{ padding: "8px 6px", borderBottom: "1px solid var(--border)", fontSize: 13, display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8 }}
              >
                <div style={{ cursor: "pointer", flex: 1 }} onClick={() => addProperty(p.id)}>
                  <div style={{ fontWeight: 700 }}>{p.title} <span className="tag">{p.category}</span></div>
                  <div style={{ color: "var(--muted)", fontSize: 12 }}>
                    {p.address}　{p.layout && <>{p.layout}　</>}{p.totalPrice && <>總價 {p.totalPrice} 萬</>}
                  </div>
                </div>
                <a
                  href={`#/properties?open=${p.id}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{ flexShrink: 0, fontSize: 12, color: "var(--accent)" }}
                  title="在新分頁開啟物件詳情"
                  onClick={(e) => e.stopPropagation()}
                >
                  查看詳情 🔗
                </a>
              </div>
            ))}
          </div>
          <button type="button" className="btn ghost" style={{ marginTop: 8 }} onClick={() => setShowPicker(false)}>
            關閉
          </button>
        </div>
      )}
    </div>
  );
}
