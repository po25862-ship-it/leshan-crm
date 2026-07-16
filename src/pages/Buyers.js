import React, { useState } from "react";
import { useCollection } from "../hooks/useCollection";
import { daysSince, formatDate, todayStr } from "../lib/dates";
import ContactInteractions from "./ContactInteractions";
import ContactAppointments from "./ContactAppointments";
import BuyerNeeds from "./BuyerNeeds";

const emptyForm = {
  name: "",
  phone: "",
  tags: ["買方"],
  source: "",
  notes: "",
  lastContactDate: todayStr(),
};

export default function Buyers() {
  const { items, add, update, remove } = useCollection("contacts", "name");
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState(emptyForm);
  const [keyword, setKeyword] = useState("");

  const buyers = items.filter((c) => (c.tags || []).includes("買方"));

  const openNew = () => {
    setForm(emptyForm);
    setEditingId(null);
    setShowForm(true);
  };

  const openEdit = (item) => {
    setForm({
      name: item.name || "",
      phone: item.phone || "",
      tags: item.tags || ["買方"],
      source: item.source || "",
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
    const dataToSave = form.tags.includes("買方") ? form : { ...form, tags: [...form.tags, "買方"] };
    if (editingId) {
      await update(editingId, dataToSave);
    } else {
      await add(dataToSave);
    }
    setShowForm(false);
  };

  const logFollowUp = (item) => update(item.id, { lastContactDate: todayStr() });

  const sorted = [...buyers].sort((a, b) => {
    const da = daysSince(a.lastContactDate) ?? -999;
    const db_ = daysSince(b.lastContactDate) ?? -999;
    return db_ - da;
  });

  const filtered = sorted.filter((item) => {
    if (!keyword.trim()) return true;
    const k = keyword.trim();
    return (
      (item.name || "").includes(k) ||
      (item.phone || "").includes(k) ||
      (item.source || "").includes(k) ||
      (item.notes || "").includes(k)
    );
  });

  return (
    <main>
      <div className="top-actions">
        <div className="section-title">買方客戶（{buyers.length}）</div>
        <button className="btn" onClick={openNew}>
          ＋ 新增買方
        </button>
      </div>

      <div style={{ marginBottom: 18 }}>
        <input
          value={keyword}
          onChange={(e) => setKeyword(e.target.value)}
          placeholder="搜尋姓名、電話、來源、備註…"
          style={{ width: "100%", maxWidth: 360, padding: "10px 12px", border: "1px solid var(--border)", borderRadius: 7, fontSize: 14 }}
        />
      </div>

      {showForm && (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: editingId ? "minmax(320px, 640px) 1fr" : "minmax(320px, 640px)",
            gap: 24,
            marginBottom: 24,
            alignItems: "start",
          }}
        >
          <div className="panel">
            <form className="form-grid" onSubmit={onSubmit}>
              <div className="form-field">
                <label>姓名</label>
                <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="例如：陳小姐" required />
              </div>
              <div className="form-field">
                <label>電話</label>
                <input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} placeholder="09xx-xxx-xxx" />
              </div>
              <div className="form-field">
                <label>身分標籤</label>
                <div className="checkbox-row">
                  <label>
                    <input type="checkbox" checked={form.tags.includes("賣方")} onChange={() => toggleTag("賣方")} />
                    也是賣方
                  </label>
                </div>
                <div style={{ fontSize: 11, color: "var(--muted)", marginTop: 6 }}>
                  這裡建立的客戶預設會標記「買方」；如果這位客戶同時也要賣房子，去「賣方」頁面登錄委託即可。
                </div>
              </div>
              <div className="form-field">
                <label>客戶來源（自由輸入，例如：FB 粉專、朋友介紹、591…）</label>
                <input value={form.source} onChange={(e) => setForm({ ...form, source: e.target.value })} placeholder="例如：FB 粉專廣告" />
              </div>
              <div className="form-field">
                <label>最後聯絡日期</label>
                <input type="date" value={form.lastContactDate} onChange={(e) => setForm({ ...form, lastContactDate: e.target.value })} />
              </div>
              <div className="form-field">
                <label>備註</label>
                <textarea rows="3" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} placeholder="需求、預算、偏好區域…" />
              </div>
              <div style={{ display: "flex", gap: 10 }}>
                <button className="btn" type="submit">{editingId ? "儲存變更" : "新增買方"}</button>
                <button className="btn ghost" type="button" onClick={() => setShowForm(false)}>取消</button>
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

          {editingId && (
            <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
              <div className="panel">
                <BuyerNeeds contactId={editingId} contactName={form.name} />
              </div>
              <div className="panel">
                <ContactAppointments contactId={editingId} contactName={form.name} />
              </div>
              <div className="panel">
                <ContactInteractions
                  contactId={editingId}
                  contactName={form.name}
                  onLogged={() => update(editingId, { lastContactDate: todayStr() })}
                />
              </div>
            </div>
          )}
        </div>
      )}

      <div className="panel">
        {filtered.length === 0 && (
          <div className="empty-state">
            <div className="big">{buyers.length === 0 ? "還沒有買方客戶" : "找不到符合的客戶"}</div>
            {buyers.length === 0 && "點右上角「＋ 新增買方」開始建檔"}
          </div>
        )}
        {filtered.map((item) => {
          const days = daysSince(item.lastContactDate);
          return (
            <div className="list-row" key={item.id} onClick={() => openEdit(item)} style={{ cursor: "pointer" }}>
              <div>
                <div className="name">{item.name}</div>
                <div className="meta">
                  {item.phone && <span>{item.phone}　</span>}
                  最後聯絡：{formatDate(item.lastContactDate)}
                  {days !== null && <span className="mono"> （{days} 天前）</span>}
                  {item.source && <>　來源：{item.source}</>}
                </div>
                <div style={{ marginTop: 6 }}>
                  {(item.tags || []).map((t) => (
                    <span key={t} className={`tag ${t === "買方" ? "buyer" : ""}`}>{t}</span>
                  ))}
                </div>
              </div>
              <div className="actions">
                <button className="btn ghost" onClick={(e) => { e.stopPropagation(); logFollowUp(item); }}>記錄今日跟進</button>
                <button className="btn ghost" onClick={(e) => { e.stopPropagation(); openEdit(item); }}>編輯</button>
              </div>
            </div>
          );
        })}
      </div>
    </main>
  );
}
