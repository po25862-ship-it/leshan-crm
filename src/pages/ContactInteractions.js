import React, { useState } from "react";
import { useCollection } from "../hooks/useCollection";
import { formatDate, todayStr } from "../lib/dates";
import { useGoogleAuth } from "../GoogleAuthContext";

const emptyPropertyRow = "";

// 把文字裡的網址自動變成可點擊連結
function linkify(text) {
  if (!text) return null;
  const parts = text.split(/(https?:\/\/[^\s]+)/g);
  return parts.map((part, i) =>
    /^https?:\/\//.test(part) ? (
      <a key={i} href={part} target="_blank" rel="noreferrer">
        {part}
      </a>
    ) : (
      <React.Fragment key={i}>{part}</React.Fragment>
    )
  );
}

export default function ContactInteractions({ contactId, contactName, onLogged }) {
  const { isConnected, createEvent } = useGoogleAuth();
  const { items: interactions, add, remove } = useCollection(
    `contacts/${contactId}/interactions`,
    "date"
  );
  const { items: properties } = useCollection("properties", "title");

  const [date, setDate] = useState(todayStr());
  const [propertyInputs, setPropertyInputs] = useState([emptyPropertyRow]);
  const [feedback, setFeedback] = useState("");
  const [communication, setCommunication] = useState("");
  const [syncToCalendar, setSyncToCalendar] = useState(false);

  const sorted = [...interactions].sort((a, b) => (a.date < b.date ? 1 : -1));

  const updatePropertyRow = (idx, val) => {
    const next = [...propertyInputs];
    next[idx] = val;
    setPropertyInputs(next);
  };
  const addPropertyRow = () => setPropertyInputs([...propertyInputs, emptyPropertyRow]);
  const removePropertyRow = (idx) =>
    setPropertyInputs(propertyInputs.filter((_, i) => i !== idx));

  const resolveProperties = () =>
    propertyInputs
      .map((label) => label.trim())
      .filter(Boolean)
      .map((label) => {
        const match = properties.find((p) => p.title === label);
        return { label, propertyId: match ? match.id : null };
      });

  const onSubmit = async (e) => {
    e.preventDefault();
    if (!feedback.trim() && !communication.trim() && resolveProperties().length === 0) return;

    const docData = {
      date,
      properties: resolveProperties(),
      feedback,
      communication,
      googleEventId: null,
      googleEventLink: null,
    };

    if (syncToCalendar && isConnected) {
      try {
        const created = await createEvent({
          title: `互動紀錄・${contactName || ""}`,
          date,
          notes: [communication, feedback].filter(Boolean).join(" / "),
        });
        docData.googleEventId = created.id;
        docData.googleEventLink = created.htmlLink;
      } catch (err) {
        console.error("Google 行事曆同步失敗", err);
      }
    }

    await add(docData);

    if (onLogged) onLogged();

    setPropertyInputs([emptyPropertyRow]);
    setFeedback("");
    setCommunication("");
    setSyncToCalendar(false);
  };

  return (
    <div>
      <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 10 }}>互動紀錄</div>

      <datalist id="property-options">
        {properties.map((p) => (
          <option key={p.id} value={p.title} />
        ))}
      </datalist>

      <form onSubmit={onSubmit} style={{ marginBottom: 18 }}>
        <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            style={{
              width: 150,
              padding: "9px 10px",
              border: "1px solid var(--border)",
              borderRadius: 7,
              fontSize: 13,
            }}
          />
        </div>

        <div style={{ fontSize: 11, fontWeight: 700, color: "var(--muted)", marginBottom: 6 }}>
          看過的物件（可從清單選，也可直接打新的地址／名稱）
        </div>
        {propertyInputs.map((val, idx) => (
          <div key={idx} style={{ display: "flex", gap: 8, marginBottom: 6 }}>
            <input
              list="property-options"
              value={val}
              onChange={(e) => updatePropertyRow(idx, e.target.value)}
              placeholder="例如：A7 重劃區 OO 社區 3F"
              style={{
                flex: 1,
                padding: "9px 10px",
                border: "1px solid var(--border)",
                borderRadius: 7,
                fontSize: 13,
              }}
            />
            {propertyInputs.length > 1 && (
              <button type="button" className="btn ghost" onClick={() => removePropertyRow(idx)}>
                刪除
              </button>
            )}
          </div>
        ))}
        <button type="button" className="btn ghost" onClick={addPropertyRow} style={{ marginBottom: 12 }}>
          ＋ 再加一間
        </button>

        <div style={{ marginBottom: 8 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: "var(--muted)", marginBottom: 6 }}>
            客戶回饋
          </div>
          <textarea
            rows="2"
            value={feedback}
            onChange={(e) => setFeedback(e.target.value)}
            placeholder="客戶對這些物件的反應、喜好、疑慮…"
            style={{
              width: "100%",
              padding: "9px 10px",
              border: "1px solid var(--border)",
              borderRadius: 7,
              fontSize: 13,
              fontFamily: "inherit",
            }}
          />
        </div>

        <div style={{ marginBottom: 12 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: "var(--muted)", marginBottom: 6 }}>
            這次溝通內容
          </div>
          <textarea
            rows="2"
            value={communication}
            onChange={(e) => setCommunication(e.target.value)}
            placeholder="這次聊了什麼、下一步約定…"
            style={{
              width: "100%",
              padding: "9px 10px",
              border: "1px solid var(--border)",
              borderRadius: 7,
              fontSize: 13,
              fontFamily: "inherit",
            }}
          />
        </div>

        {isConnected && (
          <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12, marginBottom: 12, cursor: "pointer" }}>
            <input type="checkbox" checked={syncToCalendar} onChange={(e) => setSyncToCalendar(e.target.checked)} />
            同步到 Google 行事曆
          </label>
        )}

        <button className="btn" type="submit">
          新增互動紀錄
        </button>
      </form>

      {sorted.length === 0 && (
        <div style={{ fontSize: 13, color: "var(--muted)" }}>還沒有互動紀錄</div>
      )}
      {sorted.map((log) => (
        <div
          key={log.id}
          style={{ padding: "12px 0", borderBottom: "1px solid var(--border)", fontSize: 13 }}
        >
          <div style={{ display: "flex", justifyContent: "space-between" }}>
            <span className="mono" style={{ fontSize: 12, color: "var(--muted)" }}>
              {formatDate(log.date)}
            </span>
            <button
              onClick={() => remove(log.id)}
              style={{ border: "none", background: "none", color: "var(--muted)", cursor: "pointer", fontSize: 12 }}
            >
              刪除
            </button>
          </div>
          {log.googleEventLink && (
            <div style={{ marginTop: 4 }}>
              <a href={log.googleEventLink} target="_blank" rel="noreferrer" style={{ fontSize: 11 }}>📅 在行事曆開啟</a>
            </div>
          )}
          {(log.properties || []).length > 0 && (
            <div style={{ marginTop: 4 }}>
              {log.properties.map((p, i) => (
                <span key={i} className="tag" style={{ background: p.propertyId ? "var(--accent-soft)" : "#F3EFE6", color: p.propertyId ? "var(--accent)" : "var(--brass)" }}>
                  {p.label}
                </span>
              ))}
            </div>
          )}
          {log.feedback && (
            <div style={{ marginTop: 6 }}>
              <span style={{ fontWeight: 700 }}>回饋：</span>
              {linkify(log.feedback)}
            </div>
          )}
          {log.communication && (
            <div style={{ marginTop: 4 }}>
              <span style={{ fontWeight: 700 }}>溝通：</span>
              {linkify(log.communication)}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
