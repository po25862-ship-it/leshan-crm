import React, { useState, useMemo, useEffect } from "react";
import { Link } from "react-router-dom";
import { collectionGroup, onSnapshot } from "firebase/firestore";
import { db } from "../firebase";
import { useCollection } from "../hooks/useCollection";
import { useListingsForContacts } from "../hooks/useListingsForContacts";
import { useSharedCollection } from "../hooks/useSharedCollection";
import { useAuth } from "../AuthContext";
import { useGoogleAuth } from "../GoogleAuthContext";
import { nextMonthlyDueDate } from "../lib/dates";

function pad(n) {
  return String(n).padStart(2, "0");
}
function toDateStr(d) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
function monthLabel(d) {
  return `${d.getFullYear()} 年 ${d.getMonth() + 1} 月`;
}
function addDays(date, amount) {
  const next = new Date(date);
  next.setDate(next.getDate() + amount);
  return next;
}
function startOfWeek(date) {
  const next = new Date(date);
  const day = next.getDay();
  next.setDate(next.getDate() - (day === 0 ? 6 : day - 1));
  next.setHours(0, 0, 0, 0);
  return next;
}

// 監聽所有客戶底下的 appointments 子集合（收集群組查詢）
// 注意：約看紀錄本身沒有記擁有者/分享名單，目前只有主要負責人能看到這部分彙整，
// 同事帳號看行事曆時，買方/賣方的約看時間暫時不會出現在這裡（其他項目不受影響），這是已知限制，之後可以再補
const MAIN_OWNER_UID_CAL = "KiYlsnWcChW5muRkG167r7Mi1132";
function useAllAppointments(currentUid) {
  const [items, setItems] = useState([]);
  useEffect(() => {
    if (currentUid !== MAIN_OWNER_UID_CAL) {
      setItems([]);
      return;
    }
    const q = collectionGroup(db, "appointments");
    const unsub = onSnapshot(
      q,
      (snap) => setItems(snap.docs.map((d) => ({ id: d.id, ...d.data() }))),
      () => setItems([])
    );
    return () => unsub();
  }, [currentUid]);
  return items;
}

export default function CalendarPage() {
  const { user } = useAuth();
  const { items: cases } = useCollection("cases", "createdAt", user.uid === MAIN_OWNER_UID_CAL);
  const { items: rentals } = useSharedCollection("rentals", "createdAt", user.uid);
  const { items: contacts } = useSharedCollection("contacts", "name", user.uid);
  const sellerContactIds = useMemo(
    () => contacts.filter((c) => (c.tags || []).includes("賣方")).map((c) => c.id),
    [contacts]
  );
  const appointments = useAllAppointments(user.uid);
  const listings = useListingsForContacts(sellerContactIds);
  const { isConnected, listEvents, createEvent, connect } = useGoogleAuth();

  const [monthCursor, setMonthCursor] = useState(() => {
    const d = new Date();
    d.setDate(1);
    return d;
  });
  const [weekCursor, setWeekCursor] = useState(() => startOfWeek(new Date()));
  const [viewMode, setViewMode] = useState("week");
  const [googleEvents, setGoogleEvents] = useState([]);
  const [loadingGoogle, setLoadingGoogle] = useState(false);
  const [eventForm, setEventForm] = useState({ title: "", date: toDateStr(new Date()), time: "09:00", notes: "" });
  const [creatingEvent, setCreatingEvent] = useState(false);
  const [googleRefreshKey, setGoogleRefreshKey] = useState(0);

  const monthStart = new Date(monthCursor.getFullYear(), monthCursor.getMonth(), 1);
  const monthEnd = new Date(monthCursor.getFullYear(), monthCursor.getMonth() + 1, 0);
  const weekDays = useMemo(() => Array.from({ length: 5 }, (_, index) => addDays(weekCursor, index)), [weekCursor]);
  const rangeStart = viewMode === "week" ? weekDays[0] : monthStart;
  const rangeEnd = viewMode === "week" ? weekDays[4] : monthEnd;

  useEffect(() => {
    if (!isConnected) {
      setGoogleEvents([]);
      return;
    }
    setLoadingGoogle(true);
    const timeMin = new Date(rangeStart.getFullYear(), rangeStart.getMonth(), rangeStart.getDate()).toISOString();
    const timeMax = new Date(rangeEnd.getFullYear(), rangeEnd.getMonth(), rangeEnd.getDate() + 1).toISOString();
    listEvents(timeMin, timeMax)
      .then((events) => setGoogleEvents(events))
      .catch(() => setGoogleEvents([]))
      .finally(() => setLoadingGoogle(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isConnected, monthCursor, weekCursor, viewMode, googleRefreshKey]);

  const addGoogleEvent = async (e) => {
    e.preventDefault();
    if (!isConnected) {
      connect();
      return;
    }
    if (!eventForm.title.trim() || !eventForm.date) return;
    setCreatingEvent(true);
    try {
      await createEvent({ ...eventForm, title: eventForm.title.trim() });
      setEventForm((prev) => ({ ...prev, title: "", notes: "" }));
      setGoogleRefreshKey((key) => key + 1);
      alert("已加入你的 Google 行事曆");
    } catch (err) {
      alert(err.message || "建立行程失敗");
    } finally {
      setCreatingEvent(false);
    }
  };

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

  const visibleSystemEvents = systemEvents.filter((e) => e.date >= toDateStr(rangeStart) && e.date <= toDateStr(rangeEnd));

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

  const allEvents = [...visibleSystemEvents, ...monthGoogleEvents].sort((a, b) => {
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

  const goToday = () => {
    const today = new Date();
    setWeekCursor(startOfWeek(today));
    setMonthCursor(new Date(today.getFullYear(), today.getMonth(), 1));
  };
  const moveCursor = (direction) => {
    if (viewMode === "week") setWeekCursor((current) => addDays(current, direction * 7));
    else setMonthCursor((current) => new Date(current.getFullYear(), current.getMonth() + direction, 1));
  };
  const currentLabel = viewMode === "week"
    ? `${weekDays[0].getFullYear()}年${weekDays[0].getMonth() + 1}月 ${weekDays[0].getDate()}–${weekDays[4].getDate()}日`
    : monthLabel(monthCursor);

  return (
    <main className="calendar-page-v2">
      <div className="top-actions calendar-title-row">
        <div><div className="eyebrow">SCHEDULE</div><div className="section-title">行事曆整合</div><p>約帶看、成交里程碑與 Google Calendar 集中管理。</p></div>
        {!isConnected ? <Link to="/settings" className="btn ghost">連結 Google 帳號</Link> : <span className="calendar-connected">已同步 Google Calendar</span>}
      </div>

      <form className="panel calendar-quick-add" onSubmit={addGoogleEvent}>
        <div className="calendar-quick-copy"><strong>快速新增行程</strong><span>{isConnected ? "自動寫入 Google Calendar" : "首次使用請先連結 Google 帳號"}</span></div>
        <input aria-label="行程名稱" placeholder="例如：林小姐 A7 帶看" value={eventForm.title} onChange={(e) => setEventForm({ ...eventForm, title: e.target.value })} required />
        <input aria-label="日期" type="date" value={eventForm.date} onChange={(e) => setEventForm({ ...eventForm, date: e.target.value })} required />
        <input aria-label="時間" type="time" value={eventForm.time} onChange={(e) => setEventForm({ ...eventForm, time: e.target.value })} />
        <input aria-label="備註" placeholder="地址或備註" value={eventForm.notes} onChange={(e) => setEventForm({ ...eventForm, notes: e.target.value })} />
        <button className="btn" type="submit" disabled={creatingEvent}>{creatingEvent ? "新增中…" : isConnected ? "+ 新增行程" : "連結 Google"}</button>
      </form>

      <section className="panel calendar-workspace">
        <header className="calendar-toolbar">
          <div className="calendar-toolbar-left"><button className="btn ghost" onClick={goToday}>今天</button><button className="calendar-arrow" aria-label="上一期" onClick={() => moveCursor(-1)}>‹</button><button className="calendar-arrow" aria-label="下一期" onClick={() => moveCursor(1)}>›</button><strong>{currentLabel}</strong></div>
          <div className="calendar-toolbar-right">{loadingGoogle && <span>同步中…</span>}{isConnected && <button className="btn ghost" onClick={() => setGoogleRefreshKey((key) => key + 1)}>重新同步</button>}<div className="calendar-view-toggle"><button className={viewMode === "week" ? "active" : ""} onClick={() => setViewMode("week")}>週</button><button className={viewMode === "month" ? "active" : ""} onClick={() => setViewMode("month")}>月</button></div></div>
        </header>

        {viewMode === "week" ? <div className="calendar-week-scroll"><div className="calendar-week-grid">
          <div className="calendar-week-corner" />
          {weekDays.map((day, index) => <div className={`calendar-week-day ${toDateStr(day) === todayStr ? "today" : ""}`} key={toDateStr(day)}><strong>{day.getDate()}</strong><span>（{["一", "二", "三", "四", "五"][index]}）</span></div>)}
          {Array.from({ length: 10 }, (_, index) => index + 9).flatMap((hour) => [
            <div className="calendar-time-label" key={`time-${hour}`}>{pad(hour)}:00</div>,
            ...weekDays.map((day) => {
              const date = toDateStr(day);
              const cellEvents = allEvents.filter((event) => event.date === date && (event.time ? Number(event.time.slice(0, 2)) === hour : hour === 9));
              return <div className="calendar-time-cell" key={`${date}-${hour}`}>{cellEvents.map((event, eventIndex) => <div className={`calendar-event event-${event.source} event-tone-${eventIndex % 3}`} key={`${event.title}-${eventIndex}`}><small>{event.time || "全天"}</small><strong>{event.link && event.source === "google" ? <a href={event.link} target="_blank" rel="noreferrer">{event.title}</a> : event.link ? <Link to={event.link}>{event.title}</Link> : event.title}</strong>{event.detail && <span>{event.detail}</span>}</div>)}</div>;
            }),
          ])}
        </div></div> : <div className="calendar-month-layout">
          <div className="calendar-month-grid"><div className="calendar-month-weekdays">{["日", "一", "二", "三", "四", "五", "六"].map((day) => <span key={day}>{day}</span>)}</div><div className="calendar-month-days">{calendarCells.map((day, index) => {
            if (!day) return <div key={index} />;
            const date = toDateStr(day);
            const dayEvents = allEvents.filter((event) => event.date === date);
            return <div className={`${date === todayStr ? "today" : ""} ${eventDatesSet.has(date) ? "has-event" : ""}`} key={date}><strong>{day.getDate()}</strong>{dayEvents.slice(0, 2).map((event, eventIndex) => <span key={`${event.title}-${eventIndex}`}>{event.time || "全天"} {event.title}</span>)}</div>;
          })}</div></div>
          <div className="calendar-agenda"><h3>{monthLabel(monthCursor)} 行程</h3>{allEvents.length === 0 ? <div className="empty-state">這個月沒有排定的行程</div> : allEvents.map((event, index) => <div className="calendar-agenda-row" key={`${event.title}-${index}`}><time><strong>{event.date.slice(8, 10)}</strong><span>{event.date.slice(5, 7)}月 {event.time || "全天"}</span></time><div><strong>{event.title}</strong>{event.detail && <span>{event.detail}</span>}<small>{event.source === "google" ? "Google Calendar" : "系統行程"}</small></div></div>)}</div>
        </div>}
      </section>
    </main>
  );
}
