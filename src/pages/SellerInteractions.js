import React, { useState } from "react";
import { useCollection } from "../hooks/useCollection";
import { formatDate, todayStr } from "../lib/dates";
import { useGoogleAuth } from "../GoogleAuthContext";

// 把文字裡的網址自動變成可點擊連結
function linkify(text) {
  if (!text) return null;
  const parts = text.split(/(https?:\/\/[^\s]+)/g);
  return parts.map((part, i) =>
    /^https?:\/\//.test(part) ? (
      <a key={i} href={part} target="_blank" rel="noreferrer">{part}</a>
    ) : (
      <React.Fragment key={i}>{part}</React.Fragment>
    )
  );
}

export default function SellerInteractions({ contactId, listingId, listingTitle, onLogged }) {
  const { isConnected, createEvent } = useGoogleAuth();
  const { items: interactions, add, remove } = useCollection(
    `contacts/${contactId}/listings/${listingId}/interactions`,
    "date"
  );

  const [date, setDate] = useState(todayStr());
  const [customerBackground, setCustomerBackground] = useState("");
  const [agentName, setAgentName] = useState("");
  const [feedback, setFeedback] = useState("");
  const [communication, setCommunication] = useState("");
  const [syncToCalendar, setSyncToCalendar] = useState(false);

  const sorted = [...interactions].sort((a, b) => (a.date < b.date ? 1 : -1));

  const onSubmit = async (e) => {
    e.preventDefault();
    if (!customerBackground.trim() && !agentName.trim() && !feedback.trim() && !communication.trim()) return;

    const docData = {
      date,
      customerBackground,
      agentName,
      feedback,
      communication,
      googleEventId: null,
      googleEventLink: null,
    };

    if (syncToCalendar && isConnected) {
      try {
        const created = await createEvent({
          title: `帶看紀錄・${listingTitle || ""}`,
          date,
          notes: [customerBackground, agentName, communication, feedback].filter(Boolean).join(" / "),
        });
        docData.googleEventId = created.id;
        docData.googleEventLink = created.htmlLink;
      } catch (err) {
        console.error("Google 行事曆同步失敗", err);
      }
    }

    await add(docData);

    if (onLogged) {
      const summary = [customerBackground, communication, feedback].filter(Boolean).join(" / ");
      onLogged({ date, summary });
    }

    setCustomerBackground("");
    setAgentName("");
    setFeedback("");
    setCommunication("");
    setSyncToCalendar(false);
  };

  return (
    <div>
      <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 10 }}>帶看紀錄</div>

      <form onSubmit={onSubmit} style={{ marginBottom: 18 }}>
        <div style={{ marginBottom: 8 }}>
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            style={{ width: 150, padding: "9px 10px", border: "1px solid var(--border)", borderRadius: 7, fontSize: 13 }}
          />
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 12 }}>
          <div>
            <div style={{ fontSize: 11, fontWeight: 700, color: "var(--muted)", marginBottom: 6 }}>帶看客戶背景</div>
            <input
              value={customerBackground}
              onChange={(e) => setCustomerBackground(e.target.value)}
              placeholder="例如：科技業夫妻，首購自住"
              style={{ width: "100%", padding: "9px 10px", border: "1px solid var(--border)", borderRadius: 7, fontSize: 13 }}
            />
          </div>
          <div>
            <div style={{ fontSize: 11, fontWeight: 700, color: "var(--muted)", marginBottom: 6 }}>帶看業務</div>
            <input
              value={agentName}
              onChange={(e) => setAgentName(e.target.value)}
              placeholder="例如：劉昭佑、OO 店 XXX"
              style={{ width: "100%", padding: "9px 10px", border: "1px solid var(--border)", borderRadius: 7, fontSize: 13 }}
            />
          </div>
        </div>

        <div style={{ marginBottom: 8 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: "var(--muted)", marginBottom: 6 }}>客戶回饋</div>
          <textarea
            rows="2"
            value={feedback}
            onChange={(e) => setFeedback(e.target.value)}
            placeholder="客戶對物件的反應、喜好、疑慮…"
            style={{ width: "100%", padding: "9px 10px", border: "1px solid var(--border)", borderRadius: 7, fontSize: 13, fontFamily: "inherit" }}
          />
        </div>

        <div style={{ marginBottom: 12 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: "var(--muted)", marginBottom: 6 }}>這次溝通內容</div>
          <textarea
            rows="2"
            value={communication}
            onChange={(e) => setCommunication(e.target.value)}
            placeholder="這次聊了什麼、下一步約定…"
            style={{ width: "100%", padding: "9px 10px", border: "1px solid var(--border)", borderRadius: 7, fontSize: 13, fontFamily: "inherit" }}
          />
        </div>

        {isConnected && (
          <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12, marginBottom: 12, cursor: "pointer" }}>
            <input type="checkbox" checked={syncToCalendar} onChange={(e) => setSyncToCalendar(e.target.checked)} />
            同步到 Google 行事曆
          </label>
        )}

        <button className="btn" type="submit">新增帶看紀錄</button>
      </form>

      {sorted.length === 0 && <div style={{ fontSize: 13, color: "var(--muted)" }}>還沒有帶看紀錄</div>}
      {sorted.map((log) => (
        <div key={log.id} style={{ padding: "12px 0", borderBottom: "1px solid var(--border)", fontSize: 13 }}>
          <div style={{ display: "flex", justifyContent: "space-between" }}>
            <span className="mono" style={{ fontSize: 12, color: "var(--muted)" }}>{formatDate(log.date)}</span>
            <button onClick={() => remove(log.id)} style={{ border: "none", background: "none", color: "var(--muted)", cursor: "pointer", fontSize: 12 }}>刪除</button>
          </div>
          {log.googleEventLink && (
            <div style={{ marginTop: 4 }}>
              <a href={log.googleEventLink} target="_blank" rel="noreferrer" style={{ fontSize: 11 }}>📅 在行事曆開啟</a>
            </div>
          )}
          {(log.customerBackground || log.agentName) && (
            <div style={{ marginTop: 4 }}>
              {log.customerBackground && <>客戶背景：{log.customerBackground}　</>}
              {log.agentName && <>帶看業務：{log.agentName}</>}
            </div>
          )}
          {log.feedback && <div style={{ marginTop: 4 }}>回饋：{linkify(log.feedback)}</div>}
          {log.communication && <div style={{ marginTop: 4 }}>溝通：{linkify(log.communication)}</div>}
        </div>
      ))}
    </div>
  );
}
