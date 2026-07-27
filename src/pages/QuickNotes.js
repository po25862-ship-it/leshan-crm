import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useCollection } from "../hooks/useCollection";

export default function QuickNotes() {
  const { items, add, update, remove } = useCollection("quickNotes", "createdAt");
  const navigate = useNavigate();
  const [moveMenuId, setMoveMenuId] = useState(null);
  const [editingId, setEditingId] = useState(null);
  const [editText, setEditText] = useState("");
  const [newText, setNewText] = useState("");

  const pending = items.filter((n) => !n.done);
  const done = items.filter((n) => n.done);

  const toggleDone = (item) => update(item.id, { done: !item.done });

  const submitNew = async (e) => {
    e.preventDefault();
    if (!newText.trim()) return;
    await add({ text: newText.trim(), done: false, source: "manual" });
    setNewText("");
  };

  const startEdit = (item) => {
    setEditingId(item.id);
    setEditText(item.text);
    setMoveMenuId(null);
  };
  const saveEdit = async (item) => {
    if (!editText.trim()) return;
    await update(item.id, { text: editText.trim() });
    setEditingId(null);
  };
  const cancelEdit = () => setEditingId(null);

  const formatTime = (ts) => {
    if (!ts) return "";
    try {
      const d = ts.toDate ? ts.toDate() : new Date(ts);
      return d.toLocaleString("zh-TW", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" });
    } catch {
      return "";
    }
  };

  const moveTo = async (note, destination) => {
    const encoded = encodeURIComponent(note.text);
    await remove(note.id);
    if (destination === "buyer") {
      navigate(`/buyers?draftNote=${encoded}`);
    } else if (destination === "seller") {
      navigate(`/sellers?newSeller=1&draftNote=${encoded}`);
    } else if (destination === "topic") {
      navigate(`/topics?draftNote=${encoded}`);
    }
  };

  return (
    <main>
      <div className="top-actions">
        <div className="section-title">待辦（{pending.length}）</div>
      </div>
      <div style={{ fontSize: 12, color: "var(--muted)", marginBottom: 18 }}>
        對 Siri 說「嗨 Siri，新增待辦」講內容，會自動出現在這裡。語音辨識有錯字的話，點「修改文字」可以直接編輯。點「移動到…」可以把這筆待辦轉成買方／賣方／商談事項的正式記錄。
      </div>

      <form onSubmit={submitNew} style={{ display: "flex", gap: 8, marginBottom: 20 }}>
        <input
          value={newText}
          onChange={(e) => setNewText(e.target.value)}
          placeholder="輸入待辦內容…"
          style={{ flex: 1, maxWidth: 400, padding: "10px 12px", border: "1px solid var(--border)", borderRadius: 7, fontSize: 14 }}
        />
        <button className="btn" type="submit">＋ 新增待辦</button>
      </form>

      <div className="panel" style={{ marginBottom: 20 }}>
        {pending.length === 0 && <div className="empty-state">目前沒有待辦事項</div>}
        {pending.map((n) => (
          <div key={n.id} className="list-row" style={{ flexDirection: "column", alignItems: "stretch" }}>
            <div style={{ display: "flex", justifyContent: "space-between", width: "100%" }}>
              <div style={{ flex: 1 }}>
                {editingId === n.id ? (
                  <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                    <input
                      value={editText}
                      onChange={(e) => setEditText(e.target.value)}
                      autoFocus
                      style={{ flex: 1, padding: "8px 10px", border: "1px solid var(--border)", borderRadius: 7, fontSize: 14 }}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") saveEdit(n);
                        if (e.key === "Escape") cancelEdit();
                      }}
                    />
                  </div>
                ) : (
                  <label style={{ display: "flex", alignItems: "center", gap: 10, cursor: "pointer" }}>
                    <input type="checkbox" checked={false} onChange={() => toggleDone(n)} />
                    <span>
                      <div className="name" style={{ fontSize: 14 }}>{n.text}</div>
                      <div className="meta">{formatTime(n.createdAt)}{n.source === "siri" && "　🎙️ Siri"}</div>
                    </span>
                  </label>
                )}
              </div>
              <div className="actions">
                {editingId === n.id ? (
                  <>
                    <button className="btn" onClick={() => saveEdit(n)}>儲存</button>
                    <button className="btn ghost" onClick={cancelEdit}>取消</button>
                  </>
                ) : (
                  <>
                    <button className="btn ghost" onClick={() => startEdit(n)}>修改文字</button>
                    <button className="btn ghost" onClick={() => setMoveMenuId(moveMenuId === n.id ? null : n.id)}>
                      移動到…
                    </button>
                    <button className="btn ghost" onClick={() => remove(n.id)}>刪除</button>
                  </>
                )}
              </div>
            </div>
            {moveMenuId === n.id && (
              <div style={{ display: "flex", gap: 8, marginTop: 10, marginLeft: 26, flexWrap: "wrap" }}>
                <button className="btn" onClick={() => moveTo(n, "buyer")}>移到買方</button>
                <button className="btn" onClick={() => moveTo(n, "seller")}>移到賣方</button>
                <button className="btn" onClick={() => moveTo(n, "topic")}>移到商談事項</button>
                <button className="btn ghost" onClick={() => setMoveMenuId(null)}>取消</button>
              </div>
            )}
          </div>
        ))}
      </div>

      {done.length > 0 && (
        <>
          <div className="section-title" style={{ fontSize: 14 }}>已完成（{done.length}）</div>
          <div className="panel">
            {done.map((n) => (
              <div key={n.id} className="list-row" style={{ opacity: 0.6 }}>
                <div>
                  <label style={{ display: "flex", alignItems: "center", gap: 10, cursor: "pointer" }}>
                    <input type="checkbox" checked={true} onChange={() => toggleDone(n)} />
                    <span>
                      <div className="name" style={{ fontSize: 14, textDecoration: "line-through" }}>{n.text}</div>
                      <div className="meta">{formatTime(n.createdAt)}</div>
                    </span>
                  </label>
                </div>
                <div className="actions">
                  <button className="btn ghost" onClick={() => remove(n.id)}>刪除</button>
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </main>
  );
}
