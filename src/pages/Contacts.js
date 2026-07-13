import React, { useState } from "react";
import { useCollection } from "../hooks/useCollection";
import { daysSince, formatDate, todayStr } from "../lib/dates";

const emptyForm = { name: "", phone: "", tags: [], notes: "", lastContactDate: todayStr() };

export default function Contacts() {
  const { items, add, update, remove } = useCollection("contacts", "name");
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState(emptyForm);

  const openNew = () => {
    setForm(emptyForm);
    setEditingId(null);
    setShowForm(true);
  };

  const openEdit = (item) => {
    setForm({
      name: item.name || "",
      phone: item.phone || "",
      tags: item.tags || [],
      notes: item.notes || "",
      lastContactDate: item.lastContactDate || todayStr(),
    });
    setEditingId(item.id);
    setShowForm(true);
  };

  const toggleTag = (tag) => {
    setForm((f) => ({
      ...f,
      tags: f.tags.includes(tag) ? f.tags.filter((t) => t !== tag) : [...f.tags, tag],
    }));
  };

  const onSubmit = async (e) => {
    e.preventDefault();
    if (!form.name.trim()) return;
    if (editingId) {
      await update(editingId, form);
    } else {
      await add(form);
    }
    setShowForm(false);
  };

  const logFollowUp = (item) => update(item.id, { lastContactDate: todayStr() });

  const sorted = [...items].sort((a, b) => {
    const da = daysSince(a.lastContactDate) ?? -999;
    const db_ = daysSince(b.lastContactDate) ?? -999;
    return db_ - da;
  });

  return (
    <main>
      <div className="top-actions">
        <div className="section-title">客戶名單（{items.length}）</div>
        <button className="btn" onClick={openNew}>
          ＋ 新增客戶
        </button>
      </div>

      {showForm && (
        <div className="panel" style={{ marginBottom: 24 }}>
          <form className="form-grid" onSubmit={onSubmit}>
            <div className="form-field">
              <label>姓名</label>
              <input
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="例如：王先生"
                required
              />
            </div>
            <div className="form-field">
              <label>電話</label>
              <input
                value={form.phone}
                onChange={(e) => setForm({ ...form, phone: e.target.value })}
                placeholder="09xx-xxx-xxx"
              />
            </div>
            <div className="form-field">
              <label>身分標籤</label>
              <div className="checkbox-row">
                <label>
                  <input
                    type="checkbox"
                    checked={form.tags.includes("賣方")}
                    onChange={() => toggleTag("賣方")}
                  />
                  賣方
                </label>
                <label>
                  <input
                    type="checkbox"
                    checked={form.tags.includes("買方")}
                    onChange={() => toggleTag("買方")}
                  />
                  買方
                </label>
              </div>
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
              <label>備註</label>
              <textarea
                rows="3"
                value={form.notes}
                onChange={(e) => setForm({ ...form, notes: e.target.value })}
                placeholder="需求、預算、偏好區域…"
              />
            </div>
            <div style={{ display: "flex", gap: 10 }}>
              <button className="btn" type="submit">
                {editingId ? "儲存變更" : "新增客戶"}
              </button>
              <button
                className="btn ghost"
                type="button"
                onClick={() => setShowForm(false)}
              >
                取消
              </button>
              {editingId && (
                <button
                  className="btn danger"
                  type="button"
                  onClick={async () => {
                    if (window.confirm("確定要刪除這位客戶嗎？")) {
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

      <div className="panel">
        {sorted.length === 0 && (
          <div className="empty-state">
            <div className="big">還沒有客戶資料</div>
            點右上角「＋ 新增客戶」開始建檔
          </div>
        )}
        {sorted.map((item) => {
          const days = daysSince(item.lastContactDate);
          return (
            <div className="list-row" key={item.id}>
              <div>
                <div className="name">{item.name}</div>
                <div className="meta">
                  {item.phone && <span>{item.phone}　</span>}
                  最後聯絡：{formatDate(item.lastContactDate)}
                  {days !== null && (
                    <span className="mono"> （{days} 天前）</span>
                  )}
                </div>
                <div style={{ marginTop: 6 }}>
                  {(item.tags || []).map((t) => (
                    <span key={t} className={`tag ${t === "買方" ? "buyer" : ""}`}>
                      {t}
                    </span>
                  ))}
                </div>
              </div>
              <div className="actions">
                <button className="btn ghost" onClick={() => logFollowUp(item)}>
                  記錄今日跟進
                </button>
                <button className="btn ghost" onClick={() => openEdit(item)}>
                  編輯
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </main>
  );
}
