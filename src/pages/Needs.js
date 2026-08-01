import React, { useState, useMemo, useEffect } from "react";
import { useSearchParams } from "react-router-dom";
import { useNeedsCollection } from "../hooks/useNeedsCollection";
import { useSharedCollection } from "../hooks/useSharedCollection";
import { useAuth } from "../AuthContext";
import RecommendedProperties from "./RecommendedProperties";

const PROPERTY_TYPES = ["公寓", "大樓", "廠房", "透天", "土地", "車位"];
const PURPOSES = ["辦公", "住宅", "店面"];
const MOTIVATIONS = ["投資", "自用"];
const STATUS_OPTIONS = ["正在找", "已成交", "暫緩"];
const MAIN_OWNER_UID = "KiYlsnWcChW5muRkG167r7Mi1132";
const emptyArea = { city: "", district: "", community: "" };

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
  minRooms: "",
  budget: "",
  notes: "",
  shared: false,
  recommendedProperties: [],
};

const areaLabel = (a) => [a.city, a.district].filter(Boolean).join("") + (a.community ? `・${a.community}` : "");

export default function Needs() {
  const { user } = useAuth();
  const { items, add, update, remove } = useNeedsCollection(user.uid);
  const { items: contacts } = useSharedCollection("contacts", "name", user.uid);
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

  const [searchParams, setSearchParams] = useSearchParams();
  useEffect(() => {
    const openId = searchParams.get("open");
    if (openId) {
      const found = items.find((n) => n.id === openId);
      if (found) {
        openEdit(found);
        setSearchParams({}, { replace: true });
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items, searchParams]);

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

  const canEditFull = !editingId || form.ownerUid === user.uid || user.uid === MAIN_OWNER_UID;

  const onSubmit = async (e) => {
    e.preventDefault();
    if (canEditFull) {
      if (!form.title.trim()) return;
      if (editingId) {
        await update(editingId, { ...form, lastModifiedByUid: user.uid });
      } else {
        await add({ ...form, ownerUid: user.uid, lastModifiedByUid: user.uid });
      }
    } else {
      await update(editingId, { recommendedProperties: form.recommendedProperties, lastModifiedByUid: user.uid });
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

  const chip = (active) => ({
    padding: "6px 12px",
    borderRadius: 20,
    fontSize: 12,
    fontWeight: 700,
    border: active ? "1px solid var(--accent)" : "1px solid var(--border)",
    background: active ? "var(--accent)" : "#fff",
    color: active ? "#fff" : "var(--ink)",
    cursor: "pointer",
  });
  const fieldBox = { padding: "9px 10px", border: "1px solid var(--border)", borderRadius: 7, fontSize: 13 };

  return (
    <main>
      <div className="top-actions">
        <div className="section-title">客需（{items.length}）</div>
        <button className="btn" onClick={openNew}>＋ 新增客需</button>
      </div>

      {showForm && (
        <div className="panel" style={{ marginBottom: 24, maxWidth: 620 }}>
          {!canEditFull && (
            <div style={{ background: "var(--accent-soft)", color: "var(--accent)", fontSize: 12, padding: "8px 12px", borderRadius: 8, marginBottom: 12 }}>
              唯讀：只有提供這筆客需的人可以修改內容，你可以協助標記下面的推薦物件。
            </div>
          )}
          <form onSubmit={onSubmit}>
            <div style={{ opacity: canEditFull ? 1 : 0.55, pointerEvents: canEditFull ? "auto" : "none" }}>

              <div style={{ display: "flex", gap: 8, marginBottom: 10 }}>
                <input
                  value={form.title}
                  onChange={(e) => setForm({ ...form, title: e.target.value })}
                  placeholder="客需名稱，例如：陳小姐・電梯大樓需求"
                  required
                  style={{ ...fieldBox, flex: 1 }}
                />
                <select
                  value={form.statusTag}
                  onChange={(e) => setForm({ ...form, statusTag: e.target.value })}
                  style={{ ...fieldBox, width: 110 }}
                >
                  {STATUS_OPTIONS.map((s) => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>

              <div style={{ marginBottom: 10 }}>
                <select value={form.contactId} onChange={(e) => onContactChange(e.target.value)} style={{ ...fieldBox, width: "100%" }}>
                  <option value="">— 選擇買方客戶（選填） —</option>
                  {buyers.map((c) => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
              </div>

              <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer", fontSize: 12, color: "var(--muted)", marginBottom: 14 }}>
                <input type="checkbox" checked={!!form.shared} onChange={(e) => setForm({ ...form, shared: e.target.checked })} />
                分享給同事（協助介紹物件）
              </label>

              <div style={{ fontSize: 11, fontWeight: 700, color: "var(--muted)", marginBottom: 8 }}>找房條件</div>

              <div style={{ marginBottom: 10 }}>
                {form.areas.map((a, idx) => (
                  <div key={idx} style={{ display: "flex", gap: 6, marginBottom: 6 }}>
                    <input value={a.city} onChange={(e) => updateArea(idx, "city", e.target.value)} placeholder="縣市" style={{ ...fieldBox, width: 70 }} />
                    <input value={a.district} onChange={(e) => updateArea(idx, "district", e.target.value)} placeholder="鄉鎮市區" style={{ ...fieldBox, width: 80 }} />
                    <input value={a.community} onChange={(e) => updateArea(idx, "community", e.target.value)} placeholder="社區（選填）" style={{ ...fieldBox, flex: 1 }} />
                    {form.areas.length > 1 && (
                      <button type="button" onClick={() => removeArea(idx)} style={{ border: "none", background: "none", color: "var(--muted)", cursor: "pointer", fontSize: 12 }}>✕</button>
                    )}
                  </div>
                ))}
                <button type="button" className="btn ghost" onClick={addArea} style={{ fontSize: 12 }}>＋ 新增區域</button>
              </div>

              <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 10 }}>
                {PROPERTY_TYPES.map((t) => (
                  <button type="button" key={t} style={chip(form.types.includes(t))} onClick={() => toggleArrItem("types", t)}>{t}</button>
                ))}
                <span style={{ width: 1, background: "var(--border)", margin: "0 2px" }} />
                {PURPOSES.map((t) => (
                  <button type="button" key={t} style={chip(form.purposes.includes(t))} onClick={() => toggleArrItem("purposes", t)}>{t}</button>
                ))}
                <span style={{ width: 1, background: "var(--border)", margin: "0 2px" }} />
                {MOTIVATIONS.map((t) => (
                  <button type="button" key={t} style={chip(form.motivation === t)} onClick={() => setForm({ ...form, motivation: form.motivation === t ? "" : t })}>{t}</button>
                ))}
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8, marginBottom: 10 }}>
                <input value={form.minMainArea} onChange={(e) => setForm({ ...form, minMainArea: e.target.value })} placeholder="最低坪數" style={fieldBox} />
                <input value={form.minRooms} onChange={(e) => setForm({ ...form, minRooms: e.target.value })} placeholder="最小房數" style={fieldBox} />
                <input value={form.budget} onChange={(e) => setForm({ ...form, budget: e.target.value })} placeholder="預算（萬）" style={fieldBox} />
              </div>

              <textarea
                rows="2"
                value={form.notes}
                onChange={(e) => setForm({ ...form, notes: e.target.value })}
                placeholder="其他補充…"
                style={{ ...fieldBox, width: "100%", fontFamily: "inherit", marginBottom: 4 }}
              />
            </div>

            <div style={{ marginTop: 16, paddingTop: 14, borderTop: "1px solid var(--border)" }}>
              <RecommendedProperties
                value={form.recommendedProperties}
                onChange={(recommendedProperties) => setForm({ ...form, recommendedProperties })}
              />
            </div>

            <div style={{ display: "flex", gap: 10, marginTop: 14 }}>
              <button className="btn" type="submit">{editingId ? "儲存變更" : "新增客需"}</button>
              <button className="btn ghost" type="button" onClick={() => setShowForm(false)}>取消</button>
              {editingId && canEditFull && (
                <button className="btn danger" type="button" onClick={async () => { if (window.confirm("確定要刪除這筆客需嗎？")) { await remove(editingId); setShowForm(false); } }}>刪除</button>
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
              {list.map((item) => {
                const introducedCount = (item.recommendedProperties || []).filter((r) => r.introduced).length;
                const totalCount = (item.recommendedProperties || []).length;
                const stats = [
                  item.budget && { value: `${item.budget}萬`, label: "預算上限" },
                  item.minMainArea && { value: `${item.minMainArea}坪`, label: "最低坪數" },
                  item.minRooms && { value: `${item.minRooms}房`, label: "最少房數" },
                ].filter(Boolean);
                const areaText = (item.areas || []).map(areaLabel).filter(Boolean).join("、");
                return (
                  <div className="card" key={item.id} onClick={() => openEdit(item)} style={{ cursor: "pointer" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                      <div className="name">{item.title}</div>
                      {item.shared && <span style={{ fontSize: 10, color: "var(--muted)" }}>已分享</span>}
                    </div>
                    {item.contactName && <div style={{ fontSize: 11, color: "var(--muted)", marginTop: 2 }}>買方：{item.contactName}</div>}

                    {stats.length > 0 && (
                      <div
                        style={{
                          display: "grid",
                          gridTemplateColumns: `repeat(${stats.length}, 1fr)`,
                          gap: 6,
                          textAlign: "center",
                          background: "#FAFAF8",
                          borderRadius: 8,
                          padding: "8px 0",
                          margin: "8px 0",
                        }}
                      >
                        {stats.map((s, i) => (
                          <div key={i}>
                            <div style={{ fontSize: 14, fontWeight: 700 }}>{s.value}</div>
                            <div style={{ fontSize: 9, color: "var(--muted)" }}>{s.label}</div>
                          </div>
                        ))}
                      </div>
                    )}

                    {areaText && <div style={{ fontSize: 11, color: "var(--muted)" }}>{areaText}</div>}
                    {(item.types || []).length > 0 && <div style={{ fontSize: 11, color: "var(--muted)", marginTop: 2 }}>{item.types.join("、")}</div>}
                    {totalCount > 0 && (
                      <div style={{ fontSize: 11, color: "var(--accent)", marginTop: 6, fontWeight: 700 }}>
                        推薦物件 {totalCount} 筆・已介紹 {introducedCount} 筆
                      </div>
                    )}
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
