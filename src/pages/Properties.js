import React, { useState } from "react";
import { useCollection } from "../hooks/useCollection";

const emptyForm = {
  title: "",
  floor: "",
  parkingHas: false,
  parkingCount: "",
  age: "",
  area: "",
  ownerContactId: "",
  ownerContactName: "",
  statusTag: "",
  notes: "",
  customFields: [],
};

export default function Properties() {
  const { items, add, update, remove } = useCollection("properties", "createdAt");
  const { items: contacts } = useCollection("contacts", "name");
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState(emptyForm);
  const [keyword, setKeyword] = useState("");

  const openNew = () => {
    setForm(emptyForm);
    setEditingId(null);
    setShowForm(true);
  };

  const openEdit = (item) => {
    setForm({ ...emptyForm, ...item, customFields: item.customFields || [] });
    setEditingId(item.id);
    setShowForm(true);
  };

  const onOwnerChange = (contactId) => {
    const c = contacts.find((x) => x.id === contactId);
    setForm({ ...form, ownerContactId: contactId, ownerContactName: c ? c.name : "" });
  };

  const addCustomField = () => {
    setForm({ ...form, customFields: [...form.customFields, { label: "", value: "" }] });
  };

  const updateCustomField = (idx, key, val) => {
    const next = [...form.customFields];
    next[idx] = { ...next[idx], [key]: val };
    setForm({ ...form, customFields: next });
  };

  const removeCustomField = (idx) => {
    setForm({ ...form, customFields: form.customFields.filter((_, i) => i !== idx) });
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

  const filtered = items.filter((p) => {
    if (!keyword.trim()) return true;
    const k = keyword.trim();
    return (
      (p.title || "").includes(k) ||
      (p.ownerContactName || "").includes(k) ||
      (p.statusTag || "").includes(k)
    );
  });

  return (
    <main>
      <div className="top-actions">
        <div className="section-title">物件（{items.length}）</div>
        <button className="btn" onClick={openNew}>
          ＋ 新增物件
        </button>
      </div>

      <div style={{ marginBottom: 18 }}>
        <input
          value={keyword}
          onChange={(e) => setKeyword(e.target.value)}
          placeholder="搜尋地址、屋主、狀態…"
          style={{
            width: "100%",
            maxWidth: 360,
            padding: "10px 12px",
            border: "1px solid var(--border)",
            borderRadius: 7,
            fontSize: 14,
          }}
        />
      </div>

      {showForm && (
        <div className="panel" style={{ marginBottom: 24, maxWidth: 640 }}>
          <form className="form-grid" onSubmit={onSubmit}>
            <div className="form-field">
              <label>地址／坐落</label>
              <input
                value={form.title}
                onChange={(e) => setForm({ ...form, title: e.target.value })}
                placeholder="例如：A7 重劃區 OO 社區 3F"
                required
              />
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
              <div className="form-field">
                <label>樓層</label>
                <input
                  value={form.floor}
                  onChange={(e) => setForm({ ...form, floor: e.target.value })}
                  placeholder="例如：3F/12F"
                />
              </div>
              <div className="form-field">
                <label>面積（坪數）</label>
                <input
                  value={form.area}
                  onChange={(e) => setForm({ ...form, area: e.target.value })}
                  placeholder="例如：38"
                />
              </div>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 14 }}>
              <div className="form-field">
                <label>車位</label>
                <select
                  value={form.parkingHas ? "yes" : "no"}
                  onChange={(e) => setForm({ ...form, parkingHas: e.target.value === "yes" })}
                >
                  <option value="no">無</option>
                  <option value="yes">有</option>
                </select>
              </div>
              <div className="form-field">
                <label>車位數量</label>
                <input
                  value={form.parkingCount}
                  onChange={(e) => setForm({ ...form, parkingCount: e.target.value })}
                  disabled={!form.parkingHas}
                  placeholder="1"
                />
              </div>
              <div className="form-field">
                <label>屋齡（年）</label>
                <input
                  value={form.age}
                  onChange={(e) => setForm({ ...form, age: e.target.value })}
                  placeholder="例如：12"
                />
              </div>
            </div>

            <div className="form-field">
              <label>屋主聯絡人（連結客戶資料）</label>
              <select value={form.ownerContactId} onChange={(e) => onOwnerChange(e.target.value)}>
                <option value="">— 不連結 —</option>
                {contacts.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="form-field">
              <label>狀態標註（自由輸入，例如：待售中／已成交／暫緩）</label>
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
              />
            </div>

            <div className="form-field">
              <label>自訂欄位（需要記錄其他資訊時，自己加欄位，不用等我改程式）</label>
              {form.customFields.map((f, idx) => (
                <div key={idx} style={{ display: "flex", gap: 8, marginBottom: 8 }}>
                  <input
                    value={f.label}
                    onChange={(e) => updateCustomField(idx, "label", e.target.value)}
                    placeholder="欄位名稱，例如：格局"
                    style={{ flex: 1 }}
                  />
                  <input
                    value={f.value}
                    onChange={(e) => updateCustomField(idx, "value", e.target.value)}
                    placeholder="內容，例如：3房2廳"
                    style={{ flex: 1 }}
                  />
                  <button
                    type="button"
                    className="btn ghost"
                    onClick={() => removeCustomField(idx)}
                  >
                    刪除
                  </button>
                </div>
              ))}
              <button type="button" className="btn ghost" onClick={addCustomField}>
                ＋ 新增自訂欄位
              </button>
            </div>

            <div style={{ display: "flex", gap: 10 }}>
              <button className="btn" type="submit">
                {editingId ? "儲存變更" : "新增物件"}
              </button>
              <button className="btn ghost" type="button" onClick={() => setShowForm(false)}>
                取消
              </button>
              {editingId && (
                <button
                  className="btn danger"
                  type="button"
                  onClick={async () => {
                    if (window.confirm("確定要刪除這個物件嗎？")) {
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
        {filtered.length === 0 && (
          <div className="empty-state">
            <div className="big">{items.length === 0 ? "還沒有物件資料" : "找不到符合的物件"}</div>
            {items.length === 0 && "點右上角「＋ 新增物件」開始建檔"}
          </div>
        )}
        {filtered.map((p) => (
          <div className="list-row" key={p.id}>
            <div>
              <div className="name">{p.title}</div>
              <div className="meta">
                {p.floor && <>{p.floor}　</>}
                {p.area && <>{p.area} 坪　</>}
                {p.parkingHas && <>車位 {p.parkingCount || ""}　</>}
                {p.age && <>屋齡 {p.age} 年</>}
              </div>
              <div className="meta">
                {p.ownerContactName && <>屋主：{p.ownerContactName}　</>}
                {p.statusTag && <span className="tag">{p.statusTag}</span>}
              </div>
            </div>
            <div className="actions">
              <button className="btn ghost" onClick={() => openEdit(p)}>
                編輯
              </button>
            </div>
          </div>
        ))}
      </div>
    </main>
  );
}
