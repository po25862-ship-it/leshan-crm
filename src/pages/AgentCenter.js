import React, { useEffect, useMemo, useState } from "react";
import {
  BarChart3,
  Bot,
  Camera,
  CheckCircle2,
  Clock3,
  FileText,
  Radar,
  SearchCheck,
  Sparkles,
  Users,
} from "lucide-react";
import { useAuth } from "../AuthContext";
import { useCollection } from "../hooks/useCollection";
import { useSharedCollection } from "../hooks/useSharedCollection";

const AGENTS = [
  { id: "market", name: "市場分析師", job: "實價、價格區間與 CMA", icon: BarChart3, tone: "emerald" },
  { id: "intel", name: "情報員", job: "同社區競品與價格變化", icon: Radar, tone: "blue" },
  { id: "photo", name: "攝影師", job: "首圖、排序與素材建議", icon: Camera, tone: "purple" },
  { id: "copy", name: "文案師", job: "FB、Threads 與 591 文案", icon: FileText, tone: "orange" },
  { id: "developer", name: "開發助理", job: "屋主名單與追蹤開發", icon: SearchCheck, tone: "red" },
  { id: "buyer", name: "買方顧問", job: "從客需找高機會買方", icon: Users, tone: "rose" },
  { id: "full", name: "全隊出動", job: "分析、競品、文案、配對一次完成", icon: Sparkles, tone: "gold" },
];

const STATUS = {
  queued: { label: "待命中", icon: Clock3 },
  working: { label: "處理中", icon: Bot },
  review: { label: "需要確認", icon: SearchCheck },
  completed: { label: "已完成", icon: CheckCircle2 },
};

const propertyLabel = (property) => property?.title || property?.community || property?.address || "未命名物件";

const STATE_COPY = {
  idle: "待命中・整理桌面",
  queued: "收到新任務！",
  working: "正在全速處理…",
  review: "報告完成，等你確認",
  completed: "任務完成！",
};

function AgentCharacter({ agent, state, onSelect }) {
  const Icon = agent.icon;
  return (
    <button type="button" className={`crew-member ${agent.tone} role-${agent.id} state-${state}`} onClick={onSelect} aria-label={`選擇${agent.name}，目前${STATE_COPY[state]}`}>
      <span className="crew-speech">{STATE_COPY[state]}</span>
      <span className={`crew-avatar role-${agent.id}`} aria-hidden="true">
        <span className="crew-signal"><i /><i /><i /></span>
        <span className="crew-character">
          <i className="crew-role-hat"><b /><b /></i>
          <i className="crew-role-head"><b className="eye left" /><b className="eye right" /><b className="role-detail" /></i>
          <i className="crew-role-body"><Icon size={17} /></i>
          <i className="crew-role-arm left" /><i className="crew-role-arm right" />
          <i className="crew-role-leg left" /><i className="crew-role-leg right" />
          <i className="crew-role-prop"><Icon size={20} /></i>
          <i className="crew-role-effect"><b /><b /><b /></i>
        </span>
        <span className="crew-shadow" />
      </span>
      <strong>{agent.name}</strong>
      <small>{agent.job}</small>
    </button>
  );
}

export default function AgentCenter() {
  const { user } = useAuth();
  const { items: properties } = useCollection("properties", "createdAt");
  const { items: jobs, add, update } = useSharedCollection("aiTasks", "createdAt", user.uid);
  const [agentId, setAgentId] = useState("full");
  const [propertyId, setPropertyId] = useState("");
  const [instruction, setInstruction] = useState("");
  const [saving, setSaving] = useState(false);

  const activeProperties = useMemo(
    () => properties.filter((property) => (property.status || "active") === "active"),
    [properties]
  );
  const propertyMap = useMemo(
    () => Object.fromEntries(properties.map((property) => [property.id, property])),
    [properties]
  );
  const selectedAgent = AGENTS.find((agent) => agent.id === agentId) || AGENTS[0];
  const crewAgents = useMemo(() => AGENTS.filter((agent) => agent.id !== "full"), []);
  const crewStates = useMemo(() => Object.fromEntries(crewAgents.map((agent) => {
    const related = jobs.find((job) => job.status !== "completed" && (job.agentId === agent.id || job.agentId === "full"));
    return [agent.id, related?.status || "idle"];
  })), [jobs]);

  const dispatch = async (event) => {
    event.preventDefault();
    if (!propertyId) return;
    setSaving(true);
    try {
      await add({
        ownerUid: user.uid,
        sharedWith: [],
        agentId,
        agentName: selectedAgent.name,
        propertyId,
        propertyName: propertyLabel(propertyMap[propertyId]),
        instruction: instruction.trim(),
        status: "queued",
      });
      setInstruction("");
    } finally {
      setSaving(false);
    }
  };

  const advance = (job) => {
    const next = { queued: "working", working: "review", review: "completed", completed: "completed" }[job.status || "queued"];
    return update(job.id, { status: next });
  };

  useEffect(() => {
    document.body.classList.add("leshan-pixel-theme");
    return () => document.body.classList.remove("leshan-pixel-theme");
  }, []);

  return (
    <main className="agent-center pixel-agent-page">
      <section className="agent-hero">
        <div>
          <span>LESHAN AI CREW</span>
          <h2>把一間物件交給 AI 隊伍</h2>
          <p>選物件、選任務，再從工作佇列追蹤進度與確認結果。</p>
        </div>
        <div className="agent-hero-stat"><strong>{jobs.filter((job) => job.status !== "completed").length}</strong><span>進行中任務</span></div>
      </section>

      <section className="agent-hq">
        <div className="agent-hq-head">
          <div><span>LIVE OFFICE</span><h3>AI 公會辦公室</h3><p>角色動畫會跟著任務狀態變化；點角色即可直接派工。</p></div>
          <b><i /> 即時運作中</b>
        </div>
        <div className="agent-world">
          <div className="agent-world-sky" aria-hidden="true"><i /><i /><i /></div>
          <div className="agent-world-board" aria-hidden="true"><span>今日作戰</span><strong>{jobs.filter((job) => job.status !== "completed").length}</strong><small>ACTIVE MISSIONS</small></div>
          <div className="crew-grid">
            {crewAgents.map((agent) => <AgentCharacter key={agent.id} agent={agent} state={crewStates[agent.id]} onSelect={() => setAgentId(agent.id)} />)}
          </div>
          <div className="agent-world-floor" aria-hidden="true" />
        </div>
      </section>

      <section className="agent-layout">
        <form className="agent-dispatch-card" onSubmit={dispatch}>
          <div className="agent-section-head"><div><span>01</span><div><h3>選擇 AI 隊員</h3><p>每次派工都會保留物件與指令紀錄</p></div></div></div>
          <div className="agent-picker-grid">
            {AGENTS.map(({ id, name, job, icon: Icon, tone }) => (
              <button key={id} type="button" className={`agent-picker ${tone} ${agentId === id ? "active" : ""}`} onClick={() => setAgentId(id)}>
                <span><Icon size={18} /></span><strong>{name}</strong><small>{job}</small>
              </button>
            ))}
          </div>

          <div className="agent-form-grid">
            <label>
              <span>指定物件</span>
              <select value={propertyId} onChange={(event) => setPropertyId(event.target.value)} required>
                <option value="">請選擇要處理的物件</option>
                {activeProperties.map((property) => <option key={property.id} value={property.id}>{propertyLabel(property)}</option>)}
              </select>
            </label>
            <label>
              <span>補充指令（選填）</span>
              <textarea value={instruction} onChange={(event) => setInstruction(event.target.value)} placeholder="例如：以 A7 自住換屋族為主，先找 1500 萬內競品，再寫一版屋主回報。" />
            </label>
          </div>
          <button className="agent-dispatch-button" disabled={saving || !propertyId} type="submit"><Sparkles size={17} />{saving ? "派工中…" : `派給${selectedAgent.name}`}</button>
          <p className="agent-dispatch-note">第一版先完成派工、狀態與確認流程；各隊員的自動產出會依序接上現有實價、競品、配對與文案工具。</p>
        </form>

        <section className="agent-queue-card">
          <div className="agent-section-head"><div><span>02</span><div><h3>任務佇列</h3><p>待命 → 處理中 → 需要確認 → 完成</p></div></div></div>
          <div className="agent-job-list">
            {jobs.length === 0 && <div className="agent-empty"><Bot size={24} /><strong>AI 隊伍正在待命</strong><span>從左側選一間物件開始第一個任務。</span></div>}
            {jobs.slice(0, 12).map((job) => {
              const status = STATUS[job.status] || STATUS.queued;
              const StatusIcon = status.icon;
              return <article className={`agent-job status-${job.status || "queued"}`} key={job.id}>
                <span className="agent-job-icon"><StatusIcon size={16} /></span>
                <div><small>{job.agentName || "AI 隊員"}</small><strong>{job.propertyName || propertyLabel(propertyMap[job.propertyId])}</strong><p>{job.instruction || "依標準流程處理"}</p></div>
                <button type="button" disabled={job.status === "completed"} onClick={() => advance(job)}>{status.label}</button>
              </article>;
            })}
          </div>
        </section>
      </section>
    </main>
  );
}
