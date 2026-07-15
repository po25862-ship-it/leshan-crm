import React, { useState, useMemo } from "react";
import { useCollection } from "../hooks/useCollection";
import { formatDate, todayStr, daysUntil } from "../lib/dates";
import { useGoogleAuth } from "../GoogleAuthContext";

const TIMING_ORDER = ["已過期", "今天", "本週", "下週", "下下週", "更晚", "未排定"];

function timingBucket(dateStr) {
  if (!dateStr) return "未排定";
  const diff = daysUntil(dateStr);
  if (diff < 0) return "已過期";
  if (diff === 0) return "今天";
  if (diff <= 6) return "本週";
  if (diff <= 13) return "下週";
  if (diff <= 20) return "下下週";
  return "更晚";
}

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

const emptyTrackingForm = {
  type: "tracking",
  title: "",
  contactName: "",
  propertyId: "",
  propertyTitle: "",
  statusTag: "洽談中",
  agentName: "",
  nextContactDate: "",
  nextContactContent: "",
  nextContactSyncToCalendar: false,
  nextContactGoogleEventId: null,
  nextContactGoogleEventLink: null,
  notes: "",
};

const defaultMilestones = () => [
  { label: "簽約日", date: "", done: false, syncToCalendar: false, googleEventId: null, googleEventLink: null },
  { label: "匯款日", date: "", done: false, syncToCalendar: false, googleEventId: null, googleEventLink: null },
  { label: "貸款撥款日", date: "", done: false, syncToCalendar: false, googleEventId: null, googleEventLink: null },
  { label: "交屋日", date: "", done: false, syncToCalendar: false, googleEventId: null, googleEventLink: null },
];

const emptyClosedForm = {
  type: "closed",
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

  const [caseType, setCaseType] = useState("tracking"); // tracking | closed
  const [boardMode, setBoardMode] = useState("status"); // status | timing（僅追蹤案件用）
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState(emptyTrackingForm);
  const [syncing, setSyncing] = useState(false);

  const openNew = () => {
    setForm(caseType === "tracking" ? emptyTrackingForm : emptyClosedForm);
    setEditingId(null);
    setShowForm(true);
  };

  const openEdit = (item) => {
    setForm({
      ...(item.type === "closed" ? emptyClosedForm : emptyTrackingForm),
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

    if (form.type === "closed" && isConnected) {
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

    if (form.type === "tracking" && isConnected && form.nextContactDate) {
      setSyncing(true);
      const payload = {
        title: `${form.title}・下次聯絡`,
        date: form.nextContactDate,
        notes: form.nextContactContent,
      };
      try {
        if (form.nextContactSyncToCalendar) {
          if (form.nextContactGoogleEventId) {
            await updateEvent(form.nextContactGoogleEventId, payload);
          } else {
            const created = await createEvent(payload);
            workingForm.nextContactGoogleEventId = created.id;
            workingForm.nextContactGoogleEventLink = created.htmlLink;
          }
        } else if (form.nextContactGoogleEventId) {
          await deleteEvent(form.nextContactGoogleEventId);
          workingForm.nextContactGoogleEventId = null;
          workingForm.nextContactGoogleEventLink = null;
        }
      } catch (err) {
        console.error("Google 行事曆同步失敗", err);
      }
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
    if (form.type === "closed") {
      for (const m of form.milestones) {
        if (m.googleEventId) {
          try {
            await deleteEvent(m.googleEventId);
          } catch {
            // 行事曆刪不掉也不擋
          }
        }
      }
    }
    if (form.type === "tracking" && form.nextContactGoogleEventId) {
      try {
        await deleteEvent(form.nextContactGoogleEventId);
      } catch {
        // 行事曆刪不掉也不擋
      }
    }
    await remove(editingId);
    setShowForm(false);
  };

  const trackingItems = items.filter((c) => (c.type || "tracking") === "tracking");
  const closedItems = items.filter((c) => c.type === "closed");
  const list = caseType === "tracking" ? trackingItems : closedItems;

  const columns = useMemo(() => {
    const map = {};
    if (caseType === "tracking") {
      list.forEach((item) => {
        const key = boardMode === "status" ? item.statusTag || "未分類" : timingBucket(item.nextContactDate);
        if (!map[key]) map[key] = [];
        map[key].push(item);
      });
      if (boardMode === "timing") {
        const ordered = {};
        TIMING_ORDER.forEach((k) => {
          if (map[k]) ordered[k] = map[k];
        });
        return ordered;
      }
    } else {
      list.forEach((item) => {
        const key = nextMilestoneInfo(item).label;
        if (!map[key]) map[key] = [];
        map[key].push(item);
      });
    }
    return map;
  }, [list, caseType, boardMode]);

  const propertyOptions = properties.filter((p) => (p.status || "active") !== "sold");

  return (
    <main>
      <div className="top-actions">
        <div className="section-title">案件（{list.length}）</div>
        <button className="btn" onClick={openNew}>
          ＋ 新增{caseType === "tracking" ? "追蹤案件" : "成交案件"}
        </button>
      </div>

      {/* 案件類型切換 */}
      <div style={{ display: "flex", gap: 8, marginBottom: 14 }}>
        <button
          className={caseType === "tracking" ? "btn" : "btn ghost"}
          onClick={() => { setCaseType("tracking"); setShowForm(false); }}
        >
          追蹤案件（{trackingItems.length}）
        </button>
        <button
          className={caseType === "closed" ? "btn" : "btn ghost"}
          onClick={() => { setCaseType("closed"); setShowForm(false); }}
        >
          成交案件（{closedItems.length}）
        </button>
      </div>

      {/* 追蹤案件的看板模式切換 */}
      {caseType === "tracking" && (
        <div style={{ display: "flex", gap: 8, marginBottom: 18 }}>
          <button className={boardMode === "status" ? "btn ghost" : "btn ghost"} style={boardMode === "status" ? { borderColor: "var(--accent)", color: "var(--accent)", fontWeight: 700 } : {}} onClick={() => setBoardMode("status")}>
            依狀態標籤
          </button>
          <button className="btn ghost" style={boardMode === "timing" ? { borderColor: "var(--accent)", color: "var(--accent)", fontWeight: 700 } : {}} onClick={() => setBoardMode("timing")}>
            依下次聯絡時間
          </button>
        </div>
      )}

      {showForm && (
        <div className="panel" style={{ marginBottom: 24, maxWidth: 640 }}>
          <form className="form-grid" onSubmit={onSubmit}>
            <div className="form-field">
              <label>案件名稱</label>
              <input
                value={form.title}
                onChange={(e) => setForm({ ...form, title: e.target.value })}
                placeholder={form.type === "tracking" ? "例如：A7 重劃區・王先生委託案" : "例如：陳先生・A7 成交案"}
                required
              />
            </div>
            <div className="form-field">
              <label>關聯客戶</label>
              <input value={form.contactName} onChange={(e) => setForm({ ...form, contactName: e.target.value })} placeholder="例如：王先生" />
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
            </div>
            <div className="form-field">
              <label>物件名稱（未選擇時可手動輸入）</label>
              <input value={form.propertyTitle} onChange={(e) => setForm({ ...form, propertyTitle: e.target.value })} />
            </div>
            <div className="form-field">
              <label>業務負責（自由輸入，方便標註誰在跟進/合作）</label>
              <input value={form.agentName} onChange={(e) => setForm({ ...form, agentName: e.target.value })} placeholder="例如：劉昭佑、與 OO 合作" />
            </div>

            {form.type === "tracking" ? (
              <>
                <div className="form-field">
                  <label>狀態標籤（自由輸入）</label>
                  <input value={form.statusTag} onChange={(e) => setForm({ ...form, statusTag: e.target.value })} />
                </div>
                <div className="form-field">
                  <label>下次聯絡時間</label>
                  <input type="date" value={form.nextContactDate} onChange={(e) => setForm({ ...form, nextContactDate: e.target.value })} />
                </div>
                <div className="form-field">
                  <label>下次聯絡內容</label>
                  <textarea rows="2" value={form.nextContactContent} onChange={(e) => setForm({ ...form, nextContactContent: e.target.value })} placeholder="要聊什麼、要確認什麼…" />
                </div>
                {form.nextContactDate && (
                  <div style={{ background: "#FAFAF8", border: "1px solid var(--border)", borderRadius: 8, padding: "12px 14px" }}>
                    {isConnected ? (
                      <label style={{ display: "flex", alignItems: "center", gap: 10, cursor: "pointer", fontSize: 13 }}>
                        <input
                          type="checkbox"
                          checked={form.nextContactSyncToCalendar}
                          onChange={(e) => setForm({ ...form, nextContactSyncToCalendar: e.target.checked })}
                        />
                        <span>
                          <strong>同步到 Google 行事曆</strong>
                          <br />
                          <span style={{ color: "var(--muted)", fontSize: 11 }}>你自己選擇要不要把這個提醒放進行事曆</span>
                        </span>
                      </label>
                    ) : (
                      <div style={{ fontSize: 12, color: "var(--muted)" }}>尚未連結 Google 帳號，前往「設定」頁面連結後可同步</div>
                    )}
                    {form.nextContactGoogleEventLink && (
                      <div style={{ marginTop: 8, fontSize: 12 }}>
                        ✓ 已同步・
                        <a href={form.nextContactGoogleEventLink} target="_blank" rel="noreferrer">在 Google 行事曆開啟</a>
                      </div>
                    )}
                  </div>
                )}
              </>
            ) : (
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
                    <div style={{ display: "flex", gap: 16, alignItems: "center", fontSize: 12 }}>
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
            )}

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

      {list.length === 0 ? (
        <div className="panel">
          <div className="empty-state">
            <div className="big">還沒有{caseType === "tracking" ? "追蹤案件" : "成交案件"}</div>
            點右上角「＋ 新增」開始追蹤
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
                const { label: nextLabel, milestone: nextM } = item.type === "closed" ? nextMilestoneInfo(item) : { label: null, milestone: null };
                return (
                <div className="card" key={item.id} onClick={() => openEdit(item)} style={{ cursor: "pointer" }}>
                  <div className="name">
                    {item.type === "closed" && nextM ? `${nextM.label}${nextM.date ? " " + formatDate(nextM.date) : ""}` : item.title}
                  </div>
                  <div className="meta">
                    {item.type === "closed" && <>案件：{item.title}<br /></>}
                    {item.contactName && <>客戶：{item.contactName}<br /></>}
                    {item.propertyTitle && <>物件：{item.propertyTitle}<br /></>}
                    {item.agentName && <>業務：{item.agentName}<br /></>}
                    {item.type === "tracking" ? (
                      <>
                        {item.nextContactDate && (
                          <>下次聯絡：{formatDate(item.nextContactDate)}{item.nextContactContent && `・${item.nextContactContent}`}</>
                        )}
                      </>
                    ) : (
                      <>
                        {(item.milestones || []).filter((m) => m.date).map((m, i) => (
                          <span key={i}>
                            {m.label}：{formatDate(m.date)}{m.done && " ✓"}{m.googleEventId && " 📅"}
                            <br />
                          </span>
                        ))}
                      </>
                    )}
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
