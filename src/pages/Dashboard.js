import React, { useMemo } from "react";
import { Link } from "react-router-dom";
import { useCollection } from "../hooks/useCollection";
import { useDoc } from "../hooks/useDoc";
import { daysSince, daysUntil, formatDate } from "../lib/dates";

export default function Dashboard() {
  const { items: contacts } = useCollection("contacts", "name");
  const { items: recentContacts } = useCollection("contacts", "createdAt");
  const { items: cases } = useCollection("cases", "createdAt");
  const { items: needs } = useCollection("needs", "createdAt");
  const { items: topics } = useCollection("topics", "createdAt");
  const { items: properties } = useCollection("properties", "createdAt");
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

  const upcomingKeyDates = useMemo(
    () =>
      cases
        .filter((c) => c.keyDate)
        .map((c) => ({ ...c, until: daysUntil(c.keyDate) }))
        .filter((c) => c.until !== null && c.until >= -1 && c.until <= 14)
        .sort((a, b) => a.until - b.until),
    [cases]
  );

  const activeNeeds = useMemo(
    () => needs.filter((n) => (n.statusTag || "") === "正在找"),
    [needs]
  );

  const activeTopics = useMemo(
    () => topics.filter((t) => (t.statusTag || "") === "進行中"),
    [topics]
  );

  const propertyStatusCounts = useMemo(() => {
    const map = {};
    properties
      .filter((p) => !p.sold)
      .forEach((p) => {
        const tag = p.category || "未分類";
        map[tag] = (map[tag] || 0) + 1;
      });
    return Object.entries(map).sort((a, b) => b[1] - a[1]);
  }, [properties]);

  const activePropertiesCount = properties.filter((p) => !p.sold).length;

  return (
    <main>
      <div className="kpi-row">
        <div className="panel kpi">
          <div className="label">待跟進客戶</div>
          <div className={`value ${overdueContacts.length > 0 ? "warn" : ""}`}>
            {overdueContacts.length}
          </div>
        </div>
        <div className="panel kpi">
          <div className="label">進行中案件</div>
          <div className="value">{cases.length}</div>
        </div>
        <div className="panel kpi">
          <div className="label">近 14 天關鍵日期</div>
          <div className="value">{upcomingKeyDates.length}</div>
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 24, marginBottom: 28 }}>
        <div>
          <div className="section-title">跟進提醒</div>
          <div className="panel">
            {overdueContacts.length === 0 && (
              <div className="empty-state">
                目前沒有超過 {reminderDays} 天未聯絡的客戶
              </div>
            )}
            {overdueContacts.map((c) => (
              <div className="reminder" key={c.id}>
                <div className="dot"></div>
                <div className="txt">
                  <div className="t1">{c.name}</div>
                  <div className="t2">
                    已 <span className="num">{c.days}</span> 天未聯絡
                  </div>
                </div>
              </div>
            ))}
            <div style={{ marginTop: 14 }}>
              <Link to="/contacts" className="btn ghost" style={{ textDecoration: "none", display: "inline-block" }}>
                前往客戶名單
              </Link>
            </div>
          </div>
        </div>

        <div>
          <div className="section-title">近期關鍵日期</div>
          <div className="panel">
            {upcomingKeyDates.length === 0 && (
              <div className="empty-state">近 14 天內沒有委託到期／簽約等關鍵日期</div>
            )}
            {upcomingKeyDates.map((c) => (
              <div className="reminder" key={c.id}>
                <div className="dot" style={{ background: "var(--brass)" }}></div>
                <div className="txt">
                  <div className="t1">
                    {c.title}・{c.keyDateLabel}
                  </div>
                  <div className="t2">
                    {formatDate(c.keyDate)}
                    {c.keyTime && ` ${c.keyTime}`}
                  </div>
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

      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 20 }}>
        <div>
          <div className="section-title" style={{ fontSize: 14 }}>
            客需・正在找 <span className="mono" style={{ marginLeft: 6, color: "var(--muted)" }}>{activeNeeds.length}</span>
          </div>
          <div className="panel">
            {activeNeeds.length === 0 && (
              <div style={{ fontSize: 13, color: "var(--muted)" }}>目前沒有「正在找」的客需</div>
            )}
            {activeNeeds.slice(0, 5).map((n) => (
              <div key={n.id} style={{ padding: "8px 0", borderBottom: "1px solid var(--border)", fontSize: 13 }}>
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
            商談事項・進行中 <span className="mono" style={{ marginLeft: 6, color: "var(--muted)" }}>{activeTopics.length}</span>
          </div>
          <div className="panel">
            {activeTopics.length === 0 && (
              <div style={{ fontSize: 13, color: "var(--muted)" }}>目前沒有「進行中」的商談事項</div>
            )}
            {activeTopics.slice(0, 5).map((t) => (
              <div key={t.id} style={{ padding: "8px 0", borderBottom: "1px solid var(--border)", fontSize: 13 }}>
                <div style={{ fontWeight: 700 }}>{t.title}</div>
                {t.counterpart && <div style={{ fontSize: 11, color: "var(--muted)" }}>對方：{t.counterpart}</div>}
              </div>
            ))}
            <div style={{ marginTop: 12 }}>
              <Link to="/topics" className="btn ghost" style={{ textDecoration: "none", display: "inline-block", fontSize: 12 }}>
                前往商談事項
              </Link>
            </div>
          </div>
        </div>

        <div>
          <div className="section-title" style={{ fontSize: 14 }}>
            客戶・共 <span className="mono" style={{ marginLeft: 6, color: "var(--muted)" }}>{contacts.length}</span>
          </div>
          <div className="panel">
            {recentContacts.length === 0 && (
              <div style={{ fontSize: 13, color: "var(--muted)" }}>還沒有客戶資料</div>
            )}
            {recentContacts.slice(0, 5).map((c) => (
              <div key={c.id} style={{ padding: "8px 0", borderBottom: "1px solid var(--border)", fontSize: 13 }}>
                <div style={{ fontWeight: 700 }}>{c.name}</div>
                <div style={{ fontSize: 11, color: "var(--muted)" }}>
                  {(c.tags || []).join("、") || "—"}
                </div>
              </div>
            ))}
            <div style={{ marginTop: 12 }}>
              <Link to="/contacts" className="btn ghost" style={{ textDecoration: "none", display: "inline-block", fontSize: 12 }}>
                前往客戶名單
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
