import React, { useState } from "react";
import { useCollection } from "../hooks/useCollection";
import { useGoogleAuth } from "../GoogleAuthContext";
import { formatDate, todayStr } from "../lib/dates";
import { useAuth } from "../AuthContext";
import PropertyPicker from "./PropertyPicker";

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

const emptyPropertyRow = "";
const TYPE_LABELS = { appointment: "約帶看", interaction: "互動紀錄" };
const TYPE_ICONS = { appointment: "📅", interaction: "💬" };

export default function BuyerActivityLog({ contactId, contactName, onLogged }) {
  const { user } = useAuth();
  const { isConnected, createEvent, updateEvent, deleteEvent } = useGoogleAuth();
  const { items: properties } = useCollection("properties", "title");
  const { items: colleagues } = useCollection("colleagues", "name");
  const MAIN_OWNER_UID = "KiYlsnWcChW5muRkG167r7Mi1132";
  const nameOf = (uid) => {
    if (!uid) return "";
    if (uid === user.uid) return "你";
    if (uid === MAIN_OWNER_UID) return colleagues.find((c) => c.id === uid)?.name || "劉昭佑";
    return colleagues.find((c) => c.id === uid)?.name || "同事";
  };

  const { items: appts, add: addAppt, update: updateAppt, remove: removeAppt } = useCollection(
    `contacts/${contactId}/appointments`, "date"
  );
  const { items: interactions, add: addInteraction, remove: removeInteraction } = useCollection(
    `contacts/${contactId}/interactions`, "date"
  );

  const [activeType, setActiveType] = useState("appointment");

  // 約帶看欄位
  const [aDate, setADate] = useState(todayStr());
  const [aTime, setATime] = useState("14:00");
  const [aPropertyLabel, setAPropertyLabel] = useState("");
  const [aNotes, setANotes] = useState("");
  const [aSync, setASync] = useState(isConnected);
  const [aSaving, setASaving] = useState(false);

  // 互動紀錄欄位
  const [iDate, setIDate] = useState(todayStr());
  const [propertyInputs, setPropertyInputs] = useState([emptyPropertyRow]);
  const [feedback, setFeedback] = useState("");
  const [communication, setCommunication] = useState("");
  const [iSync, setISync] = useState(false);

  const merged = [
    ...appts.map((i) => ({ ...i, _type: "appointment" })),
    ...interactions.map((i) => ({ ...i, _type: "interaction" })),
  ].sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));

  const submitAppt = async (e) => {
    e.preventDefault();
    if (!aDate) return;
    setASaving(true);
    try {
      const match = properties.find((p) => p.title === aPropertyLabel.trim());
      const docData = {
        date: aDate,
        time: aTime,
        propertyLabel: aPropertyLabel.trim(),
        propertyId: match ? match.id : null,
        notes: aNotes,
        byUid: user.uid,
      };
      const ref = await addAppt(docData);
      if (aSync && isConnected) {
        const created = await createEvent({
          title: `帶看・${contactName}${aPropertyLabel ? `・${aPropertyLabel}` : ""}`,
          date: aDate,
          time: aTime,
          notes: aNotes,
        });
        await updateAppt(ref.id, { googleEventId: created.id, googleEventLink: created.htmlLink });
      }
      if (onLogged) onLogged({ date: aDate, summary: aPropertyLabel ? `約帶看：${aPropertyLabel}` : "約帶看" });
      setADate(todayStr());
      setATime("14:00");
      setAPropertyLabel("");
      setANotes("");
    } catch (err) {
      console.error(err);
      alert("新增約看失敗，或 Google 行事曆同步失敗，可稍後重試");
    }
    setASaving(false);
  };

  const deleteAppt = async (item) => {
    if (!window.confirm("確定要刪除這筆約看嗎？")) return;
    if (item.googleEventId) {
      try {
        await deleteEvent(item.googleEventId);
      } catch {
        // 行事曆刪不掉也不擋
      }
    }
    await removeAppt(item.id);
  };

  const updatePropertyRow = (idx, val) => {
    const next = [...propertyInputs];
    next[idx] = val;
    setPropertyInputs(next);
  };
  const addPropertyRow = () => setPropertyInputs([...propertyInputs, emptyPropertyRow]);
  const removePropertyRow = (idx) => setPropertyInputs(propertyInputs.filter((_, i) => i !== idx));
  const resolveProperties = () =>
    propertyInputs
      .map((label) => label.trim())
      .filter(Boolean)
      .map((label) => {
        const match = properties.find((p) => p.title === label);
        return { label, propertyId: match ? match.id : null };
      });

  const submitInteraction = async (e) => {
    e.preventDefault();
    if (!feedback.trim() && !communication.trim() && resolveProperties().length === 0) return;

    const docData = {
      date: iDate,
      properties: resolveProperties(),
      feedback,
      communication,
      googleEventId: null,
      googleEventLink: null,
      byUid: user.uid,
    };

    if (iSync && isConnected) {
      try {
        const created = await createEvent({
          title: `互動紀錄・${contactName || ""}`,
          date: iDate,
          notes: [communication, feedback].filter(Boolean).join(" / "),
        });
        docData.googleEventId = created.id;
        docData.googleEventLink = created.htmlLink;
      } catch (err) {
        console.error("Google 行事曆同步失敗", err);
      }
    }

    await addInteraction(docData);

    if (onLogged) {
      const summary = communication.trim() || feedback.trim() || "";
      onLogged({ date: iDate, summary });
    }

    setPropertyInputs([emptyPropertyRow]);
    setFeedback("");
    setCommunication("");
    setISync(false);
  };

  const removeEntry = (item) => {
    if (item._type === "appointment") deleteAppt(item);
    else removeInteraction(item.id);
  };

  const inputStyle = { width: "100%", padding: "9px 10px", border: "1px solid var(--border)", borderRadius: 7, fontSize: 13, fontFamily: "inherit" };

  return (
    <div>
      <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 12 }}>客戶紀錄</div>

      <div style={{ display: "flex", gap: 6, marginBottom: 14 }}>
        {Object.entries(TYPE_LABELS).map(([key, label]) => (
          <button
            key={key}
            type="button"
            onClick={() => setActiveType(key)}
            className={activeType === key ? "btn" : "btn ghost"}
            style={{ fontSize: 12 }}
          >
            {TYPE_ICONS[key]} {label}
          </button>
        ))}
      </div>

      {activeType === "appointment" && (
        <form onSubmit={submitAppt} style={{ marginBottom: 20, background: "#FAFAF8", border: "1px solid var(--border)", borderRadius: 8, padding: 12 }}>
          <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
            <input type="date" value={aDate} onChange={(e) => setADate(e.target.value)} style={{ ...inputStyle, flex: 1 }} />
            <input type="time" value={aTime} onChange={(e) => setATime(e.target.value)} style={{ ...inputStyle, width: 120 }} />
          </div>
          <div style={{ marginBottom: 8 }}>
            <PropertyPicker
              properties={properties}
              value={aPropertyLabel}
              onChange={setAPropertyLabel}
              placeholder="要帶看的物件（可選填，可從物件清單挑或自己打）"
            />
          </div>
          <input value={aNotes} onChange={(e) => setANotes(e.target.value)} placeholder="備註（選填）" style={{ ...inputStyle, marginBottom: 8 }} />
          {isConnected ? (
            <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12, marginBottom: 10, cursor: "pointer" }}>
              <input type="checkbox" checked={aSync} onChange={(e) => setASync(e.target.checked)} />
              同步到 Google 行事曆
            </label>
          ) : (
            <div style={{ fontSize: 11, color: "var(--muted)", marginBottom: 10 }}>尚未連結 Google 帳號，前往「設定」頁面連結後可同步</div>
          )}
          <button className="btn" type="submit" disabled={aSaving}>{aSaving ? "新增中…" : "新增約看"}</button>
        </form>
      )}

      {activeType === "interaction" && (
        <form onSubmit={submitInteraction} style={{ marginBottom: 20, background: "#FAFAF8", border: "1px solid var(--border)", borderRadius: 8, padding: 12 }}>
          <div style={{ marginBottom: 8 }}>
            <input type="date" value={iDate} onChange={(e) => setIDate(e.target.value)} style={{ ...inputStyle, width: 150 }} />
          </div>

          <div style={{ fontSize: 11, fontWeight: 700, color: "var(--muted)", marginBottom: 6 }}>看過的物件（可從清單選，也可直接打新的地址／名稱）</div>
          {propertyInputs.map((val, idx) => (
            <div key={idx} style={{ display: "flex", gap: 8, marginBottom: 6 }}>
              <div style={{ flex: 1 }}>
                <PropertyPicker
                  properties={properties}
                  value={val}
                  onChange={(v) => updatePropertyRow(idx, v)}
                  placeholder="例如：A7 重劃區 OO 社區 3F"
                />
              </div>
              {propertyInputs.length > 1 && (
                <button type="button" className="btn ghost" onClick={() => removePropertyRow(idx)}>刪除</button>
              )}
            </div>
          ))}
          <button type="button" className="btn ghost" onClick={addPropertyRow} style={{ marginBottom: 12 }}>＋ 再加一間</button>

          <div style={{ marginBottom: 8 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: "var(--muted)", marginBottom: 6 }}>客戶回饋</div>
            <textarea rows="2" value={feedback} onChange={(e) => setFeedback(e.target.value)} placeholder="客戶對這些物件的反應、喜好、疑慮…" style={inputStyle} />
          </div>

          <div style={{ marginBottom: 12 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: "var(--muted)", marginBottom: 6 }}>這次溝通內容</div>
            <textarea rows="2" value={communication} onChange={(e) => setCommunication(e.target.value)} placeholder="這次聊了什麼、下一步約定…" style={inputStyle} />
          </div>

          {isConnected && (
            <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12, marginBottom: 12, cursor: "pointer" }}>
              <input type="checkbox" checked={iSync} onChange={(e) => setISync(e.target.checked)} />
              同步到 Google 行事曆
            </label>
          )}

          <button className="btn" type="submit">新增互動紀錄</button>
        </form>
      )}

      <div style={{ fontSize: 12, color: "var(--muted)", marginBottom: 10 }}>
        以下依時間排列，約帶看跟互動紀錄都在同一條時間軸上：
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

          {item._type === "appointment" && (
            <div style={{ marginTop: 6 }}>
              {item.propertyLabel && <>{item.propertyLabel}</>}
              {item.notes && <div style={{ color: "var(--muted)", marginTop: 2 }}>{item.notes}</div>}
              {item.googleEventLink && (
                <div style={{ marginTop: 4 }}>
                  <a href={item.googleEventLink} target="_blank" rel="noreferrer" style={{ fontSize: 11 }}>📅 在 Google 行事曆開啟</a>
                </div>
              )}
            </div>
          )}

          {item._type === "interaction" && (
            <div style={{ marginTop: 6 }}>
              {(item.properties || []).length > 0 && (
                <div style={{ marginBottom: 4 }}>
                  {item.properties.map((p, i) => (
                    <span key={i} className="tag" style={{ background: p.propertyId ? "var(--accent-soft)" : "#F3EFE6", color: p.propertyId ? "var(--accent)" : "var(--brass)" }}>
                      {p.label}
                    </span>
                  ))}
                </div>
              )}
              {item.feedback && <div>回饋：{linkify(item.feedback)}</div>}
              {item.communication && <div style={{ marginTop: 2 }}>溝通：{linkify(item.communication)}</div>}
              {item.googleEventLink && (
                <div style={{ marginTop: 4 }}>
                  <a href={item.googleEventLink} target="_blank" rel="noreferrer" style={{ fontSize: 11 }}>📅 在行事曆開啟</a>
                </div>
              )}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
