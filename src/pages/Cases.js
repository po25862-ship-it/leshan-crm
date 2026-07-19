import React, { useState, useMemo } from "react";
import { useCollection } from "../hooks/useCollection";
import { formatDate } from "../lib/dates";
import { withAgid } from "../lib/url";
import { useGoogleAuth } from "../GoogleAuthContext";
import RocDateHint from "./RocDateHint";

function nextMilestoneInfo(item) {
  const list = item.milestones || [];
  const undone = list.filter((m) => !m.done);
  if (list.length === 0) return { label: "未設定里程碑", milestone: null };
  if (undone.length === 0) return { label: "已完成", milestone: null };
  const sorted = [...undone].sort((a, b) => {
    if (!a.date && !b.date) return 0;
    if (!a.date) return 1;
    if (!b.date) return -1;
    return a.date < b.date ? -1 : 1;
  });
  const m = sorted[0];
  return { label: m.label || "未命名里程碑", milestone: m };
}

const defaultMilestones = () => [
  { label: "簽約日", date: "", done: false, syncToCalendar: false, googleEventId: null, googleEventLink: null },
  { label: "匯款日", date: "", done: false, syncToCalendar: false, googleEventId: null, googleEventLink: null },
  { label: "貸款撥款日", date: "", done: false, syncToCalendar: false, googleEventId: null, googleEventLink: null },
  { label: "交屋日", date: "", done: false, syncToCalendar: false, googleEventId: null, googleEventLink: null },
];

const emptyForm = {
  title: "",
  contactName: "",
  propertyId: "",
  propertyTitle: "",
  agentName: "",
  milestones: defaultMilestones(),
  notes: "",
};

export default function Cases() {
  const { items, add, update, remove } = useCollection("cases", "createdAt");
  const { items: properties } = useCollection("properties", "title");
  const { isConnected, createEvent, updateEvent, deleteEvent } = useGoogleAuth();
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState(emptyForm);
  const [syncing, setSyncing] = useState(false);

  const openNew = () => {
    setForm(emptyForm);
    setEditingId(null);
    setShowForm(true);
  };

  const openEdit = (item) => {
    setForm({
      ...emptyForm,
      ...item,
      milestones: item.milestones ? item.milestones.map((m) => ({ ...m })) : defaultMilestones(),
    });
    setEditingId(item.id);
    setShowForm(true);
  };

  const updateMilestone = (idx, key, val) => {
    const next = [...form.milestones];
    next[idx] = { ...next[idx], [key]: val };
    setForm({ ...form, milestones: next });
  };
  const addMilestone = () =>
    setForm({
      ...form,
      milestones: [
        ...form.milestones,
        { label: "", date: "", done: false, syncToCalendar: false, googleEventId: null, googleEventLink: null },
      ],
    });
  const removeMilestone = (idx) =>
    setForm({ ...form, milestones: form.milestones.filter((_, i) => i !== idx) });

  const onSubmit = async (e) => {
    e.preventDefault();
    if (!form.title.trim()) return;

    let workingForm = { ...form };

    if (isConnected) {
      setSyncing(true);
      const newMilestones = [];
      for (const m of form.milestones) {
        let milestone = { ...m };
        if (milestone.date) {
          const payload = {
            title: `${form.title}・${milestone.label || "里程碑"}`,
            date: milestone.date,
            notes: form.notes,
          };
          try {
            if (milestone.syncToCalendar) {
              if (milestone.googleEventId) {
                await updateEvent(milestone.googleEventId, payload);
              } else {
                const created = await createEvent(payload);
                milestone.googleEventId = created.id;
                milestone.googleEventLink = created.htmlLink;
              }
            } else if (milestone.googleEventId) {
              await deleteEvent(milestone.googleEventId);
              milestone.googleEventId = null;
              milestone.googleEventLink = null;
            }
          } catch (err) {
            console.error("Google 行事曆同步失敗", err);
          }
        }
        newMilestones.push(milestone);
      }
      workingForm.milestones = newMilestones;
      setSyncing(false);
    }

    if (editingId) {
      await update(editingId, workingForm);
    } else {
      await add(workingForm);
    }
    setShowForm(false);
  };

  const onDelete = async () => {
    if (!window.confirm("確定要刪除這筆案件嗎？")) return;
    for (const m of form.milestones) {
      if (m.googleEventId) {
        try {
          await deleteEvent(m.googleEventId);
        } catch {
          // 行事曆刪不掉也不擋
        }
      }
    }
    await remove(editingId);
    setShowForm(false);
  };

  const columns = useMemo(() => {
    const map = {};
    items.forEach((item) => {
      const key = nextMilestoneInfo(item).label;
      if (!map[key]) map[key] = [];
      map[key].push(item);
    });
    return map;
  }, [items]);

  const propertyOptions = properties.filter((p) => (p.status || "active") !== "sold");

  return (
    <main>
      <div className="top-actions">
        <div className="section-title">成交案件（{items.length}）</div>
        <button className="btn" onClick={openNew}>
          ＋ 新增成交案件
        </button>
      </div>

      {showForm && (
        <div className="panel" style={{ marginBottom: 24, maxWidth: 640 }}>
          <form className="form-grid" onSubmit={onSubmit}>
            <div className="form-field">
              <label>案件名稱</label>
              <input
                value={form.title}
                onChange={(e) => setForm({ ...form, title: e.target.value })}
                placeholder="例如：陳先生・A7 成交案"
                required
              />
            </div>
            <div className="form-field">
              <label>關聯客戶</label>
              <input value={form.contactName} onChange={(e) => setForm({ ...form, contactName: e.target.value })} placeholder="例如：陳先生" />
            </div>
            <div className="form-field">
              <label>關聯物件</label>
              <select
                value={form.propertyId || ""}
                onChange={(e) => {
                  const p = properties.find((x) => x.id === e.target.value);
                  setForm({ ...form, propertyId: e.target.value, propertyTitle: p ? p.title : form.propertyTitle });
                }}
              >
                <option value="">— 不連結物件清單 —</option>
                {propertyOptions.map((p) => (
                  <option key={p.id} value={p.id}>{p.title}{p.address ? `（${p.address}）` : ""}</option>
                ))}
              </select>
              {form.propertyId && (() => {
                const linked = properties.find((p) => p.id === form.propertyId);
                if (!linked) return null;
                return (
                  <div style={{ background: "#FAFAF8", border: "1px solid var(--border)", borderRadius: 8, padding: "10px 12px", marginTop: 8, fontSize: 12 }}>
                    <div style={{ color: "var(--muted)" }}>
                      即時同步自物件資料庫，改物件那邊的資料，這裡會自動跟著更新：
                    </div>
                    {linked.address && <div style={{ marginTop: 4 }}>地址：{linked.address}</div>}
                    {linked.totalPrice && <div>總價：{linked.totalPrice} 萬</div>}
                    {linked.websiteUrl && (
                      <div style={{ marginTop: 4 }}>
                        <a href={withAgid(linked.websiteUrl)} target="_blank" rel="noreferrer">開啟物件網頁</a>
                      </div>
                    )}
                  </div>
                );
              })()}
            </div>
            <div className="form-field">
              <label>物件名稱（未選擇時可手動輸入）</label>
              <input value={form.propertyTitle} onChange={(e) => setForm({ ...form, propertyTitle: e.target.value })} />
            </div>
            <div className="form-field">
              <label>業務負責（自由輸入，方便標註誰在跟進/合作）</label>
              <input value={form.agentName} onChange={(e) => setForm({ ...form, agentName: e.target.value })} placeholder="例如：劉昭佑、與 OO 合作" />
            </div>

            <div className="form-field">
              <label>里程碑（可自行新增，各自可選擇同步到 Google 行事曆）</label>
              {form.milestones.map((m, idx) => (
                <div key={idx} style={{ background: "#FAFAF8", border: "1px solid var(--border)", borderRadius: 8, padding: 12, marginBottom: 10 }}>
                  <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
                    <input
                      value={m.label}
                      onChange={(e) => updateMilestone(idx, "label", e.target.value)}
                      placeholder="里程碑名稱，例如：簽約日"
                      style={{ flex: 1 }}
                    />
                    <input type="date" value={m.date} onChange={(e) => updateMilestone(idx, "date", e.target.value)} style={{ width: 150 }} />
                    <button type="button" className="btn ghost" onClick={() => removeMilestone(idx)}>刪除</button>
                  </div>
                  <div style={{ display: "flex", gap: 16, alignItems: "center", fontSize: 12, flexWrap: "wrap" }}>
                    <RocDateHint date={m.date} />
                    <label style={{ display: "flex", alignItems: "center", gap: 6, cursor: "pointer" }}>
                      <input type="checkbox" checked={m.done} onChange={(e) => updateMilestone(idx, "done", e.target.checked)} />
                      已完成
                    </label>
                    {isConnected && m.date && (
                      <label style={{ display: "flex", alignItems: "center", gap: 6, cursor: "pointer" }}>
                        <input type="checkbox" checked={m.syncToCalendar} onChange={(e) => updateMilestone(idx, "syncToCalendar", e.target.checked)} />
                        同步到 Google 行事曆
                      </label>
                    )}
                    {m.googleEventLink && (
                      <a href={m.googleEventLink} target="_blank" rel="noreferrer" style={{ fontSize: 11 }}>📅 在行事曆開啟</a>
                    )}
                  </div>
                </div>
              ))}
              <button type="button" className="btn ghost" onClick={addMilestone}>＋ 新增里程碑</button>
              {!isConnected && (
                <div style={{ fontSize: 11, color: "var(--muted)", marginTop: 8 }}>
                  尚未連結 Google 帳號，前往「設定」頁面連結後即可同步里程碑日期
                </div>
              )}
            </div>

            <div className="form-field">
              <label>備註</label>
              <textarea rows="3" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
            </div>

            <div style={{ display: "flex", gap: 10 }}>
              <button className="btn" type="submit" disabled={syncing}>
                {syncing ? "同步中…" : editingId ? "儲存變更" : "新增案件"}
              </button>
              <button className="btn ghost" type="button" onClick={() => setShowForm(false)}>取消</button>
              {editingId && (
                <button className="btn danger" type="button" onClick={onDelete}>刪除</button>
              )}
            </div>
          </form>
        </div>
      )}

      {items.length === 0 ? (
        <div className="panel">
          <div className="empty-state">
            <div className="big">還沒有成交案件</div>
            點右上角「＋ 新增成交案件」開始追蹤
          </div>
        </div>
      ) : (
        <div className="board">
          {Object.entries(columns).map(([tag, colItems]) => (
            <div key={tag}>
              <div className="col-head">
                {tag} <span>{colItems.length}</span>
              </div>
              {colItems.map((item) => {
                const { milestone: nextM } = nextMilestoneInfo(item);
                return (
                  <div className="card" key={item.id} onClick={() => openEdit(item)} style={{ cursor: "pointer" }}>
                    <div className="name">
                      {nextM ? `${nextM.label}${nextM.date ? " " + formatDate(nextM.date) : ""}` : item.title}
                    </div>
                    <div className="meta">
                      案件：{item.title}<br />
                      {item.contactName && <>客戶：{item.contactName}<br /></>}
                      {item.propertyTitle && (
                        <>
                          物件：{item.propertyTitle}
                          {item.propertyId && (() => {
                            const linked = properties.find((p) => p.id === item.propertyId);
                            return linked?.address ? `（${linked.address}）` : "";
                          })()}
                          <br />
                        </>
                      )}
                      {item.agentName && <>業務：{item.agentName}<br /></>}
                      {(item.milestones || []).filter((m) => m.date).map((m, i) => (
                        <span key={i}>
                          {m.label}：{formatDate(m.date)}{m.done && " ✓"}{m.googleEventId && " 📅"}
                          <br />
                        </span>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      )}
    </main>
  );
}
