import React, { useEffect, useMemo } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Award, BarChart3, Bell, Bot, Building2, CalendarDays, Camera, CheckCircle2, Circle, Coins, FileText, Home, Map, Megaphone, Menu, Plus, Radar, SearchCheck, Settings, Sparkles, Target, Trophy, UserPlus, Users } from "lucide-react";
import { useSharedCollection } from "../hooks/useSharedCollection";
import { useNeedsCollection } from "../hooks/useNeedsCollection";
import { useCollection } from "../hooks/useCollection";
import { useAppointmentsForContacts } from "../hooks/useAppointmentsForContacts";
import { useAuth } from "../AuthContext";
import { daysSince, todayStr } from "../lib/dates";
import { matchPropertiesForNeed } from "../lib/needsMatch";
import { timestampToMillis } from "../lib/propertyPresentation";

const MAIN_OWNER_UID = "KiYlsnWcChW5muRkG167r7Mi1132";
const recent = (value, days = 7) => timestampToMillis(value) >= Date.now() - days * 86400000;
const CREW = [
  { id: "market", name: "市場分析師", skill: "CMA 行情分析", icon: BarChart3, tone: "gold" },
  { id: "intel", name: "情報員", skill: "實價登錄搜尋", icon: Radar, tone: "green" },
  { id: "photo", name: "攝影師", skill: "照片整理優化", icon: Camera, tone: "blue" },
  { id: "copy", name: "文案師", skill: "FB／社群文案", icon: FileText, tone: "orange" },
  { id: "developer", name: "開發助理", skill: "屋主追蹤開發", icon: UserPlus, tone: "red" },
  { id: "buyer", name: "買方顧問", skill: "客需配對", icon: Users, tone: "purple" },
];

function PixelAvatar({ icon: Icon, tone, state = "idle" }) {
  return <span className={`pixel-avatar ${tone} state-${state}`} aria-hidden="true"><i className="pixel-hair" /><i className="pixel-face"><b /><b /></i><i className="pixel-body"><Icon size={17} /></i><i className="pixel-tool" /><i className="pixel-shadow" /></span>;
}

function StatCard({ icon: Icon, label, value, goal, tone = "green" }) {
  const percent = Math.min(100, Math.round((Number(value) / Math.max(Number(goal), 1)) * 100));
  return <article className={`pixel-stat ${tone}`}><span><Icon size={16} /></span><strong>{value}</strong><small>{label}</small><div><i style={{ width: `${percent}%` }} /></div><em>目標 {goal}</em></article>;
}

function CrewCard({ agent, job, onOpen }) {
  const status = job?.status || "idle";
  const copy = { idle: "待命中", queued: "準備中", working: "執行中", review: "需處理", completed: "已完成" }[status] || "待命中";
  return <button type="button" className={`pixel-crew-card ${agent.tone}`} onClick={onOpen}><strong>{agent.name}</strong><small>{agent.skill}</small><PixelAvatar icon={agent.icon} tone={agent.tone} state={status} /><b className={`pixel-status ${status}`}>{copy}</b><p>{job?.propertyName || (status === "idle" ? "點我開始任務" : "任務處理中")}</p><div><i style={{ width: status === "working" ? "68%" : status === "review" || status === "completed" ? "100%" : status === "queued" ? "25%" : "0%" }} /></div></button>;
}

export default function Dashboard() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { items: contacts } = useSharedCollection("contacts", "name", user.uid);
  const { items: needs } = useNeedsCollection(user.uid);
  const { items: properties } = useCollection("properties", "createdAt");
  const { items: notes, update: updateNote } = useCollection("quickNotes", "createdAt", user.uid === MAIN_OWNER_UID);
  const { items: aiTasks } = useSharedCollection("aiTasks", "createdAt", user.uid);
  const buyers = useMemo(() => contacts.filter((contact) => (contact.tags || []).includes("買方")), [contacts]);
  const appointments = useAppointmentsForContacts(useMemo(() => buyers.map((buyer) => buyer.id), [buyers]));
  const activeNeeds = useMemo(() => needs.filter((need) => (need.statusTag || "正在找") === "正在找"), [needs]);
  const activeProperties = useMemo(() => properties.filter((property) => (property.status || "active") === "active"), [properties]);
  const matches = useMemo(() => activeNeeds.flatMap((need) => matchPropertiesForNeed(need, activeProperties).map((match) => ({ ...match, need }))).sort((a, b) => b.percent - a.percent), [activeNeeds, activeProperties]);
  const highMatches = matches.filter((match) => match.percent >= 90);
  const newProperties = activeProperties.filter((property) => recent(property.createdAt));
  const todayAppointments = appointments.filter((appointment) => appointment.date === todayStr());
  const opportunities = useMemo(() => buyers.map((buyer) => {
    const best = matches.find((match) => match.need.contactId === buyer.id)?.percent || 0;
    return { ...buyer, best, days: daysSince(buyer.lastContactDate) };
  }).filter((buyer) => buyer.best >= 80 && (buyer.days === null || buyer.days >= 3)), [buyers, matches]);
  const pendingNotes = notes.filter((note) => !note.done);
  const activeAiTasks = aiTasks.filter((job) => job.status !== "completed");
  const crewJobs = Object.fromEntries(CREW.map((agent) => [agent.id, activeAiTasks.find((job) => job.agentId === agent.id || job.agentId === "full")]));
  const tasks = [
    ...pendingNotes.slice(0, 2).map((note) => ({ id: `n-${note.id}`, label: note.text, progress: "待完成", note, icon: Circle })),
    ...opportunities.slice(0, 2).map((buyer) => ({ id: `b-${buyer.id}`, label: `聯繫 ${buyer.name || "高機會買方"}`, progress: `${buyer.best}% 配對`, to: `/buyers?open=${buyer.id}`, icon: Users })),
    ...todayAppointments.slice(0, 2).map((item) => ({ id: `a-${item.id}`, label: item.propertyLabel || item.notes || "今日帶看", progress: item.time || "全天", to: "/calendar", icon: Home })),
    { id: "social", label: "發布今日社群內容", progress: "0 / 2", to: "/line", icon: Megaphone },
  ].slice(0, 6);
  const levelProgress = Math.min(100, 35 + tasks.length * 6 + Math.min(highMatches.length, 10));

  useEffect(() => {
    document.body.classList.add("leshan-pixel-theme");
    return () => document.body.classList.remove("leshan-pixel-theme");
  }, []);

  const runTask = (task) => task.note ? updateNote(task.note.id, { done: true }) : task.to && navigate(task.to);

  return <main className="pixel-os">
    <section className="pixel-profile-bar">
      <PixelAvatar icon={Home} tone="gold" />
      <div className="pixel-profile-copy"><h2>Leshan OS</h2><strong>房仲公會任務中心</strong><div><span>Lv.35</span><i><b style={{ width: `${levelProgress}%` }} /></i><em>{levelProgress}%</em></div></div>
      <div className="pixel-office"><Award size={34} /><span><strong>台灣房屋 捷運樂善直營店</strong><small>經紀人：劉昭佑｜桃市經字第 001240 號</small></span></div>
      <div className="pixel-top-actions"><button><Bell size={18} /><b>{activeAiTasks.length}</b></button><button><Trophy size={18} /></button><Link to="/tools"><Settings size={18} /></Link></div>
    </section>

    <section className="pixel-panel pixel-performance">
      <header><h3>⚔ 今日戰績</h3><span>資料即時同步</span></header>
      <div className="pixel-stat-grid">
        <StatCard icon={Users} label="開發名單" value={contacts.length} goal={Math.max(contacts.length, 30)} />
        <StatCard icon={SearchCheck} label="待聯繫客戶" value={opportunities.length} goal={Math.max(opportunities.length, 10)} tone="teal" />
        <StatCard icon={UserPlus} label="新物件" value={newProperties.length} goal={3} tone="blue" />
        <StatCard icon={Building2} label="在售委託" value={activeProperties.length} goal={Math.max(activeProperties.length, 5)} tone="orange" />
        <StatCard icon={CalendarDays} label="今日帶看" value={todayAppointments.length} goal={5} tone="purple" />
        <StatCard icon={Target} label="90% 配對" value={highMatches.length} goal={Math.max(highMatches.length, 10)} tone="gold" />
        <StatCard icon={Coins} label="AI 任務" value={activeAiTasks.length} goal={5} tone="cyan" />
      </div>
    </section>

    <section className="pixel-panel pixel-crew-section">
      <header><h3>🧩 AI 任務隊伍</h3><span>角色狀態與任務佇列同步</span><Link to="/agents">查看全部任務 ›</Link></header>
      <div className="pixel-crew-grid">{CREW.map((agent) => <CrewCard key={agent.id} agent={agent} job={crewJobs[agent.id]} onOpen={() => navigate(`/agents?crew=${agent.id}`)} />)}</div>
    </section>

    <section className="pixel-middle-grid">
      <div className="pixel-panel pixel-missions">
        <header><h3>📜 今日任務</h3><Link to="/tasks">全部任務 ›</Link></header>
        <div>{tasks.map((task, index) => { const Icon = task.icon; return <button type="button" key={task.id} onClick={() => runTask(task)}><Icon size={16} /><span><strong>{task.label}</strong><small>{task.progress}</small></span><em className={index === 0 ? "working" : index === 1 ? "done" : "queued"}>{index === 1 ? "✓ 完成" : index === 0 ? "執行中" : "待開始"}</em></button>; })}<Link className="pixel-add-task" to="/tasks"><Plus size={14} />新增自訂任務</Link></div>
      </div>

      <div className="pixel-panel pixel-map-card">
        <header><h3>🗺 案件地圖</h3><Link to="/properties">查看物件 ›</Link></header>
        <div className="pixel-region-tabs"><b>A7</b><span>A8</span><span>A9</span><span>林口</span><span>龜山</span></div>
        <div className="pixel-map"><i className="road r1" /><i className="road r2" /><i className="road r3" /><b className="map-point p1">🏠<small>樂善一路</small></b><b className="map-point p2">🏡<small>文青國小</small></b><b className="map-point p3">👤<small>客需配對</small></b><b className="map-point p4">🏢<small>A7 體大站</small></b><b className="map-point p5">📍<small>新委託</small></b><div className="map-legend"><span>在售案件 <b>{activeProperties.length}</b></span><span>客需需求 <b>{activeNeeds.length}</b></span><span>高配對 <b>{highMatches.length}</b></span></div></div>
      </div>
    </section>

    <section className="pixel-bottom-grid">
      <div className="pixel-panel pixel-guild"><header><h3>🛡 房仲公會</h3></header><div><Award size={46} /><span><strong>公會等級 Lv.12</strong><small>{1200 + highMatches.length * 40} / 2,400 EXP</small><i><b style={{ width: `${Math.min(100, 50 + highMatches.length)}%` }} /></i></span></div><ol><li><b>1.</b> 劉昭佑（你）<strong>{1680 + tasks.length * 20} EXP</strong></li><li><b>2.</b> 本月團隊<strong>1,240 EXP</strong></li><li><b>3.</b> AI 隊伍<strong>{980 + activeAiTasks.length * 30} EXP</strong></li></ol></div>
      <div className="pixel-panel pixel-achievements"><header><h3>🏅 成就牆</h3></header><div><p><Award size={22} /><span><strong>CMA 大師</strong><small>完成高配對分析任務</small></span><b>進行中</b></p><p><Trophy size={22} /><span><strong>社群達人</strong><small>完成本週社群任務</small></span><b>挑戰中</b></p><p><Target size={22} /><span><strong>成交獵人</strong><small>持續累積帶看與配對</small></span><b>{todayAppointments.length} / 5</b></p></div></div>
      <div className="pixel-panel pixel-shortcuts"><header><h3>✨ 快捷行動</h3></header><div><Link to="/properties"><Home size={20} />新增物件</Link><Link to="/needs"><UserPlus size={20} />新增客需</Link><Link to="/matching"><BarChart3 size={20} />CMA 分析</Link><Link to="/line"><Megaphone size={20} />社群發文</Link><Link to="/agents"><Bot size={20} />AI 任務中心</Link><Link to="/more"><Menu size={20} />更多工具</Link></div></div>
    </section>
  </main>;
}
