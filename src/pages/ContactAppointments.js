import React, { useState } from "react";
import { useCollection } from "../hooks/useCollection";
import { useGoogleAuth } from "../GoogleAuthContext";
import { formatDate, todayStr } from "../lib/dates";

export default function ContactAppointments({ contactId, contactName }) {
  const { items: appointments, add, update, remove } = useCollection(
    `contacts/${contactId}/appointments`,
    "date"
  );
  const { items: properties } = useCollection("properties", "title");
  const { isConnected, createEvent, updateEvent, deleteEvent } = useGoogleAuth();

  const [date, setDate] = useState(todayStr());
  const [time, setTime] = useState("14:00");
  const [propertyLabel, setPropertyLabel] = useState("");
  const [notes, setNotes] = useState("");
  const [syncToCalendar, setSyncToCalendar] = useState(isConnected);
  const [saving, setSaving] = useState(false);

  const sorted = [...appointments].sort((a, b) => (a.date < b.date ? -1 : 1));

  const onSubmit = async (e) => {
    e.preventDefault();
    if (!date) return;
    setSaving(true);
    try {
      const match = properties.find((p) => p.title === propertyLabel.trim());
      const docData = {
        date,
        time,
        propertyLabel: propertyLabel.trim(),
        propertyId: match ? match.id : null,
        notes,
      };

      const ref = await add(docData);

      if (syncToCalendar && isConnected) {
        const created = await createEvent({
          title: `帶看・${contactName}${propertyLabel ? `・${propertyLabel}` : ""}`,
          date,
          time,
          notes,
        });
        await update(ref.id, { googleEventId: created.id, googleEventLink: created.htmlLink });
      }

      setDate(todayStr());
      setTime("14:00");
      setPropertyLabel("");
      setNotes("");
    } catch (err) {
      console.error(err);
      alert("新增約看失敗，或 Google 行事曆同步失敗，可稍後重試");
    }
    setSaving(false);
  };

  const onDelete = async (appt) => {
    if (!window.confirm("確定要刪除這筆約看嗎？")) return;
    if (appt.googleEventId) {
      try {
        await deleteEvent(appt.googleEventId);
      } catch {
        // 行事曆刪不掉也不擋
      }
    }
    await remove(appt.id);
  };

  return (
    <div>
      <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 10 }}>約帶看時間</div>

      <datalist id="property-options-appt">
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
          list="property-options-appt"
          value={propertyLabel}
          onChange={(e) => setPropertyLabel(e.target.value)}
          placeholder="要帶看的物件（可選填，可從物件清單挑或自己打）"
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
            尚未連結 Google 帳號，前往「設定」頁面連結後可同步約看時間
          </div>
        )}

        <button className="btn" type="submit" disabled={saving}>
          {saving ? "新增中…" : "新增約看"}
        </button>
      </form>

      {sorted.length === 0 && (
        <div style={{ fontSize: 13, color: "var(--muted)" }}>還沒有約看排程</div>
      )}
      {sorted.map((appt) => (
        <div key={appt.id} style={{ padding: "10px 0", borderBottom: "1px solid var(--border)", fontSize: 13 }}>
          <div style={{ display: "flex", justifyContent: "space-between" }}>
            <span>
              <span className="mono" style={{ color: "var(--muted)" }}>
                {formatDate(appt.date)} {appt.time}
              </span>
              {appt.propertyLabel && <> ・{appt.propertyLabel}</>}
            </span>
            <button
              onClick={() => onDelete(appt)}
              style={{ border: "none", background: "none", color: "var(--muted)", cursor: "pointer", fontSize: 12 }}
            >
              刪除
            </button>
          </div>
          {appt.notes && <div style={{ marginTop: 4, color: "var(--muted)" }}>{appt.notes}</div>}
          {appt.googleEventLink && (
            <div style={{ marginTop: 4 }}>
              <a href={appt.googleEventLink} target="_blank" rel="noreferrer" style={{ fontSize: 11 }}>
                📅 在 Google 行事曆開啟
              </a>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
