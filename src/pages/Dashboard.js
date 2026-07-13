import React, { useMemo } from "react";
import { Link } from "react-router-dom";
import { useCollection } from "../hooks/useCollection";
import { useDoc } from "../hooks/useDoc";
import { daysSince, daysUntil, formatDate } from "../lib/dates";

export default function Dashboard() {
  const { items: contacts } = useCollection("contacts", "name");
  const { items: cases } = useCollection("cases", "createdAt");
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

  const activeCasesCount = cases.length;

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
          <div className="value">{activeCasesCount}</div>
        </div>
        <div className="panel kpi">
          <div className="label">近 14 天關鍵日期</div>
          <div className="value">{upcomingKeyDates.length}</div>
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 24 }}>
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
                  <div className="t2">{formatDate(c.keyDate)}</div>
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
    </main>
  );
}
