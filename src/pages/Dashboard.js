import React, { useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useCollection } from "../hooks/useCollection";
import { useSharedCollection } from "../hooks/useSharedCollection";
import { useNeedsCollection } from "../hooks/useNeedsCollection";
import { useAuth } from "../AuthContext";
import { useCollectionGroup } from "../hooks/useCollectionGroup";
import { useLatestTopicLogs } from "../hooks/useLatestTopicLogs";
import { useDoc } from "../hooks/useDoc";
import { daysSince, daysUntil, formatDate, nextMonthlyDueDate } from "../lib/dates";

export default function Dashboard() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [contactMenuId, setContactMenuId] = useState(null);
  const { items: contacts } = useSharedCollection("contacts", "name", user.uid);
  const MAIN_OWNER_UID = "KiYlsnWcChW5muRkG167r7Mi1132";
  const { items: quickNotes, update: updateNote, remove: removeNote } = useCollection("quickNotes", "createdAt", user.uid === MAIN_OWNER_UID);
  const { items: recentContacts } = useSharedCollection("contacts", "createdAt", user.uid);
  const { items: cases } = useCollection("cases", "createdAt");
  const { items: needs } = useNeedsCollection(user.uid);
  const { items: topics } = useSharedCollection("topics", "createdAt", user.uid);
  const { items: properties } = useCollection("properties", "createdAt");
  const { items: rentals } = useSharedCollection("rentals", "createdAt", user.uid);
  const { data: settings } = useDoc("settings/general", { reminderDays: 5 });
  const reminderDays = settings.reminderDays ?? 5;

  const overdueContacts = useMemo(
    () =>
      contacts
        .map((c) => ({ ...c, days: daysSince(c.lastContactDate) }))
        .filter((c) => c.days !== null && c.days >= reminderDays)
        .sort((a, b) => b.days - a.days),
    [contacts, reminderDays]
  );

  const closedCases = cases;

  const upcomingMilestones = useMemo(() => {
    const result = [];
    closedCases.forEach((c) => {
      (c.milestones || []).forEach((m) => {
        if (!m.date || m.done) return;
        const until = daysUntil(m.date);
        if (until !== null && until >= -1 && until <= 14) {
          result.push({ id: `${c.id}-${m.label}`, caseId: c.id, caseTitle: c.title, label: m.label, date: m.date, until });
        }
      });
    });
    return result.sort((a, b) => a.until - b.until);
  }, [closedCases]);

  const upcomingRentDue = useMemo(() => {
    const rentReminders = rentals
      .filter((r) => r.status === "leased" && r.rentDueDay)
      .map((r) => {
        const due = nextMonthlyDueDate(r.rentDueDay);
        return { ...r, _kind: "rent", dueDate: due, until: daysUntil(due) };
      })
      .filter((r) => r.until !== null && r.until <= 3);

    const followUpReminders = rentals
      .filter((r) => r.status === "selfLeased" && r.selfLeasedEndDate)
      .map((r) => ({ ...r, _kind: "followUp", dueDate: r.selfLeasedEndDate, until: daysUntil(r.selfLeasedEndDate) }))
      .filter((r) => r.until !== null && r.until <= 30);

    return [...rentReminders, ...followUpReminders].sort((a, b) => a.until - b.until);
  }, [rentals]);

  const activeNeeds = useMemo(
    () => needs.filter((n) => (n.statusTag || "") === "正在找"),
    [needs]
  );

  const activeTopics = useMemo(
    () => topics.filter((t) => (t.statusTag || "") === "進行中"),
    [topics]
  );

  // 即時查詢「看得到的」每筆商談事項各自的討論紀錄，取最新一筆
  const activeTopicIds = useMemo(() => activeTopics.map((t) => t.id), [activeTopics]);
  const latestLogByTopic = useLatestTopicLogs(activeTopicIds);

  const latestTopicUpdate = useMemo(() => {
    const dates = activeTopics.map((t) => latestLogByTopic[t.id]?.date).filter(Boolean);
    if (dates.length === 0) return null;
    return dates.sort().slice(-1)[0];
  }, [activeTopics, latestLogByTopic]);

  const propertyStatusCounts = useMemo(() => {
    const map = {};
    properties
      .filter((p) => (p.status || "active") !== "sold")
      .forEach((p) => {
        const tag = p.category || "未分類";
        map[tag] = (map[tag] || 0) + 1;
      });
    return Object.entries(map).sort((a, b) => b[1] - a[1]);
  }, [properties]);

  const activePropertiesCount = properties.filter((p) => (p.status || "active") !== "sold").length;

  const buyerContacts = contacts.filter((c) => (c.tags || []).includes("買方"));
  const sellerContacts = contacts.filter((c) => (c.tags || []).includes("賣方"));
  const recentBuyers = recentContacts.filter((c) => (c.tags || []).includes("買方"));
  const recentSellers = recentContacts.filter((c) => (c.tags || []).includes("賣方"));

  const pendingNotes = quickNotes.filter((n) => !n.done);
  const [noteMoveMenuId, setNoteMoveMenuId] = useState(null);

  const moveNoteTo = async (note, destination) => {
    const encoded = encodeURIComponent(note.text);
    await removeNote(note.id);
    if (destination === "buyer") navigate(`/buyers?draftNote=${encoded}`);
    else if (destination === "seller") navigate(`/sellers?newSeller=1&draftNote=${encoded}`);
    else if (destination === "topic") navigate(`/topics?draftNote=${encoded}`);
  };

  // 點客戶名字時，判斷要去買方頁面還是賣方頁面（賣方是搜尋結果，因為可能有好幾筆委託）
  const goToContact = (contact) => {
    const isBuyer = (contact.tags || []).includes("買方");
    const isSeller = (contact.tags || []).includes("賣方");
    if (isBuyer && isSeller) {
      setContactMenuId(contactMenuId === contact.id ? null : contact.id);
      return;
    }
    if (isSeller) {
      navigate(`/sellers?q=${encodeURIComponent(contact.name)}`);
    } else {
      navigate(`/buyers?open=${contact.id}`);
    }
  };

  return (
    <main>
      <section className="dashboard-intro">
        <div>
          <div className="eyebrow">WORKSPACE OVERVIEW</div>
          <h2>今天，先從重要的事開始。</h2>
          <p>客戶跟進、待辦事項與案件里程碑都整理在這裡。</p>
        </div>
        <div className="dashboard-date">
          <span>今日</span>
          <strong>{new Intl.DateTimeFormat("zh-TW", { month: "long", day: "numeric", weekday: "short" }).format(new Date())}</strong>
        </div>
      </section>
      <div className="kpi-row">
        <div className="panel kpi">
          <div className="label">待跟進客戶</div>
          <div className={`value ${overdueContacts.length > 0 ? "warn" : ""}`}>
            {overdueContacts.length}
          </div>
        </div>
        <div className="panel kpi">
          <div className="label">待辦事項</div>
          <div className="value">{pendingNotes.length}</div>
        </div>
        <div className="panel kpi">
          <div className="label">成交案件</div>
          <div className="value">{closedCases.length}</div>
        </div>
        <div className="panel kpi">
          <div className="label">近 14 天里程碑</div>
          <div className="value">{upcomingMilestones.length}</div>
        </div>
        <div className="panel kpi">
          <div className="label">租賃中</div>
          <div className="value">{rentals.filter((r) => r.status === "leased").length}</div>
        </div>
      </div>

      <div className="dashboard-primary-grid dashboard-primary-grid-wide">
        <div>
          <div className="section-title">跟進提醒</div>
          <div className="panel">
            {overdueContacts.length === 0 && (
              <div className="empty-state">
                目前沒有超過 {reminderDays} 天未聯絡的客戶
              </div>
            )}
            {overdueContacts.map((c) => (
              <div key={c.id} style={{ position: "relative" }}>
                <div className="reminder" onClick={() => goToContact(c)} style={{ cursor: "pointer" }}>
                  <div className="dot"></div>
                  <div className="txt">
                    <div className="t1" style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                      <span>{c.name}</span>
                      {(c.tags || []).includes("買方") && <span className="tag buyer" style={{ fontSize: 10 }}>買方</span>}
                      {(c.tags || []).includes("賣方") && <span className="tag" style={{ fontSize: 10, background: "#FFF4E5", color: "#9A5B00" }}>賣方</span>}
                    </div>
                    <div className="t2">
                      已 <span className="num">{c.days}</span> 天未聯絡
                      {c.lastContactNote && `・${c.lastContactNote}`}
                    </div>
                  </div>
                </div>
                {contactMenuId === c.id && (
                  <div style={{ display: "flex", gap: 8, padding: "0 0 10px 18px" }}>
                    <button className="btn ghost" style={{ fontSize: 11 }} onClick={() => navigate(`/buyers?open=${c.id}`)}>前往買方頁面</button>
                    <button className="btn ghost" style={{ fontSize: 11 }} onClick={() => navigate(`/sellers?q=${encodeURIComponent(c.name)}`)}>前往賣方頁面</button>
                  </div>
                )}
              </div>
            ))}
            <div style={{ marginTop: 14 }}>
              <Link to="/buyers" className="btn ghost" style={{ textDecoration: "none", display: "inline-block" }}>
                前往客戶名單
              </Link>
            </div>
          </div>
        </div>

        <div>
          <div className="section-title">
            待辦事項 <span className="mono" style={{ marginLeft: 6, color: "var(--muted)" }}>{pendingNotes.length}</span>
          </div>
          <div className="panel">
            {pendingNotes.length === 0 && <div className="empty-state">目前沒有待辦事項</div>}
            {pendingNotes.slice(0, 6).map((n) => (
              <div key={n.id} style={{ padding: "8px 0", borderBottom: "1px solid var(--border)" }}>
                <div style={{ display: "flex", alignItems: "flex-start", gap: 8 }}>
                  <input type="checkbox" checked={false} onChange={() => updateNote(n.id, { done: true })} style={{ marginTop: 3 }} />
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 13 }}>{n.text}</div>
                    <div style={{ display: "flex", gap: 8, marginTop: 4 }}>
                      <button
                        className="btn ghost"
                        style={{ fontSize: 11, padding: "3px 8px" }}
                        onClick={() => setNoteMoveMenuId(noteMoveMenuId === n.id ? null : n.id)}
                      >
                        移動到…
                      </button>
                      <button className="btn ghost" style={{ fontSize: 11, padding: "3px 8px" }} onClick={() => removeNote(n.id)}>
                        刪除
                      </button>
                    </div>
                    {noteMoveMenuId === n.id && (
                      <div style={{ display: "flex", gap: 6, marginTop: 6, flexWrap: "wrap" }}>
                        <button className="btn" style={{ fontSize: 11, padding: "3px 8px" }} onClick={() => moveNoteTo(n, "buyer")}>買方</button>
                        <button className="btn" style={{ fontSize: 11, padding: "3px 8px" }} onClick={() => moveNoteTo(n, "seller")}>賣方</button>
                        <button className="btn" style={{ fontSize: 11, padding: "3px 8px" }} onClick={() => moveNoteTo(n, "topic")}>商談事項</button>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            ))}
            <div style={{ marginTop: 14 }}>
              <Link to="/quicknotes" className="btn ghost" style={{ textDecoration: "none", display: "inline-block" }}>
                前往待辦事項
              </Link>
            </div>
          </div>
        </div>

        <div>
          <div className="section-title">商談事項</div>
          <div className="panel">
            {activeTopics.length === 0 && (
              <div className="empty-state">目前沒有「進行中」的商談事項</div>
            )}
            {activeTopics.slice(0, 5).map((t) => {
              const latestLog = latestLogByTopic[t.id];
              return (
                <div className="reminder" key={t.id} onClick={() => navigate(`/topics?open=${t.id}`)} style={{ cursor: "pointer" }}>
                  <div className="dot"></div>
                  <div className="txt">
                    <div className="t1">{t.title}{t.counterpart && `・${t.counterpart}`}</div>
                    {latestLog?.note && (
                      <div style={{ fontSize: 15, color: "var(--ink)", fontWeight: 500, marginTop: 4 }}>
                        <span className="mono" style={{ fontSize: 12, color: "var(--muted)", marginRight: 6 }}>
                          {formatDate(latestLog.date)}{latestLog.time && ` ${latestLog.time}`}
                        </span>
                        {latestLog.note}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
            <div style={{ marginTop: 14 }}>
              <Link to="/topics" className="btn ghost" style={{ textDecoration: "none", display: "inline-block" }}>
                前往商談事項
              </Link>
            </div>
          </div>
        </div>

        <div>
          <div className="section-title">近期里程碑</div>
          <div className="panel">
            {upcomingMilestones.length === 0 && (
              <div className="empty-state">近 14 天內沒有成交案件的里程碑</div>
            )}
            {upcomingMilestones.map((m) => (
              <div className="reminder" key={m.id} onClick={() => navigate(`/cases?open=${m.caseId}`)} style={{ cursor: "pointer" }}>
                <div className="dot" style={{ background: "var(--brass)" }}></div>
                <div className="txt">
                  <div className="t1">
                    {m.caseTitle}・{m.label}
                  </div>
                  <div className="t2">{formatDate(m.date)}</div>
                </div>
              </div>
            ))}
            <div style={{ marginTop: 14 }}>
              <Link to="/cases" className="btn ghost" style={{ textDecoration: "none", display: "inline-block" }}>
                前往案件看板
              </Link>
            </div>
          </div>
        </div>
      </div>

      <div className="dashboard-secondary-grid">
        <div>
          <div className="section-title" style={{ fontSize: 14 }}>
            客需・正在找 <span className="mono" style={{ marginLeft: 6, color: "var(--muted)" }}>{activeNeeds.length}</span>
          </div>
          <div className="panel">
            {activeNeeds.length === 0 && (
              <div style={{ fontSize: 13, color: "var(--muted)" }}>目前沒有「正在找」的客需</div>
            )}
            {activeNeeds.slice(0, 5).map((n) => (
              <div key={n.id} onClick={() => navigate(`/needs?open=${n.id}`)} style={{ padding: "8px 0", borderBottom: "1px solid var(--border)", fontSize: 13, cursor: "pointer" }}>
                <div style={{ fontWeight: 700 }}>{n.title}</div>
                <div style={{ fontSize: 11, color: "var(--muted)" }}>
                  {n.contactName}
                  {n.budget && <>・{n.budget} 萬</>}
                </div>
              </div>
            ))}
            <div style={{ marginTop: 12 }}>
              <Link to="/needs" className="btn ghost" style={{ textDecoration: "none", display: "inline-block", fontSize: 12 }}>
                前往客需看板
              </Link>
            </div>
          </div>
        </div>

        <div>
          <div className="section-title" style={{ fontSize: 14 }}>
            出租提醒 <span className="mono" style={{ marginLeft: 6, color: "var(--muted)" }}>{upcomingRentDue.length}</span>
          </div>
          <div className="panel">
            {upcomingRentDue.length === 0 && (
              <div style={{ fontSize: 13, color: "var(--muted)" }}>近期沒有需要留意的出租提醒</div>
            )}
            {upcomingRentDue.slice(0, 5).map((r) => (
              <div key={r.id} onClick={() => navigate(`/rentals/${r.id}`)} style={{ padding: "8px 0", borderBottom: "1px solid var(--border)", fontSize: 13, cursor: "pointer" }}>
                <div style={{ fontWeight: 700 }}>{r.title}</div>
                {r._kind === "rent" ? (
                  <div style={{ fontSize: 11, color: "var(--muted)" }}>
                    {r.until === 0 ? "今天收租" : r.until < 0 ? `已過期 ${-r.until} 天` : `${r.until} 天後收租`}
                    {r.tenantName && `・${r.tenantName}`}
                  </div>
                ) : (
                  <div style={{ fontSize: 11, color: "var(--brass)" }}>
                    🔔 業主追蹤・{r.until < 0 ? `已超過退租日 ${-r.until} 天` : r.until === 0 ? "今天預計退租" : `${r.until} 天後預計退租`}，看要不要重新招租
                  </div>
                )}
              </div>
            ))}
            <div style={{ marginTop: 12 }}>
              <Link to="/rentals" className="btn ghost" style={{ textDecoration: "none", display: "inline-block", fontSize: 12 }}>
                前往出租管理
              </Link>
            </div>
          </div>
        </div>

        <div>
          <div className="section-title" style={{ fontSize: 14 }}>
            買方・共 <span className="mono" style={{ marginLeft: 6, color: "var(--muted)" }}>{buyerContacts.length}</span>
          </div>
          <div className="panel">
            {recentBuyers.length === 0 && (
              <div style={{ fontSize: 13, color: "var(--muted)" }}>還沒有買方客戶</div>
            )}
            {recentBuyers.slice(0, 5).map((c) => (
              <div key={c.id} onClick={() => navigate(`/buyers?open=${c.id}`)} style={{ padding: "8px 0", borderBottom: "1px solid var(--border)", fontSize: 13, cursor: "pointer" }}>
                <div style={{ fontWeight: 700 }}>{c.name}</div>
                <div style={{ fontSize: 11, color: "var(--muted)" }}>{c.phone || "—"}</div>
              </div>
            ))}
            <div style={{ marginTop: 12 }}>
              <Link to="/buyers" className="btn ghost" style={{ textDecoration: "none", display: "inline-block", fontSize: 12 }}>
                前往買方名單
              </Link>
            </div>
          </div>
        </div>

        <div>
          <div className="section-title" style={{ fontSize: 14 }}>
            賣方・共 <span className="mono" style={{ marginLeft: 6, color: "var(--muted)" }}>{sellerContacts.length}</span>
          </div>
          <div className="panel">
            {recentSellers.length === 0 && (
              <div style={{ fontSize: 13, color: "var(--muted)" }}>還沒有賣方客戶</div>
            )}
            {recentSellers.slice(0, 5).map((c) => (
              <div key={c.id} onClick={() => navigate(`/sellers?q=${encodeURIComponent(c.name)}`)} style={{ padding: "8px 0", borderBottom: "1px solid var(--border)", fontSize: 13, cursor: "pointer" }}>
                <div style={{ fontWeight: 700 }}>{c.name}</div>
                <div style={{ fontSize: 11, color: "var(--muted)" }}>{c.phone || "—"}</div>
              </div>
            ))}
            <div style={{ marginTop: 12 }}>
              <Link to="/sellers" className="btn ghost" style={{ textDecoration: "none", display: "inline-block", fontSize: 12 }}>
                前往賣方名單
              </Link>
            </div>
          </div>
        </div>

        <div>
          <div className="section-title" style={{ fontSize: 14 }}>
            物件・在售 <span className="mono" style={{ marginLeft: 6, color: "var(--muted)" }}>{activePropertiesCount}</span>
          </div>
          <div className="panel">
            {propertyStatusCounts.length === 0 && (
              <div style={{ fontSize: 13, color: "var(--muted)" }}>還沒有物件資料</div>
            )}
            {propertyStatusCounts.map(([tag, count]) => (
              <div
                key={tag}
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  padding: "8px 0",
                  borderBottom: "1px solid var(--border)",
                  fontSize: 13,
                }}
              >
                <span>{tag}</span>
                <span className="mono">{count}</span>
              </div>
            ))}
            <div style={{ marginTop: 12 }}>
              <Link to="/properties" className="btn ghost" style={{ textDecoration: "none", display: "inline-block", fontSize: 12 }}>
                前往物件列表
              </Link>
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}
