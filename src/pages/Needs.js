import React, { useState, useMemo } from "react";
import { useCollection } from "../hooks/useCollection";

const PROPERTY_TYPES = ["公寓", "大樓", "廠房", "透天", "土地", "車位"];
const PURPOSES = ["辦公", "住宅", "店面"];
const MOTIVATIONS = ["投資", "自用"];

const emptyArea = { city: "", district: "", road: "", community: "" };

const emptyForm = {
  title: "",
  contactId: "",
  contactName: "",
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
};

export default function Needs() {
  const { items, add, update, remove } = useCollection("needs", "createdAt");
  const { items: contacts } = useCollection("contacts", "name");
  const buyers = contacts.filter((c) => (c.tags || []).includes("買方"));

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
      ...emptyForm,
      ...item,
      areas: item.areas && item.areas.length ? item.areas : [{ ...emptyArea }],
    });
    setEditingId(item.id);
    setShowForm(true);
  };

  const onContactChange = (id) => {
    const c = contacts.find((x) => x.id === id);
    setForm({ ...form, contactId: id, contactName: c ? c.name : "" });
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

  const columns = useMemo(() => {
    const map = {};
    items.forEach((item) => {
      const tag = item.statusTag || "未分類";
      if (!map[tag]) map[tag] = [];
      map[tag].push(item);
    });
    return map;
  }, [items]);

  const fieldStyle = { display: "flex", gap: 8, marginBottom: 8 };
  const chipBtn = (active) => ({
    padding: "6px 12px",
    borderRadius: 20,
    fontSize: 12,
    fontWeight: 700,
    border: "1px solid var(--border)",
    background: active ? "var(--accent)" : "#fff",
    color: active ? "#fff" : "var(--ink)",
    cursor: "pointer",
  });

  return (
    <main>
      <div className="top-actions">
        <div className="section-title">客需（{items.length}）</div>
        <button className="btn" onClick={openNew}>
          ＋ 新增客需
        </button>
      </div>

      {showForm && (
        <div className="panel" style={{ marginBottom: 24, maxWidth: 680 }}>
          <form className="form-grid" onSubmit={onSubmit}>
            <div className="form-field">
              <label>客需名稱</label>
              <input
                value={form.title}
                onChange={(e) => setForm({ ...form, title: e.target.value })}
                placeholder="例如：陳小姐・電梯大樓需求"
                required
              />
            </div>

            <div className="form-field">
              <label>買方客戶</label>
              <select value={form.contactId} onChange={(e) => onContactChange(e.target.value)}>
                <option value="">— 選擇買方客戶 —</option>
                {buyers.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="form-field">
              <label>狀態標籤（自由輸入，例如：正在找／已成交／放棄）</label>
              <input
                value={form.statusTag}
                onChange={(e) => setForm({ ...form, statusTag: e.target.value })}
              />
            </div>

            <div className="form-field">
              <label>區域（可新增多個）</label>
              {form.areas.map((a, idx) => (
                <div key={idx} style={fieldStyle}>
                  <input
                    value={a.city}
                    onChange={(e) => updateArea(idx, "city", e.target.value)}
                    placeholder="縣市"
                    style={{ width: 90 }}
                  />
                  <input
                    value={a.district}
                    onChange={(e) => updateArea(idx, "district", e.target.value)}
                    placeholder="鄉鎮市區"
                    style={{ width: 90 }}
                  />
                  <input
                    value={a.road}
                    onChange={(e) => updateArea(idx, "road", e.target.value)}
                    placeholder="路名（選填）"
                    style={{ flex: 1 }}
                  />
                  <input
                    value={a.community}
                    onChange={(e) => updateArea(idx, "community", e.target.value)}
                    placeholder="社區名稱（選填）"
                    style={{ flex: 1 }}
                  />
                  {form.areas.length > 1 && (
                    <button type="button" className="btn ghost" onClick={() => removeArea(idx)}>
                      刪除
                    </button>
                  )}
                </div>
              ))}
              <button type="button" className="btn ghost" onClick={addArea}>
                ＋ 新增區域
              </button>
            </div>

            <div className="form-field">
              <label>類型（可複選）</label>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                {PROPERTY_TYPES.map((t) => (
                  <button
                    type="button"
                    key={t}
                    style={chipBtn(form.types.includes(t))}
                    onClick={() => toggleArrItem("types", t)}
                  >
                    {t}
                  </button>
                ))}
              </div>
            </div>

            <div className="form-field">
              <label>用途（可複選）</label>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                {PURPOSES.map((t) => (
                  <button
                    type="button"
                    key={t}
                    style={chipBtn(form.purposes.includes(t))}
                    onClick={() => toggleArrItem("purposes", t)}
                  >
                    {t}
                  </button>
                ))}
              </div>
            </div>

            <div className="form-field">
              <label>動機</label>
              <div style={{ display: "flex", gap: 8 }}>
                {MOTIVATIONS.map((t) => (
                  <button
                    type="button"
                    key={t}
                    style={chipBtn(form.motivation === t)}
                    onClick={() => setForm({ ...form, motivation: t })}
                  >
                    {t}
                  </button>
                ))}
              </div>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
              <div className="form-field">
                <label>最低主建物坪數</label>
                <input
                  value={form.minMainArea}
                  onChange={(e) => setForm({ ...form, minMainArea: e.target.value })}
                />
              </div>
              <div className="form-field">
                <label>最低地坪</label>
                <input
                  value={form.minLandArea}
                  onChange={(e) => setForm({ ...form, minLandArea: e.target.value })}
                />
              </div>
              <div className="form-field">
                <label>最小房數</label>
                <input
                  value={form.minRooms}
                  onChange={(e) => setForm({ ...form, minRooms: e.target.value })}
                />
              </div>
              <div className="form-field">
                <label>最大屋齡（年）</label>
                <input
                  value={form.maxAge}
                  onChange={(e) => setForm({ ...form, maxAge: e.target.value })}
                />
              </div>
              <div className="form-field">
                <label>車位需求</label>
                <select
                  value={form.parkingNeed}
                  onChange={(e) => setForm({ ...form, parkingNeed: e.target.value })}
                >
                  <option value="不限">不限</option>
                  <option value="需要">需要</option>
                  <option value="不需要">不需要</option>
                </select>
              </div>
              <div className="form-field">
                <label>預算（萬）</label>
                <input
                  value={form.budget}
                  onChange={(e) => setForm({ ...form, budget: e.target.value })}
                />
              </div>
            </div>

            <div className="form-field">
              <label>買家標籤（自由輸入，逗號分隔，最多 2 個建議）</label>
              <input
                value={form.buyerTags}
                onChange={(e) => setForm({ ...form, buyerTags: e.target.value })}
                placeholder="例如：首購, 換屋"
              />
            </div>
            <div className="form-field">
              <label>物件標籤（自由輸入，逗號分隔，最多 2 個建議）</label>
              <input
                value={form.propertyTags}
                onChange={(e) => setForm({ ...form, propertyTags: e.target.value })}
                placeholder="例如：邊間, 採光佳"
              />
            </div>

            <div className="form-field">
              <label>其他補充</label>
              <textarea
                rows="2"
                value={form.notes}
                onChange={(e) => setForm({ ...form, notes: e.target.value })}
              />
            </div>

            <div style={{ display: "flex", gap: 10 }}>
              <button className="btn" type="submit">
                {editingId ? "儲存變更" : "新增客需"}
              </button>
              <button className="btn ghost" type="button" onClick={() => setShowForm(false)}>
                取消
              </button>
              {editingId && (
                <button
                  className="btn danger"
                  type="button"
                  onClick={async () => {
                    if (window.confirm("確定要刪除這筆客需嗎？")) {
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
            <div className="big">還沒有客需資料</div>
            點右上角「＋ 新增客需」開始記錄
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
                    {item.contactName && <>買方：{item.contactName}<br /></>}
                    {(item.areas || [])
                      .map((a) => [a.city, a.district].filter(Boolean).join(""))
                      .filter(Boolean)
                      .join("、")}
                    {item.budget && <><br />預算：{item.budget} 萬</>}
                    {(item.types || []).length > 0 && <><br />類型：{item.types.join("、")}</>}
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
