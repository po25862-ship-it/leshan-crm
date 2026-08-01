import React, { useState } from "react";
import { useCollection } from "../hooks/useCollection";
import { useGoogleAuth } from "../GoogleAuthContext";
import { formatDate, todayStr } from "../lib/dates";
import { useAuth } from "../AuthContext";

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

const TYPE_LABELS = { progress: "進度回報", appointment: "預約／處理", viewing: "帶看紀錄", legacy: "委託前洽談紀錄" };
const TYPE_ICONS = { progress: "📢", appointment: "📅", viewing: "👀", legacy: "🗂️" };

export default function SellerActivityLog({ contactId, listingId, listingTitle, onLogged }) {
  const { user } = useAuth();
  const { isConnected, createEvent } = useGoogleAuth();
  const { items: colleagues } = useCollection("colleagues", "name");
  const MAIN_OWNER_UID = "KiYlsnWcChW5muRkG167r7Mi1132";
  const nameOf = (uid) => {
    if (!uid) return "";
    if (uid === user.uid) return "你";
    if (uid === MAIN_OWNER_UID) return colleagues.find((c) => c.id === uid)?.name || "劉昭佑";
    return colleagues.find((c) => c.id === uid)?.name || "同事";
  };

  const { items: progressItems, add: addProgress, remove: removeProgress } = useCollection(
    `contacts/${contactId}/listings/${listingId}/progressLogs`, "date"
  );
  const { items: apptItems, add: addAppt, remove: removeAppt } = useCollection(
    `contacts/${contactId}/listings/${listingId}/appointments`, "date"
  );
  const { items: viewingItems, add: addViewing, remove: removeViewing } = useCollection(
    `contacts/${contactId}/listings/${listingId}/interactions`, "date"
  );

  const [activeType, setActiveType] = useState("progress");

  // 進度回報欄位
  const [pDate, setPDate] = useState(todayStr());
  const [pContent, setPContent] = useState("");

  // 預約／處理欄位
  const [aDate, setADate] = useState(todayStr());
  const [aTime, setATime] = useState("14:00");
  const [aContent, setAContent] = useState("");
  const [aNotes, setANotes] = useState("");
  const [aSync, setASync] = useState(false);

  // 帶看紀錄欄位
  const [vDate, setVDate] = useState(todayStr());
  const [vBackground, setVBackground] = useState("");
  const [vAgent, setVAgent] = useState("");
  const [vFeedback, setVFeedback] = useState("");
  const [vCommunication, setVCommunication] = useState("");

  const merged = [
    ...progressItems.map((i) => ({ ...i, _type: "progress" })),
    ...apptItems.map((i) => ({ ...i, _type: "appointment" })),
    ...viewingItems.map((i) => ({
      ...i,
      // 搬移過來的舊資料是用「看過的物件／回饋／溝通」這套舊格式，不是真正的帶看紀錄，獨立標示成「委託前洽談紀錄」
      _type: i.customerBackground !== undefined || i.agentName !== undefined ? "viewing" : "legacy",
    })),
  ].sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));

  const submitProgress = async (e) => {
    e.preventDefault();
    if (!pContent.trim()) return;
    await addProgress({ date: pDate, content: pContent, byUid: user.uid });
    if (onLogged) onLogged({ date: pDate, summary: pContent });
    setPContent("");
  };

  const submitAppt = async (e) => {
    e.preventDefault();
    if (!aContent.trim()) return;
    const docData = { date: aDate, time: aTime, content: aContent, notes: aNotes, googleEventId: null, googleEventLink: null, byUid: user.uid };
    if (aSync && isConnected) {
      try {
        const created = await createEvent({ title: `${listingTitle ? listingTitle + "・" : ""}${aContent}`, date: aDate, time: aTime, notes: aNotes });
        docData.googleEventId = created.id;
        docData.googleEventLink = created.htmlLink;
      } catch (err) {
        console.error(err);
      }
    }
    await addAppt(docData);
    if (onLogged) onLogged({ date: aDate, summary: aContent });
    setAContent("");
    setANotes("");
    setASync(false);
  };

  const submitViewing = async (e) => {
    e.preventDefault();
    if (!vBackground.trim() && !vAgent.trim() && !vFeedback.trim() && !vCommunication.trim()) return;
    await addViewing({
      date: vDate,
      customerBackground: vBackground,
      agentName: vAgent,
      feedback: vFeedback,
      communication: vCommunication,
      googleEventId: null,
      googleEventLink: null,
      byUid: user.uid,
    });
    if (onLogged) {
      const summary = [vBackground, vCommunication, vFeedback].filter(Boolean).join(" / ");
      onLogged({ date: vDate, summary });
    }
    setVBackground("");
    setVAgent("");
    setVFeedback("");
    setVCommunication("");
  };

  const removeEntry = (item) => {
    if (item._type === "progress") removeProgress(item.id);
    else if (item._type === "appointment") removeAppt(item.id);
    else removeViewing(item.id);
  };

  const inputStyle = { width: "100%", padding: "9px 10px", border: "1px solid var(--border)", borderRadius: 7, fontSize: 13, fontFamily: "inherit" };

  return (
    <div>
      <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 12 }}>委託物件紀錄</div>

      <div style={{ display: "flex", gap: 6, marginBottom: 14 }}>
        {["progress", "appointment", "viewing"].map((key) => (
          <button
            key={key}
            type="button"
            onClick={() => setActiveType(key)}
            className={activeType === key ? "btn" : "btn ghost"}
            style={{ fontSize: 12 }}
          >
            {TYPE_ICONS[key]} {TYPE_LABELS[key]}
          </button>
        ))}
      </div>

      {activeType === "progress" && (
        <form onSubmit={submitProgress} style={{ marginBottom: 20, background: "#FAFAF8", border: "1px solid var(--border)", borderRadius: 8, padding: 12 }}>
          <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
            <input type="date" value={pDate} onChange={(e) => setPDate(e.target.value)} style={{ width: 150, ...inputStyle }} />
            <input value={pContent} onChange={(e) => setPContent(e.target.value)} placeholder="例如：591 詢問度增加、屋主同意降價…" style={{ flex: 1, ...inputStyle }} />
          </div>
          <button className="btn" type="submit">新增進度回報</button>
        </form>
      )}

      {activeType === "appointment" && (
        <form onSubmit={submitAppt} style={{ marginBottom: 20, background: "#FAFAF8", border: "1px solid var(--border)", borderRadius: 8, padding: 12 }}>
          <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
            <input type="date" value={aDate} onChange={(e) => setADate(e.target.value)} style={{ flex: 1, ...inputStyle }} />
            <input type="time" value={aTime} onChange={(e) => setATime(e.target.value)} style={{ width: 120, ...inputStyle }} />
          </div>
          <input value={aContent} onChange={(e) => setAContent(e.target.value)} placeholder="要做什麼，例如：回報進度、確認簽約、估價拜訪…" style={{ ...inputStyle, marginBottom: 8 }} />
          <input value={aNotes} onChange={(e) => setANotes(e.target.value)} placeholder="備註（選填）" style={{ ...inputStyle, marginBottom: 8 }} />
          {isConnected && (
            <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12, marginBottom: 10, cursor: "pointer" }}>
              <input type="checkbox" checked={aSync} onChange={(e) => setASync(e.target.checked)} />
              同步到 Google 行事曆
            </label>
          )}
          <button className="btn" type="submit">新增預約</button>
        </form>
      )}

      {activeType === "viewing" && (
        <form onSubmit={submitViewing} style={{ marginBottom: 20, background: "#FAFAF8", border: "1px solid var(--border)", borderRadius: 8, padding: 12 }}>
          <div style={{ marginBottom: 8 }}>
            <input type="date" value={vDate} onChange={(e) => setVDate(e.target.value)} style={{ width: 150, ...inputStyle }} />
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 8 }}>
            <input value={vBackground} onChange={(e) => setVBackground(e.target.value)} placeholder="帶看客戶背景" style={inputStyle} />
            <input value={vAgent} onChange={(e) => setVAgent(e.target.value)} placeholder="帶看業務" style={inputStyle} />
          </div>
          <textarea rows="2" value={vFeedback} onChange={(e) => setVFeedback(e.target.value)} placeholder="客戶回饋" style={{ ...inputStyle, marginBottom: 8 }} />
          <textarea rows="2" value={vCommunication} onChange={(e) => setVCommunication(e.target.value)} placeholder="這次溝通內容" style={{ ...inputStyle, marginBottom: 10 }} />
          <button className="btn" type="submit">新增帶看紀錄</button>
        </form>
      )}

      <div style={{ fontSize: 12, color: "var(--muted)", marginBottom: 10 }}>
        以下依時間排列，三種類型都在同一條時間軸上，方便一次看完整個過程：
      </div>

      {merged.length === 0 && <div style={{ fontSize: 13, color: "var(--muted)" }}>還沒有任何紀錄</div>}
      {merged.map((item) => (
        <div key={`${item._type}-${item.id}`} style={{ padding: "12px 0", borderBottom: "1px solid var(--border)", fontSize: 13 }}>
          <div style={{ display: "flex", justifyContent: "space-between" }}>
            <span>
              <span className="mono" style={{ fontSize: 12, color: "var(--muted)" }}>{formatDate(item.date)}</span>
              {item.time && <span className="mono" style={{ fontSize: 12, color: "var(--muted)" }}> {item.time}</span>}
              　<span style={{ fontSize: 11, background: "var(--accent-soft)", color: "var(--accent)", borderRadius: 20, padding: "2px 10px", fontWeight: 700 }}>
                {TYPE_ICONS[item._type]} {TYPE_LABELS[item._type]}
              </span>
              {item.byUid && (
                <span className="mono" style={{ fontSize: 11, color: "var(--muted)", marginLeft: 8 }}>
                  由 {nameOf(item.byUid)}
                </span>
              )}
            </span>
            <button onClick={() => removeEntry(item)} style={{ border: "none", background: "none", color: "var(--muted)", cursor: "pointer", fontSize: 12 }}>刪除</button>
          </div>

          {item._type === "progress" && <div style={{ marginTop: 6 }}>{linkify(item.content)}</div>}

          {item._type === "appointment" && (
            <div style={{ marginTop: 6 }}>
              {item.content}
              {item.notes && <div style={{ color: "var(--muted)", marginTop: 2 }}>{item.notes}</div>}
              {item.googleEventLink && (
                <div style={{ marginTop: 4 }}>
                  <a href={item.googleEventLink} target="_blank" rel="noreferrer" style={{ fontSize: 11 }}>📅 在 Google 行事曆開啟</a>
                </div>
              )}
            </div>
          )}

          {item._type === "viewing" && (
            <div style={{ marginTop: 6 }}>
              {(item.customerBackground || item.agentName) && (
                <div>
                  {item.customerBackground && <>客戶背景：{item.customerBackground}　</>}
                  {item.agentName && <>帶看業務：{item.agentName}</>}
                </div>
              )}
              {item.feedback && <div style={{ marginTop: 2 }}>回饋：{linkify(item.feedback)}</div>}
              {item.communication && <div style={{ marginTop: 2 }}>溝通：{linkify(item.communication)}</div>}
            </div>
          )}

          {item._type === "legacy" && (
            <div style={{ marginTop: 6 }}>
              {(item.properties || []).length > 0 && (
                <div style={{ marginBottom: 4 }}>
                  {item.properties.map((p, i) => (
                    <span key={i} className="tag" style={{ background: "#F3EFE6", color: "var(--brass)" }}>{p.label}</span>
                  ))}
                </div>
              )}
              {item.feedback && <div>回饋：{linkify(item.feedback)}</div>}
              {item.communication && <div style={{ marginTop: 2 }}>溝通：{linkify(item.communication)}</div>}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
