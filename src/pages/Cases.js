import React, { useState, useMemo } from "react";
import { useCollection } from "../hooks/useCollection";
import { formatDate, todayStr } from "../lib/dates";
import { useGoogleAuth } from "../GoogleAuthContext";

const emptyForm = {
  title: "",
  contactName: "",
  propertyId: "",
  propertyTitle: "",
  statusTag: "洽談中",
  lastContactDate: todayStr(),
  keyDateLabel: "",
  keyDate: "",
  keyTime: "",
  notes: "",
  syncToCalendar: false,
  googleEventId: null,
  googleEventLink: null,
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
    setForm({ ...emptyForm, ...item });
    setEditingId(item.id);
    setShowForm(true);
  };

  const onSubmit = async (e) => {
    e.preventDefault();
    if (!form.title.trim()) return;

    let savedId = editingId;
    if (editingId) {
      await update(editingId, form);
    } else {
      const ref = await add(form);
      savedId = ref.id;
    }

    // 處理 Google 行事曆同步
    if (isConnected && form.keyDate) {
      setSyncing(true);
      try {
        const eventPayload = {
          title: `${form.title}・${form.keyDateLabel || "關鍵日期"}`,
          date: form.keyDate,
          time: form.keyTime || null,
          notes: form.notes,
        };
        if (form.syncToCalendar) {
          if (form.googleEventId) {
            await updateEvent(form.googleEventId, eventPayload);
          } else {
            const created = await createEvent(eventPayload);
            await update(savedId, {
              googleEventId: created.id,
              googleEventLink: created.htmlLink,
            });
          }
        } else if (form.googleEventId) {
          await deleteEvent(form.googleEventId);
          await update(savedId, { googleEventId: null, googleEventLink: null });
        }
      } catch (err) {
        console.error("Google 行事曆同步失敗", err);
        alert("Google 行事曆同步失敗，案件本身已儲存成功，可以稍後在編輯畫面重試同步。");
      }
      setSyncing(false);
    }

    setShowForm(false);
  };

  // 依自由標籤分欄
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
        <div className="section-title">案件看板（{items.length}）</div>
        <button className="btn" onClick={openNew}>
          ＋ 新增案件
        </button>
      </div>

      {showForm && (
        <div className="panel" style={{ marginBottom: 24 }}>
          <form className="form-grid" onSubmit={onSubmit}>
            <div className="form-field">
              <label>案件名稱</label>
              <input
                value={form.title}
                onChange={(e) => setForm({ ...form, title: e.target.value })}
                placeholder="例如：A7 重劃區・王先生委託案"
                required
              />
            </div>
            <div className="form-field">
              <label>關聯客戶</label>
              <input
                value={form.contactName}
                onChange={(e) => setForm({ ...form, contactName: e.target.value })}
                placeholder="例如：王先生"
              />
            </div>
            <div className="form-field">
              <label>關聯物件（可從物件清單挑選，或留白手動輸入下方名稱）</label>
              <select
                value={form.propertyId || ""}
                onChange={(e) => {
                  const p = properties.find((x) => x.id === e.target.value);
                  setForm({
                    ...form,
                    propertyId: e.target.value,
                    propertyTitle: p ? p.title : form.propertyTitle,
                  });
                }}
              >
                <option value="">— 不連結物件清單 —</option>
                {properties.filter((p) => !p.sold).map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.title}{p.address ? `（${p.address}）` : ""}
                  </option>
                ))}
              </select>
            </div>
            <div className="form-field">
              <label>物件名稱（未從上方選擇時，可手動輸入）</label>
              <input
                value={form.propertyTitle}
                onChange={(e) => setForm({ ...form, propertyTitle: e.target.value })}
                placeholder="例如：A7 某社區 3F"
              />
            </div>
            <div className="form-field">
              <label>狀態標籤（自由輸入，例如：洽談中／已委託／帶看中／簽約）</label>
              <input
                value={form.statusTag}
                onChange={(e) => setForm({ ...form, statusTag: e.target.value })}
              />
            </div>
            <div className="form-field">
              <label>最後聯絡日期</label>
              <input
                type="date"
                value={form.lastContactDate}
                onChange={(e) => setForm({ ...form, lastContactDate: e.target.value })}
              />
            </div>
            <div className="form-field">
              <label>關鍵日期標籤（選填，例如：委託到期／簽約日）</label>
              <input
                value={form.keyDateLabel}
                onChange={(e) => setForm({ ...form, keyDateLabel: e.target.value })}
              />
            </div>
            <div className="form-field">
              <label>關鍵日期（選填）</label>
              <input
                type="date"
                value={form.keyDate}
                onChange={(e) => setForm({ ...form, keyDate: e.target.value })}
              />
            </div>
            <div className="form-field">
              <label>時間（選填，不填則視為整天事件）</label>
              <input
                type="time"
                value={form.keyTime}
                onChange={(e) => setForm({ ...form, keyTime: e.target.value })}
              />
            </div>

            {form.keyDate && (
              <div className="toggle-row" style={{ background:"#FAFAF8", border:"1px solid var(--border)", borderRadius:8, padding:"12px 14px" }}>
                {isConnected ? (
                  <label style={{ display: "flex", alignItems: "center", gap: 10, cursor: "pointer", fontSize: 13 }}>
                    <input
                      type="checkbox"
                      checked={form.syncToCalendar}
                      onChange={(e) => setForm({ ...form, syncToCalendar: e.target.checked })}
                    />
                    <span>
                      <strong>同步到 Google 行事曆</strong>
                      <br />
                      <span style={{ color: "var(--muted)", fontSize: 11 }}>
                        開啟後會在你的行事曆建立對應事件
                      </span>
                    </span>
                  </label>
                ) : (
                  <div style={{ fontSize: 12, color: "var(--muted)" }}>
                    尚未連結 Google 帳號，前往「設定」頁面連結後即可同步關鍵日期。
                  </div>
                )}
                {form.googleEventLink && (
                  <div style={{ marginTop: 8, fontSize: 12 }}>
                    ✓ 已同步・
                    <a href={form.googleEventLink} target="_blank" rel="noreferrer">
                      在 Google 行事曆開啟
                    </a>
                  </div>
                )}
              </div>
            )}

            <div className="form-field">
              <label>備註</label>
              <textarea
                rows="3"
                value={form.notes}
                onChange={(e) => setForm({ ...form, notes: e.target.value })}
              />
            </div>
            <div style={{ display: "flex", gap: 10 }}>
              <button className="btn" type="submit" disabled={syncing}>
                {syncing ? "同步中…" : editingId ? "儲存變更" : "新增案件"}
              </button>
              <button className="btn ghost" type="button" onClick={() => setShowForm(false)}>
                取消
              </button>
              {editingId && (
                <button
                  className="btn danger"
                  type="button"
                  onClick={async () => {
                    if (window.confirm("確定要刪除這個案件嗎？")) {
                      if (form.googleEventId) {
                        try {
                          await deleteEvent(form.googleEventId);
                        } catch {
                          // 行事曆事件刪不掉也不擋案件刪除
                        }
                      }
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
        </div>
      )}

      {items.length === 0 ? (
        <div className="panel">
          <div className="empty-state">
            <div className="big">還沒有案件</div>
            點右上角「＋ 新增案件」開始追蹤
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
                <div className="card" key={item.id} onClick={() => openEdit(item)} style={{ cursor: "pointer" }}>
                  <div className="name">{item.title}</div>
                  <div className="meta">
                    {item.contactName && <>客戶：{item.contactName}<br /></>}
                    {item.propertyTitle && <>物件：{item.propertyTitle}<br /></>}
                    最後聯絡：{formatDate(item.lastContactDate)}
                    {item.keyDateLabel && item.keyDate && (
                      <>
                        <br />
                        {item.keyDateLabel}：{formatDate(item.keyDate)}
                        {item.keyTime && ` ${item.keyTime}`}
                        {item.googleEventId && " 📅"}
                      </>
                    )}
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
