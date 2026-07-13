import React, { useState, useMemo } from "react";
import { useCollection } from "../hooks/useCollection";
import { formatDate, todayStr } from "../lib/dates";

const emptyForm = { title: "", counterpart: "", statusTag: "進行中", notes: "" };

function TopicLogs({ topicId }) {
  const { items: logs, add, remove } = useCollection(`topics/${topicId}/logs`, "date");
  const [date, setDate] = useState(todayStr());
  const [note, setNote] = useState("");

  const sorted = [...logs].sort((a, b) => (a.date < b.date ? 1 : -1));

  const onAdd = async (e) => {
    e.preventDefault();
    if (!note.trim()) return;
    await add({ date, note });
    setNote("");
  };

  return (
    <div style={{ marginTop: 20, borderTop: "1px solid var(--border)", paddingTop: 16 }}>
      <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 10 }}>討論紀錄</div>
      <form onSubmit={onAdd} style={{ display: "flex", gap: 8, marginBottom: 16 }}>
        <input
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
          style={{
            width: 150,
            padding: "9px 10px",
            border: "1px solid var(--border)",
            borderRadius: 7,
            fontSize: 13,
          }}
        />
        <input
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="今天談了什麼、下一步是什麼…"
          style={{
            flex: 1,
            padding: "9px 10px",
            border: "1px solid var(--border)",
            borderRadius: 7,
            fontSize: 13,
          }}
        />
        <button className="btn" type="submit">
          新增紀錄
        </button>
      </form>

      {sorted.length === 0 && (
        <div style={{ fontSize: 13, color: "var(--muted)" }}>還沒有討論紀錄</div>
      )}
      {sorted.map((log) => (
        <div
          key={log.id}
          style={{
            display: "flex",
            gap: 12,
            padding: "10px 0",
            borderBottom: "1px solid var(--border)",
          }}
        >
          <div className="mono" style={{ fontSize: 12, color: "var(--muted)", width: 56, flexShrink: 0 }}>
            {formatDate(log.date)}
          </div>
          <div style={{ fontSize: 13, flex: 1 }}>{log.note}</div>
          <button
            onClick={() => remove(log.id)}
            style={{
              border: "none",
              background: "none",
              color: "var(--muted)",
              cursor: "pointer",
              fontSize: 12,
            }}
          >
            刪除
          </button>
        </div>
      ))}
    </div>
  );
}

export default function Topics() {
  const { items, add, update, remove } = useCollection("topics", "createdAt");
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState(emptyForm);

  const openNew = () => {
    setForm(emptyForm);
    setEditingId(null);
    setShowForm(true);
  };

  const openEdit = (item) => {
    setForm({ ...emptyForm, ...item });
    setEditingId(item.id);
    setShowForm(true);
  };

  const onSubmit = async (e) => {
    e.preventDefault();
    if (!form.title.trim()) return;
    if (editingId) {
      await update(editingId, form);
    } else {
      await add(form);
    }
    setShowForm(false);
  };

  const columns = useMemo(() => {
    const map = {};
    items.forEach((item) => {
      const tag = item.statusTag || "未分類";
      if (!map[tag]) map[tag] = [];
      map[tag].push(item);
    });
    return map;
  }, [items]);

  return (
    <main>
      <div className="top-actions">
        <div className="section-title">商談事項（{items.length}）</div>
        <button className="btn" onClick={openNew}>
          ＋ 新增事項
        </button>
      </div>

      {showForm && (
        <div className="panel" style={{ marginBottom: 24, maxWidth: 640 }}>
          <form className="form-grid" onSubmit={onSubmit}>
            <div className="form-field">
              <label>事項名稱</label>
              <input
                value={form.title}
                onChange={(e) => setForm({ ...form, title: e.target.value })}
                placeholder="例如：跟 OO 建設合作案洽談"
                required
              />
            </div>
            <div className="form-field">
              <label>對方</label>
              <input
                value={form.counterpart}
                onChange={(e) => setForm({ ...form, counterpart: e.target.value })}
                placeholder="例如：OO 建設 / 某某公司"
              />
            </div>
            <div className="form-field">
              <label>狀態標籤（自由輸入，例如：進行中／擱置／已結束）</label>
              <input
                value={form.statusTag}
                onChange={(e) => setForm({ ...form, statusTag: e.target.value })}
              />
            </div>
            <div className="form-field">
              <label>備註</label>
              <textarea
                rows="2"
                value={form.notes}
                onChange={(e) => setForm({ ...form, notes: e.target.value })}
                placeholder="這件事的背景、目標…"
              />
            </div>
            <div style={{ display: "flex", gap: 10 }}>
              <button className="btn" type="submit">
                {editingId ? "儲存變更" : "新增事項"}
              </button>
              <button className="btn ghost" type="button" onClick={() => setShowForm(false)}>
                取消
              </button>
              {editingId && (
                <button
                  className="btn danger"
                  type="button"
                  onClick={async () => {
                    if (window.confirm("確定要刪除這個事項嗎？（討論紀錄也會一併留在資料庫中，不會自動清除）")) {
                      await remove(editingId);
                      setShowForm(false);
                    }
                  }}
                >
                  刪除
                </button>
              )}
            </div>
          </form>

          {editingId && <TopicLogs topicId={editingId} />}
        </div>
      )}

      {items.length === 0 ? (
        <div className="panel">
          <div className="empty-state">
            <div className="big">還沒有商談事項</div>
            點右上角「＋ 新增事項」開始記錄
          </div>
        </div>
      ) : (
        <div className="board">
          {Object.entries(columns).map(([tag, list]) => (
            <div key={tag}>
              <div className="col-head">
                {tag} <span>{list.length}</span>
              </div>
              {list.map((item) => (
                <div
                  className="card"
                  key={item.id}
                  onClick={() => openEdit(item)}
                  style={{ cursor: "pointer" }}
                >
                  <div className="name">{item.title}</div>
                  <div className="meta">
                    {item.counterpart && <>對方：{item.counterpart}</>}
                  </div>
                </div>
              ))}
            </div>
          ))}
        </div>
      )}
    </main>
  );
}
