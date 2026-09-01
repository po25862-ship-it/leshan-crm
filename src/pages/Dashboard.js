import React, { useMemo } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ArrowRight, Bot, Building2, CalendarDays, CheckCircle2, ChevronRight, Circle, Image as ImageIcon, ListTodo, Phone, Sparkles, Target, TrendingDown } from "lucide-react";
import { useSharedCollection } from "../hooks/useSharedCollection";
import { useNeedsCollection } from "../hooks/useNeedsCollection";
import { useCollection } from "../hooks/useCollection";
import { useAppointmentsForContacts } from "../hooks/useAppointmentsForContacts";
import { useAuth } from "../AuthContext";
import { daysSince, todayStr } from "../lib/dates";
import { matchPropertiesForNeed } from "../lib/needsMatch";
import { getPropertyImage, getRecentPriceDrop, timestampToMillis } from "../lib/propertyPresentation";

const MAIN_OWNER_UID = "KiYlsnWcChW5muRkG167r7Mi1132";
const isRecent = (value, days = 7) => timestampToMillis(value) >= Date.now() - days * 86400000;

function KpiCard({ icon: Icon, label, value, hint, tone, to }) {
  return <Link to={to} className={`os-kpi ${tone}`}><span className="os-kpi-icon"><Icon size={18} /></span><div><small>{label}</small><strong>{value}</strong><p>{hint}</p></div><ChevronRight size={15} /></Link>;
}

function AgentTile({ icon: Icon, name, job, status, tone }) {
  return <Link to="/agents" className={`os-agent-tile ${tone}`}><span><Icon size={18} /></span><div><strong>{name}</strong><small>{job}</small></div><b>{status}</b></Link>;
}

export default function Dashboard() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { items: contacts } = useSharedCollection("contacts", "name", user.uid);
  const { items: needs } = useNeedsCollection(user.uid);
  const { items: properties } = useCollection("properties", "createdAt");
  const isMainOwner = user.uid === MAIN_OWNER_UID;
  const { items: notes, update: updateNote } = useCollection("quickNotes", "createdAt", isMainOwner);
  const { items: aiTasks } = useSharedCollection("aiTasks", "createdAt", user.uid);
  const buyers = useMemo(() => contacts.filter((contact) => (contact.tags || []).includes("買方")), [contacts]);
  const buyerIds = useMemo(() => buyers.map((buyer) => buyer.id), [buyers]);
  const appointments = useAppointmentsForContacts(buyerIds);
  const activeNeeds = useMemo(() => needs.filter((need) => (need.statusTag || "正在找") === "正在找"), [needs]);
  const activeProperties = useMemo(() => properties.filter((property) => (property.status || "active") === "active"), [properties]);
  const matches = useMemo(() => activeNeeds.flatMap((need) => matchPropertiesForNeed(need, activeProperties).map((match) => ({ ...match, need }))).sort((a, b) => b.percent - a.percent), [activeNeeds, activeProperties]);
  const recentPropertyIds = useMemo(() => new Set(activeProperties.filter((property) => isRecent(property.createdAt)).map((property) => property.id)), [activeProperties]);
  const newMatches = matches.filter((match) => recentPropertyIds.has(match.property.id) && match.percent >= 80);
  const priceDrops = activeProperties.filter((property) => getRecentPriceDrop(property));
  const highMatches = matches.filter((match) => match.percent >= 90);
  const highOpportunity = useMemo(() => buyers.map((buyer) => {
    const buyerMatches = matches.filter((match) => match.need.contactId === buyer.id);
    return { ...buyer, days: daysSince(buyer.lastContactDate), maxPercent: buyerMatches[0]?.percent || 0 };
  }).filter((buyer) => buyer.maxPercent >= 80 && (buyer.days === null || buyer.days >= 3)), [buyers, matches]);
  const todayAppointments = appointments.filter((appointment) => appointment.date === todayStr());
  const pendingNotes = notes.filter((note) => !note.done);
  const activeAiTasks = aiTasks.filter((task) => task.status !== "completed");
  const todayTasks = [
    ...pendingNotes.slice(0, 3).map((note) => ({ id: `note-${note.id}`, title: note.text, meta: "個人待辦", note })),
    ...highOpportunity.slice(0, 2).map((buyer) => ({ id: `buyer-${buyer.id}`, title: `聯絡 ${buyer.name || "高機會買方"}`, meta: `${buyer.maxPercent}% 配對・${buyer.days === null ? "尚未聯絡" : `${buyer.days} 天未聯絡`}`, to: `/buyers?open=${buyer.id}` })),
    ...todayAppointments.slice(0, 2).map((appointment) => ({ id: `appointment-${appointment.id}`, title: appointment.propertyLabel || appointment.notes || "今日約訪", meta: `${appointment.time || "全天"} 行程`, to: "/calendar" })),
  ].slice(0, 6);
  const completeTask = (task) => task.note ? updateNote(task.note.id, { done: true }) : task.to && navigate(task.to);
  const date = new Date();

  return (
    <main className="leshan-os-dashboard">
      <section className="os-hero">
        <div><span className="os-eyebrow">LESHAN OS・每日作戰首頁</span><h2>今天最重要的事，已經幫你排好了。</h2><p>先完成高機會追蹤，再把物件交給 AI 隊伍處理。</p></div>
        <div className="os-date"><small>{new Intl.DateTimeFormat("zh-TW", { weekday: "long" }).format(date)}</small><strong>{new Intl.DateTimeFormat("zh-TW", { month: "2-digit", day: "2-digit" }).format(date)}</strong></div>
      </section>

      <section className="os-kpi-grid">
        <KpiCard icon={ListTodo} label="今日待完成" value={todayTasks.length} hint="工作與行程集中處理" tone="orange" to="/tasks" />
        <KpiCard icon={Phone} label="屋主／買方待追蹤" value={highOpportunity.length} hint="80%+ 配對且需要聯絡" tone="blue" to="/buyers" />
        <KpiCard icon={Sparkles} label="新物件可配對" value={newMatches.length} hint="近 7 天新增、配對 80%+" tone="green" to="/needs" />
        <KpiCard icon={Bot} label="AI 任務進行中" value={activeAiTasks.length} hint="查看待命與需要確認" tone="purple" to="/agents" />
      </section>

      <section className="os-main-grid">
        <div className="os-panel os-today-panel">
          <div className="os-panel-head"><div><span>TODAY'S MISSIONS</span><h3>今日任務</h3></div><Link to="/tasks">查看全部 <ArrowRight size={13} /></Link></div>
          <div className="os-task-list">
            {todayTasks.length === 0 && <div className="os-empty"><CheckCircle2 size={24} /><strong>今天的任務已清空</strong><span>可以主動開發新物件或安排買方追蹤。</span></div>}
            {todayTasks.map((task, index) => <button key={task.id} type="button" className="os-task-row" onClick={() => completeTask(task)}><span className="os-task-check">{task.note ? <Circle size={17} /> : <Target size={17} />}</span><span className="os-task-copy"><strong>{task.title}</strong><small>{task.meta}</small></span><span className="os-task-rank">{String(index + 1).padStart(2, "0")}</span></button>)}
          </div>
          <div className="os-quick-actions"><Link to="/properties"><Building2 size={15} />新增／管理物件</Link><Link to="/agents"><Sparkles size={15} />交給 AI 分析</Link><Link to="/calendar"><CalendarDays size={15} />安排今日行程</Link></div>
        </div>

        <div className="os-panel os-agents-panel">
          <div className="os-panel-head"><div><span>AI CREW</span><h3>AI 任務隊伍</h3></div><Link to="/agents">派新任務 <ArrowRight size={13} /></Link></div>
          <div className="os-agent-list">
            <AgentTile icon={TrendingDown} name="市場分析師" job="實價、競品、CMA" status="待命" tone="emerald" />
            <AgentTile icon={Target} name="情報員" job="競品與價格變化" status={priceDrops.length ? `${priceDrops.length} 筆` : "待命"} tone="blue" />
            <AgentTile icon={Sparkles} name="文案師" job="FB、Threads、591" status="待命" tone="orange" />
            <AgentTile icon={Phone} name="買方顧問" job="高機會客需配對" status={`${highMatches.length} 組`} tone="purple" />
          </div>
        </div>
      </section>

      <section className="os-panel os-properties-panel">
        <div className="os-panel-head"><div><span>ACTIVE PROPERTIES</span><h3>最近物件與高配對機會</h3></div><Link to="/properties">物件中心 <ArrowRight size={13} /></Link></div>
        <div className="os-property-grid">
          {highMatches.slice(0, 3).map((match) => {
            const image = getPropertyImage(match.property);
            return <button type="button" key={`${match.need.id}-${match.property.id}`} onClick={() => navigate(`/properties?open=${match.property.id}`)}><span className="os-property-image">{image ? <img src={image} alt={match.property.title || "物件"} /> : <span><ImageIcon size={21} />尚無照片</span>}<b>{match.percent}%</b></span><span className="os-property-copy"><small>{match.need.contactName || "高配對買方"}</small><strong>{match.property.title || "未命名物件"}</strong><em>{match.property.totalPrice ? `${Number(match.property.totalPrice).toLocaleString()} 萬` : "價格未填"}・{match.property.layout || "格局未填"}</em></span></button>;
          })}
          {highMatches.length === 0 && <div className="os-empty"><Building2 size={24} /><strong>還沒有 90% 以上配對</strong><span>新增物件或補齊客需條件後，這裡會自動出現機會。</span></div>}
        </div>
      </section>
    </main>
  );
}
