import React, { useState, useMemo, useEffect } from "react";
import { Link } from "react-router-dom";
import { collectionGroup, onSnapshot } from "firebase/firestore";
import { db } from "../firebase";
import { useCollection } from "../hooks/useCollection";
import { useCollectionGroup } from "../hooks/useCollectionGroup";
import { useGoogleAuth } from "../GoogleAuthContext";
import { formatDate, nextMonthlyDueDate } from "../lib/dates";

function pad(n) {
  return String(n).padStart(2, "0");
}
function toDateStr(d) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
function monthLabel(d) {
  return `${d.getFullYear()} 年 ${d.getMonth() + 1} 月`;
}

// 監聽所有客戶底下的 appointments 子集合（收集群組查詢）
function useAllAppointments() {
  const [items, setItems] = useState([]);
  useEffect(() => {
    const q = collectionGroup(db, "appointments");
    const unsub = onSnapshot(
      q,
      (snap) => setItems(snap.docs.map((d) => ({ id: d.id, ...d.data() }))),
      () => setItems([])
    );
    return () => unsub();
  }, []);
  return items;
}

export default function CalendarPage() {
  const { items: cases } = useCollection("cases", "createdAt");
  const { items: rentals } = useCollection("rentals", "createdAt");
  const appointments = useAllAppointments();
  const listings = useCollectionGroup("listings");
  const { isConnected, listEvents } = useGoogleAuth();

  const [monthCursor, setMonthCursor] = useState(() => {
    const d = new Date();
    d.setDate(1);
    return d;
  });
  const [googleEvents, setGoogleEvents] = useState([]);
  const [loadingGoogle, setLoadingGoogle] = useState(false);

  const monthStart = new Date(monthCursor.getFullYear(), monthCursor.getMonth(), 1);
  const monthEnd = new Date(monthCursor.getFullYear(), monthCursor.getMonth() + 1, 0);

  useEffect(() => {
    if (!isConnected) {
      setGoogleEvents([]);
      return;
    }
    setLoadingGoogle(true);
    const timeMin = new Date(monthStart.getFullYear(), monthStart.getMonth(), 1).toISOString();
    const timeMax = new Date(monthEnd.getFullYear(), monthEnd.getMonth(), monthEnd.getDate() + 1).toISOString();
    listEvents(timeMin, timeMax)
      .then((events) => setGoogleEvents(events))
      .catch(() => setGoogleEvents([]))
      .finally(() => setLoadingGoogle(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isConnected, monthCursor]);

  // ---- 整合系統事件（成交案件里程碑、委託到期日、客戶約看）----
  const systemEvents = useMemo(() => {
    const list = [];
    cases.forEach((c) => {
      (c.milestones || []).forEach((m) => {
        if (m.date && !m.done) {
          list.push({
            date: m.date,
            title: `${c.title}・${m.label}`,
            detail: "",
            source: "system",
            link: "/cases",
            googleEventId: m.googleEventId || null,
          });
        }
      });
    });
    listings.forEach((l) => {
      if (l.agreementEndDate) {
        list.push({
          date: l.agreementEndDate,
          title: `${l.title || "委託"}・委託到期`,
          detail: "",
          source: "system",
          link: `/sellers/${l.parentId}/${l.id}`,
          googleEventId: l.agreementEndGoogleEventId || null,
        });
      }
    });
    rentals.forEach((r) => {
      if (r.status === "leased" && r.rentDueDay) {
        list.push({
          date: nextMonthlyDueDate(r.rentDueDay),
          title: `${r.title || "出租物件"}・房租收款`,
          detail: r.tenantName ? `房客：${r.tenantName}` : "",
          source: "system",
          link: `/rentals/${r.id}`,
          googleEventId: r.rentGoogleEventId || null,
        });
      }
    });
    appointments.forEach((a) => {
      if (a.date) {
        const isSellerAppt = a.content !== undefined;
        list.push({
          date: a.date,
          time: a.time,
          title: isSellerAppt ? a.content : `帶看${a.propertyLabel ? "・" + a.propertyLabel : ""}`,
          detail: a.notes || "",
          source: "system",
          link: isSellerAppt ? "/sellers" : "/buyers",
          googleEventId: a.googleEventId || null,
        });
      }
    });
    return list;
  }, [cases, appointments, listings, rentals]);

  const monthSystemEvents = systemEvents.filter((e) => e.date >= toDateStr(monthStart) && e.date <= toDateStr(monthEnd));

  // 已經同步過的 Google 事件，系統這邊已經有對應項目了，避免重複顯示
  const knownGoogleEventIds = new Set(
    systemEvents.filter((e) => e.googleEventId).map((e) => e.googleEventId)
  );

  const monthGoogleEvents = googleEvents
    .filter((ev) => !knownGoogleEventIds.has(ev.id))
    .map((ev) => {
      const start = ev.start?.dateTime || ev.start?.date;
      const dateStr = (ev.start?.dateTime || ev.start?.date || "").slice(0, 10);
      const time = ev.start?.dateTime ? new Date(ev.start.dateTime).toTimeString().slice(0, 5) : null;
      return {
        date: dateStr,
        time,
        title: ev.summary || "（無標題）",
        detail: ev.location || "",
        source: "google",
        link: ev.htmlLink,
        _raw: start,
      };
    });

  const allEvents = [...monthSystemEvents, ...monthGoogleEvents].sort((a, b) => {
    if (a.date !== b.date) return a.date < b.date ? -1 : 1;
    return (a.time || "").localeCompare(b.time || "");
  });

  const eventDatesSet = new Set(allEvents.map((e) => e.date));

  // ---- 小月曆格子 ----
  const calendarCells = useMemo(() => {
    const cells = [];
    const firstWeekday = monthStart.getDay(); // 0=日
    for (let i = 0; i < firstWeekday; i++) cells.push(null);
    for (let d = 1; d <= monthEnd.getDate(); d++) {
      cells.push(new Date(monthCursor.getFullYear(), monthCursor.getMonth(), d));
    }
    return cells;
  }, [monthCursor]); // eslint-disable-line react-hooks/exhaustive-deps

  const todayStr = toDateStr(new Date());

  return (
    <main>
      <div className="top-actions">
        <div className="section-title">行事曆</div>
        {!isConnected && (
          <Link to="/settings" className="btn ghost" style={{ textDecoration: "none" }}>
            前往設定連結 Google 帳號
          </Link>
        )}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "340px 1fr", gap: 24, alignItems: "start" }}>
        <div className="panel">
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
            <button
              className="btn ghost"
              onClick={() => setMonthCursor(new Date(monthCursor.getFullYear(), monthCursor.getMonth() - 1, 1))}
            >
              ‹
            </button>
            <div style={{ fontWeight: 700, fontSize: 14 }}>{monthLabel(monthCursor)}</div>
            <button
              className="btn ghost"
              onClick={() => setMonthCursor(new Date(monthCursor.getFullYear(), monthCursor.getMonth() + 1, 1))}
            >
              ›
            </button>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(7,1fr)", gap: 4, fontSize: 11, textAlign: "center" }}>
            {["日", "一", "二", "三", "四", "五", "六"].map((d) => (
              <div key={d} style={{ color: "var(--muted)", fontWeight: 700, paddingBottom: 6 }}>{d}</div>
            ))}
            {calendarCells.map((d, idx) => {
              if (!d) return <div key={idx}></div>;
              const dStr = toDateStr(d);
              const isToday = dStr === todayStr;
              const hasEvent = eventDatesSet.has(dStr);
              return (
                <div
                  key={idx}
                  style={{
                    padding: "8px 0",
                    borderRadius: 6,
                    background: isToday ? "var(--ink)" : hasEvent ? "var(--accent-soft)" : "transparent",
                    color: isToday ? "#fff" : hasEvent ? "var(--accent)" : "var(--ink)",
                    fontWeight: isToday || hasEvent ? 700 : 400,
                  }}
                >
                  {d.getDate()}
                </div>
              );
            })}
          </div>
          <div style={{ marginTop: 16, fontSize: 11, color: "var(--muted)" }}>
            <span style={{ color: "var(--accent)" }}>●</span> 當天有行程　
            <span style={{ color: "var(--ink)" }}>●</span> 今天
          </div>
        </div>

        <div className="panel">
          <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 14 }}>
            {monthLabel(monthCursor)} 行程{loadingGoogle && "（讀取 Google 行事曆中…）"}
          </div>
          {allEvents.length === 0 && (
            <div className="empty-state">這個月沒有排定的行程</div>
          )}
          {allEvents.map((e, i) => (
            <div key={i} style={{ display: "flex", gap: 14, padding: "12px 0", borderBottom: "1px solid var(--border)" }}>
              <div style={{ width: 60, flexShrink: 0, textAlign: "center" }}>
                <div className="mono" style={{ fontSize: 18, fontWeight: 700 }}>{e.date.slice(8, 10)}</div>
                <div style={{ fontSize: 10, color: "var(--muted)" }}>{e.date.slice(5, 7)}月{e.time ? `　${e.time}` : ""}</div>
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 13, fontWeight: 700 }}>
                  {e.link && e.source === "google" ? (
                    <a href={e.link} target="_blank" rel="noreferrer">{e.title}</a>
                  ) : e.link ? (
                    <Link to={e.link}>{e.title}</Link>
                  ) : (
                    e.title
                  )}
                </div>
                {e.detail && <div style={{ fontSize: 12, color: "var(--muted)" }}>{e.detail}</div>}
                <span
                  style={{
                    display: "inline-block", fontSize: 10, fontWeight: 700, padding: "2px 8px", borderRadius: 20, marginTop: 4,
                    background: e.source === "google" ? "#E8F0FE" : "var(--accent-soft)",
                    color: e.source === "google" ? "#2D5586" : "var(--accent)",
                  }}
                >
                  {e.source === "google" ? "Google 行事曆" : "系統"}
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </main>
  );
}
