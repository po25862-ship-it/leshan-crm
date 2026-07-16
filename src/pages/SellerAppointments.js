import React, { useState } from "react";
import { useCollection } from "../hooks/useCollection";
import { useGoogleAuth } from "../GoogleAuthContext";
import { formatDate, todayStr } from "../lib/dates";

export default function SellerAppointments({ contactId, listingId, listingTitle }) {
  const { items, add, remove } = useCollection(
    `contacts/${contactId}/listings/${listingId}/appointments`,
    "date"
  );
  const { isConnected, createEvent, deleteEvent } = useGoogleAuth();

  const [date, setDate] = useState(todayStr());
  const [time, setTime] = useState("14:00");
  const [content, setContent] = useState("");
  const [notes, setNotes] = useState("");
  const [syncToCalendar, setSyncToCalendar] = useState(isConnected);
  const [saving, setSaving] = useState(false);

  const sorted = [...items].sort((a, b) => (a.date < b.date ? -1 : 1));

  const onSubmit = async (e) => {
    e.preventDefault();
    if (!date || !content.trim()) return;
    setSaving(true);
    try {
      const docData = { date, time, content, notes, googleEventId: null, googleEventLink: null };

      if (syncToCalendar && isConnected) {
        const created = await createEvent({
          title: `${listingTitle ? listingTitle + "・" : ""}${content}`,
          date,
          time,
          notes,
        });
        docData.googleEventId = created.id;
        docData.googleEventLink = created.htmlLink;
      }

      await add(docData);
      setDate(todayStr());
      setTime("14:00");
      setContent("");
      setNotes("");
    } catch (err) {
      console.error(err);
      alert("新增失敗，或 Google 行事曆同步失敗，可稍後重試");
    }
    setSaving(false);
  };

  const onDelete = async (item) => {
    if (!window.confirm("確定要刪除這筆預約嗎？")) return;
    if (item.googleEventId) {
      try {
        await deleteEvent(item.googleEventId);
      } catch {
        // 行事曆刪不掉也不擋
      }
    }
    await remove(item.id);
  };

  return (
    <div>
      <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 12 }}>預約／處理時間</div>

      <form onSubmit={onSubmit} style={{ marginBottom: 16 }}>
        <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            style={{ flex: 1, padding: "9px 10px", border: "1px solid var(--border)", borderRadius: 7, fontSize: 13 }}
          />
          <input
            type="time"
            value={time}
            onChange={(e) => setTime(e.target.value)}
            style={{ width: 120, padding: "9px 10px", border: "1px solid var(--border)", borderRadius: 7, fontSize: 13 }}
          />
        </div>
        <input
          value={content}
          onChange={(e) => setContent(e.target.value)}
          placeholder="要做什麼，例如：回報進度、確認簽約、估價拜訪…"
          style={{ width: "100%", padding: "9px 10px", border: "1px solid var(--border)", borderRadius: 7, fontSize: 13, marginBottom: 8 }}
        />
        <input
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="備註（選填）"
          style={{ width: "100%", padding: "9px 10px", border: "1px solid var(--border)", borderRadius: 7, fontSize: 13, marginBottom: 8 }}
        />

        {isConnected ? (
          <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12, marginBottom: 10, cursor: "pointer" }}>
            <input type="checkbox" checked={syncToCalendar} onChange={(e) => setSyncToCalendar(e.target.checked)} />
            同步到 Google 行事曆
          </label>
        ) : (
          <div style={{ fontSize: 11, color: "var(--muted)", marginBottom: 10 }}>
            尚未連結 Google 帳號，前往「設定」頁面連結後可同步
          </div>
        )}

        <button className="btn" type="submit" disabled={saving}>
          {saving ? "新增中…" : "新增預約"}
        </button>
      </form>

      {sorted.length === 0 && <div style={{ fontSize: 13, color: "var(--muted)" }}>還沒有預約排程</div>}
      {sorted.map((item) => (
        <div key={item.id} style={{ padding: "10px 0", borderBottom: "1px solid var(--border)", fontSize: 13 }}>
          <div style={{ display: "flex", justifyContent: "space-between" }}>
            <span>
              <span className="mono" style={{ color: "var(--muted)" }}>
                {formatDate(item.date)} {item.time}
              </span>
              　{item.content}
            </span>
            <button
              onClick={() => onDelete(item)}
              style={{ border: "none", background: "none", color: "var(--muted)", cursor: "pointer", fontSize: 12 }}
            >
              刪除
            </button>
          </div>
          {item.notes && <div style={{ marginTop: 4, color: "var(--muted)" }}>{item.notes}</div>}
          {item.googleEventLink && (
            <div style={{ marginTop: 4 }}>
              <a href={item.googleEventLink} target="_blank" rel="noreferrer" style={{ fontSize: 11 }}>
                📅 在 Google 行事曆開啟
              </a>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
