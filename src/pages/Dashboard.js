import React, { useMemo } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Phone, Sparkles, TrendingDown, Target, CalendarDays, ArrowUpRight, Image as ImageIcon } from "lucide-react";
import { useSharedCollection } from "../hooks/useSharedCollection";
import { useNeedsCollection } from "../hooks/useNeedsCollection";
import { useCollection } from "../hooks/useCollection";
import { useAppointmentsForContacts } from "../hooks/useAppointmentsForContacts";
import { useAuth } from "../AuthContext";
import { daysSince, todayStr } from "../lib/dates";
import { matchPropertiesForNeed } from "../lib/needsMatch";
import { getPropertyImage, timestampToMillis } from "../lib/propertyPresentation";

const isRecent = (value, days = 7) => timestampToMillis(value) >= Date.now() - days * 86400000;

function KpiCard({ icon: Icon, label, value, hint, tone, to }) {
  return <Link to={to} className={`deal-kpi ${tone || ""}`}><div className="deal-kpi-icon"><Icon size={19} /></div><div><span>{label}</span><strong>{value}</strong><small>{hint}</small></div><ArrowUpRight size={16} className="deal-kpi-arrow" /></Link>;
}

export default function Dashboard() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { items: contacts } = useSharedCollection("contacts", "name", user.uid);
  const { items: needs } = useNeedsCollection(user.uid);
  const { items: properties } = useCollection("properties", "createdAt");
  const buyers = useMemo(() => contacts.filter((contact) => (contact.tags || []).includes("買方")), [contacts]);
  const buyerIds = useMemo(() => buyers.map((buyer) => buyer.id), [buyers]);
  const appointments = useAppointmentsForContacts(buyerIds);
  const activeNeeds = useMemo(() => needs.filter((need) => (need.statusTag || "正在找") === "正在找"), [needs]);
  const activeProperties = useMemo(() => properties.filter((property) => (property.status || "active") === "active"), [properties]);

  const matches = useMemo(() => activeNeeds.flatMap((need) =>
    matchPropertiesForNeed(need, activeProperties).map((match) => ({ ...match, need }))
  ).sort((a, b) => b.percent - a.percent), [activeNeeds, activeProperties]);

  const contactMap = useMemo(() => Object.fromEntries(contacts.map((contact) => [contact.id, contact])), [contacts]);
  const recentProperties = useMemo(() => new Set(activeProperties.filter((property) => isRecent(property.createdAt, 7)).map((property) => property.id)), [activeProperties]);
  const newMatches = matches.filter((match) => recentProperties.has(match.property.id) && match.percent >= 80);
  const priceDrops = useMemo(() => activeProperties.filter((property) => {
    const change = property.lastPriceChange;
    return change && Number(change.newPrice) < Number(change.oldPrice) && isRecent(change.date, 14);
  }), [activeProperties]);
  const highMatches = matches.filter((match) => match.percent >= 90);

  const buyerOpportunities = useMemo(() => buyers.map((buyer) => {
    const buyerNeeds = activeNeeds.filter((need) => need.contactId === buyer.id);
    const buyerMatches = matches.filter((match) => match.need.contactId === buyer.id);
    const newCount = buyerMatches.filter((match) => recentProperties.has(match.property.id)).length;
    const maxPercent = buyerMatches[0]?.percent || 0;
    return { ...buyer, days: daysSince(buyer.lastContactDate), needsCount: buyerNeeds.length, matchesCount: buyerMatches.length, newCount, maxPercent };
  }).filter((buyer) => buyer.needsCount > 0).sort((a, b) => (b.maxPercent + Math.min(b.days || 0, 30)) - (a.maxPercent + Math.min(a.days || 0, 30))), [buyers, activeNeeds, matches, recentProperties]);

  const highOpportunity = buyerOpportunities.filter((buyer) => buyer.maxPercent >= 80 && (buyer.days === null || buyer.days >= 3));
  const todayAppointments = appointments.filter((appointment) => appointment.date === todayStr()).sort((a, b) => String(a.time || "").localeCompare(String(b.time || "")));

  return (
    <main className="deal-workbench">
      <section className="workbench-hero">
        <div><div className="eyebrow">DEAL WORKBENCH</div><h2>今天最接近成交的機會</h2><p>先聯絡高機會買方，再處理新物件與降價後的重新配對。</p></div>
        <div className="workbench-date"><span>{new Intl.DateTimeFormat("zh-TW", { weekday: "long" }).format(new Date())}</span><strong>{new Intl.DateTimeFormat("zh-TW", { month: "2-digit", day: "2-digit" }).format(new Date())}</strong></div>
      </section>

      <section className="deal-kpi-grid">
        <KpiCard icon={Phone} label="待聯絡高機會買方" value={highOpportunity.length} hint="依配對與未聯絡天數排序" tone="orange" to="/buyers" />
        <KpiCard icon={Sparkles} label="新符合物件" value={newMatches.length} hint="近 7 天新增、配對 80%+" tone="blue" to="/needs" />
        <KpiCard icon={TrendingDown} label="降價重配" value={priceDrops.length} hint="近 14 天降價案件" tone="green" to="/properties" />
        <KpiCard icon={Target} label="90%+ 配對" value={highMatches.length} hint="優先安排介紹與帶看" tone="purple" to="/needs" />
      </section>

      <section className="workbench-grid">
        <div className="workbench-card workbench-buyers">
          <div className="workbench-card-head"><div><span>PRIORITY BUYERS</span><h3>待聯絡高機會買方</h3></div><Link to="/buyers">查看全部</Link></div>
          {highOpportunity.length === 0 ? <div className="workbench-empty">目前沒有同時符合「80%+ 配對」與待聯絡條件的買方。</div> : highOpportunity.slice(0, 7).map((buyer, index) => (
            <button type="button" className="priority-buyer-row" key={buyer.id} onClick={() => navigate(`/buyers?open=${buyer.id}`)}>
              <span className="priority-rank">{String(index + 1).padStart(2, "0")}</span>
              <span className="buyer-avatar">{buyer.name?.slice(0, 1) || "客"}</span>
              <span className="priority-buyer-name"><strong>{buyer.name}</strong><small>{buyer.phone || "未填電話"}・{buyer.days === null ? "尚未聯絡" : `${buyer.days} 天未聯絡`}</small></span>
              <span className="priority-metrics"><b>{buyer.needsCount}</b><small>客需</small></span>
              <span className="priority-metrics"><b>{buyer.newCount}</b><small>新配對</small></span>
              <span className="priority-score">{buyer.maxPercent}%</span>
            </button>
          ))}
        </div>

        <div className="workbench-card today-schedule">
          <div className="workbench-card-head"><div><span>TODAY</span><h3>今日行程</h3></div><Link to="/calendar">行事曆</Link></div>
          {todayAppointments.length === 0 ? <div className="workbench-empty">今天尚未安排帶看或約訪。</div> : todayAppointments.slice(0, 8).map((appointment) => (
            <div className="schedule-row" key={`${appointment.parentId}-${appointment.id}`}><div className="schedule-time">{appointment.time || "全天"}</div><div><strong>{contactMap[appointment.parentId]?.name || appointment.contactName || "買方行程"}</strong><span>{appointment.propertyLabel || appointment.notes || "約帶看"}</span></div></div>
          ))}
          <Link className="schedule-add" to="/calendar"><CalendarDays size={15} /> 安排新行程</Link>
        </div>
      </section>

      <section className="workbench-card latest-matches">
        <div className="workbench-card-head"><div><span>TOP MATCHES</span><h3>最新高配對物件</h3></div><Link to="/needs">前往配對推薦</Link></div>
        <div className="dashboard-match-grid">
          {highMatches.slice(0, 6).map((match) => {
            const image = getPropertyImage(match.property);
            return <button type="button" className="dashboard-match-card" key={`${match.need.id}-${match.property.id}`} onClick={() => navigate(`/properties?open=${match.property.id}`)}>
              <div className="dashboard-match-image">{image ? <img src={image} alt={`${match.property.title} 物件照片`} /> : <span><ImageIcon size={22} />尚未上傳照片</span>}<b>{match.percent}%</b></div>
              <div className="dashboard-match-copy"><small>{match.need.contactName || "未指定買方"}・{match.need.title}</small><strong>{match.property.title}</strong><span>{match.property.totalPrice ? `${Number(match.property.totalPrice).toLocaleString()} 萬` : "價格未填"}・{match.property.layout || "格局未填"}・{match.property.floor || "樓層未填"}</span><em>{match.reasons.slice(0, 3).join("・")}</em></div>
            </button>;
          })}
          {highMatches.length === 0 && <div className="workbench-empty">目前沒有 90% 以上配對，請先建立客需或補齊物件資料。</div>}
        </div>
      </section>
    </main>
  );
}
