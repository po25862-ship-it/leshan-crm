import React, { useState, useMemo } from "react";
import { useCollection } from "../hooks/useCollection";
import { formatDate, todayStr } from "../lib/dates";

const emptyForm = {
  title: "",
  contactName: "",
  propertyTitle: "",
  statusTag: "洽談中",
  lastContactDate: todayStr(),
  keyDateLabel: "",
  keyDate: "",
  notes: "",
};

export default function Cases() {
  const { items, add, update, remove } = useCollection("cases", "createdAt");
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
              <label>關聯物件</label>
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
              <label>備註</label>
              <textarea
                rows="3"
                value={form.notes}
                onChange={(e) => setForm({ ...form, notes: e.target.value })}
              />
            </div>
            <div style={{ display: "flex", gap: 10 }}>
              <button className="btn" type="submit">
                {editingId ? "儲存變更" : "新增案件"}
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
