import React, { useState } from "react";
import { useCollection } from "../hooks/useCollection";

const PROPERTY_TYPES = ["公寓", "大樓", "廠房", "透天", "土地", "車位"];
const PURPOSES = ["辦公", "住宅", "店面"];
const MOTIVATIONS = ["投資", "自用"];
const emptyArea = { city: "", district: "", road: "", community: "" };

const makeEmptyForm = (contactId, contactName) => ({
  title: "",
  contactId,
  contactName,
  statusTag: "正在找",
  areas: [{ ...emptyArea }],
  types: [],
  purposes: [],
  motivation: "",
  minMainArea: "",
  minLandArea: "",
  minRooms: "",
  maxAge: "",
  parkingNeed: "不限",
  budget: "",
  buyerTags: "",
  propertyTags: "",
  notes: "",
});

export default function BuyerNeeds({ contactId, contactName }) {
  const { items, add, update, remove } = useCollection("needs", "createdAt");
  const myNeeds = items.filter((n) => n.contactId === contactId);

  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState(makeEmptyForm(contactId, contactName));

  const openNew = () => {
    setForm(makeEmptyForm(contactId, contactName));
    setEditingId(null);
    setShowForm(true);
  };
  const openEdit = (item) => {
    setForm({ ...makeEmptyForm(contactId, contactName), ...item, areas: item.areas?.length ? item.areas : [{ ...emptyArea }] });
    setEditingId(item.id);
    setShowForm(true);
  };

  const toggleArrItem = (field, val) => {
    setForm((f) => ({
      ...f,
      [field]: f[field].includes(val) ? f[field].filter((x) => x !== val) : [...f[field], val],
    }));
  };
  const updateArea = (idx, key, val) => {
    const next = [...form.areas];
    next[idx] = { ...next[idx], [key]: val };
    setForm({ ...form, areas: next });
  };
  const addArea = () => setForm({ ...form, areas: [...form.areas, { ...emptyArea }] });
  const removeArea = (idx) => setForm({ ...form, areas: form.areas.filter((_, i) => i !== idx) });

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

  const chipBtn = (active) => ({
    padding: "5px 10px", borderRadius: 20, fontSize: 11, fontWeight: 700,
    border: "1px solid var(--border)", background: active ? "var(--accent)" : "#fff",
    color: active ? "#fff" : "var(--ink)", cursor: "pointer",
  });

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
        <div style={{ fontSize: 13, fontWeight: 700 }}>客需（{myNeeds.length}）</div>
        <button className="btn ghost" onClick={openNew} style={{ fontSize: 12 }}>＋ 新增客需</button>
      </div>

      {showForm && (
        <form onSubmit={onSubmit} style={{ background: "#FAFAF8", border: "1px solid var(--border)", borderRadius: 8, padding: 14, marginBottom: 14 }}>
          <div className="form-field">
            <label>客需名稱</label>
            <input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="例如：電梯大樓需求" required />
          </div>
          <div className="form-field">
            <label>狀態標籤</label>
            <input value={form.statusTag} onChange={(e) => setForm({ ...form, statusTag: e.target.value })} />
          </div>
          <div className="form-field">
            <label>區域（可新增多個）</label>
            {form.areas.map((a, idx) => (
              <div key={idx} style={{ display: "flex", gap: 6, marginBottom: 6 }}>
                <input value={a.city} onChange={(e) => updateArea(idx, "city", e.target.value)} placeholder="縣市" style={{ width: 80 }} />
                <input value={a.district} onChange={(e) => updateArea(idx, "district", e.target.value)} placeholder="鄉鎮市區" style={{ width: 80 }} />
                <input value={a.community} onChange={(e) => updateArea(idx, "community", e.target.value)} placeholder="社區名稱（選填）" style={{ flex: 1 }} />
                {form.areas.length > 1 && <button type="button" className="btn ghost" onClick={() => removeArea(idx)}>刪除</button>}
              </div>
            ))}
            <button type="button" className="btn ghost" onClick={addArea}>＋ 新增區域</button>
          </div>
          <div className="form-field">
            <label>類型</label>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              {PROPERTY_TYPES.map((t) => (
                <button type="button" key={t} style={chipBtn(form.types.includes(t))} onClick={() => toggleArrItem("types", t)}>{t}</button>
              ))}
            </div>
          </div>
          <div className="form-field">
            <label>用途</label>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              {PURPOSES.map((t) => (
                <button type="button" key={t} style={chipBtn(form.purposes.includes(t))} onClick={() => toggleArrItem("purposes", t)}>{t}</button>
              ))}
            </div>
          </div>
          <div className="form-field">
            <label>動機</label>
            <div style={{ display: "flex", gap: 6 }}>
              {MOTIVATIONS.map((t) => (
                <button type="button" key={t} style={chipBtn(form.motivation === t)} onClick={() => setForm({ ...form, motivation: t })}>{t}</button>
              ))}
            </div>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10 }}>
            <div className="form-field"><label>最低坪數</label><input value={form.minMainArea} onChange={(e) => setForm({ ...form, minMainArea: e.target.value })} /></div>
            <div className="form-field"><label>最小房數</label><input value={form.minRooms} onChange={(e) => setForm({ ...form, minRooms: e.target.value })} /></div>
            <div className="form-field"><label>預算（萬）</label><input value={form.budget} onChange={(e) => setForm({ ...form, budget: e.target.value })} /></div>
          </div>
          <div className="form-field">
            <label>其他補充</label>
            <textarea rows="2" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
          </div>
          <div style={{ display: "flex", gap: 10 }}>
            <button className="btn" type="submit">{editingId ? "儲存變更" : "新增客需"}</button>
            <button className="btn ghost" type="button" onClick={() => setShowForm(false)}>取消</button>
            {editingId && (
              <button className="btn danger" type="button" onClick={async () => { if (window.confirm("確定要刪除這筆客需嗎？")) { await remove(editingId); setShowForm(false); } }}>刪除</button>
            )}
          </div>
        </form>
      )}

      {myNeeds.length === 0 && !showForm && <div style={{ fontSize: 12, color: "var(--muted)" }}>還沒有客需資料</div>}
      {myNeeds.map((n) => (
        <div key={n.id} onClick={() => openEdit(n)} style={{ cursor: "pointer", background: "#fff", border: "1px solid var(--border)", borderRadius: 8, padding: 12, marginBottom: 10 }}>
          <div style={{ display: "flex", justifyContent: "space-between" }}>
            <div style={{ fontWeight: 700, fontSize: 13 }}>{n.title}</div>
            <span className="tag">{n.statusTag}</span>
          </div>
          <div style={{ fontSize: 11, color: "var(--muted)", marginTop: 4 }}>
            {(n.areas || []).map((a) => [a.city, a.district].filter(Boolean).join("")).filter(Boolean).join("、")}
            {n.budget && <>　預算：{n.budget} 萬</>}
          </div>
        </div>
      ))}
    </div>
  );
}
