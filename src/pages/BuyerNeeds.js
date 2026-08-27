import React, { useState } from "react";
import { useNeedsCollection } from "../hooks/useNeedsCollection";
import { useAuth } from "../AuthContext";
import RecommendedProperties from "./RecommendedProperties";
import { normalizeNeedRanges, rangeStatText } from "../lib/needsFields";
import { TAIWAN_REGIONS, TAIWAN_CITIES } from "../lib/taiwanRegions";
import { useIsMobile } from "../hooks/useIsMobile";
import { mobileFontSize } from "../lib/mobileFont";
import NeedCriteriaTiers, { NeedTierSummary } from "./NeedCriteriaTiers";
import { recommendationCounts } from "../lib/recommendationStatus";

const PROPERTY_TYPES = ["公寓", "大樓", "廠房", "透天", "土地", "車位"];
const PURPOSES = ["辦公", "住宅", "店面"];
const MOTIVATIONS = ["投資", "自用"];
const STATUS_OPTIONS = ["正在找", "已成交", "暫緩"];
const emptyArea = { city: "", district: "", community: "" };

const makeEmptyForm = (contactId, contactName) => ({
  title: "",
  contactId,
  contactName,
  statusTag: "正在找",
  areas: [{ ...emptyArea }],
  types: [],
  purposes: [],
  motivation: "",
  budgetMin: "",
  budgetMax: "",
  mainAreaMin: "",
  mainAreaMax: "",
  roomsMin: "",
  roomsMax: "",
  bathMin: "",
  bathMax: "",
  ageMin: "",
  ageMax: "",
  floorMin: "",
  floorMax: "",
  topFloorOnly: false,
  criteriaLevels: {},
  parkingRequired: false,
  preferredFeatures: "",
  excludeGroundFloor: false,
  excludeTopFloor: false,
  excludeMechanicalParking: false,
  excludedFeatures: "",
  notes: "",
  shared: false,
  recommendedProperties: [],
});

const MAIN_OWNER_UID = "KiYlsnWcChW5muRkG167r7Mi1132";

// 小工具：把區域物件組成一行文字，例如「桃園市蘆竹區・南崁」
const areaLabel = (a) => [a.city, a.district].filter(Boolean).join("") + (a.community ? `・${a.community}` : "");

export default function BuyerNeeds({ contactId, contactName }) {
  const { user } = useAuth();
  const { items, add, update, remove } = useNeedsCollection(user.uid);
  const myNeeds = items.filter((n) => n.contactId === contactId);
  const isMobile = useIsMobile();
  const mfs = (px) => mobileFontSize(px, isMobile);

  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [editMode, setEditMode] = useState(false);
  const [form, setForm] = useState(makeEmptyForm(contactId, contactName));

  const openNew = () => {
    setForm(makeEmptyForm(contactId, contactName));
    setEditingId(null);
    setEditMode(true);
    setShowForm(true);
  };
  // 點客需卡片預設先進「查看詳情」（唯讀），要改內容再另外按「編輯」；
  // 從卡片上的「編輯」按鈕點進來的話 startInEditMode 傳 true，直接跳到可編輯的表單
  const openEdit = (item, { startInEditMode = false } = {}) => {
    setForm({
      ...makeEmptyForm(contactId, contactName),
      ...item,
      ...normalizeNeedRanges(item),
      areas: item.areas?.length ? item.areas : [{ ...emptyArea }],
    });
    setEditingId(item.id);
    setEditMode(startInEditMode);
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
  // 換縣市時，原本選的鄉鎮市區可能已經不屬於新縣市，一併清空避免留下錯誤的組合
  const updateAreaCity = (idx, city) => {
    const next = [...form.areas];
    next[idx] = { ...next[idx], city, district: "" };
    setForm({ ...form, areas: next });
  };
  const addArea = () => setForm({ ...form, areas: [...form.areas, { ...emptyArea }] });
  const removeArea = (idx) => setForm({ ...form, areas: form.areas.filter((_, i) => i !== idx) });

  const canEditFull = !editingId || form.ownerUid === user.uid || user.uid === MAIN_OWNER_UID;
  const itemEditable = (item) => item.ownerUid === user.uid || user.uid === MAIN_OWNER_UID;

  const onSubmit = async (e) => {
    e.preventDefault();
    if (!form.title.trim()) return;
    if (editingId) {
      await update(editingId, { ...form, lastModifiedByUid: user.uid });
      setEditMode(false);
    } else {
      await add({ ...form, ownerUid: user.uid, lastModifiedByUid: user.uid });
      setShowForm(false);
    }
  };

  // 推薦物件的加入/移除/標記已介紹不管在查看還是編輯模式都直接存檔，不用另外按「儲存變更」
  const handleRecommendedChange = async (recommendedProperties) => {
    setForm((f) => ({ ...f, recommendedProperties }));
    if (editingId) {
      await update(editingId, { recommendedProperties, lastModifiedByUid: user.uid });
    }
  };

  const viewAreaText = (form.areas || []).map(areaLabel).filter(Boolean).join("、");
  const viewRanges = normalizeNeedRanges(form);
  const viewStats = [
    rangeStatText(viewRanges.budgetMin, viewRanges.budgetMax, "萬") && { value: rangeStatText(viewRanges.budgetMin, viewRanges.budgetMax, "萬"), label: "總價" },
    rangeStatText(viewRanges.mainAreaMin, viewRanges.mainAreaMax, "坪") && { value: rangeStatText(viewRanges.mainAreaMin, viewRanges.mainAreaMax, "坪"), label: "主建物坪數" },
    rangeStatText(viewRanges.roomsMin, viewRanges.roomsMax, "房") && { value: rangeStatText(viewRanges.roomsMin, viewRanges.roomsMax, "房"), label: "房數" },
    rangeStatText(viewRanges.bathMin, viewRanges.bathMax, "衛") && { value: rangeStatText(viewRanges.bathMin, viewRanges.bathMax, "衛"), label: "衛浴數" },
    rangeStatText(viewRanges.ageMin, viewRanges.ageMax, "年") && { value: rangeStatText(viewRanges.ageMin, viewRanges.ageMax, "年"), label: "屋齡" },
    rangeStatText(form.floorMin, form.floorMax, "樓") && { value: rangeStatText(form.floorMin, form.floorMax, "樓"), label: "樓層" },
  ].filter(Boolean);

  const chip = (active) => ({
    padding: "6px 12px",
    borderRadius: 20,
    fontSize: mfs(12),
    fontWeight: 700,
    border: active ? "1px solid var(--accent)" : "1px solid var(--border)",
    background: active ? "var(--accent)" : "#fff",
    color: active ? "#fff" : "var(--ink)",
    cursor: "pointer",
  });
  const fieldBox = { padding: "9px 10px", border: "1px solid var(--border)", borderRadius: 7, fontSize: mfs(13) };

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
        <div style={{ fontSize: mfs(13), fontWeight: 700 }}>客需（{myNeeds.length}）</div>
        <button className="btn ghost" onClick={openNew} style={{ fontSize: mfs(12) }}>＋ 新增客需</button>
      </div>

      {showForm && (
        <div style={{ background: "#FAFAF8", border: "1px solid var(--border)", borderRadius: 10, padding: 16, marginBottom: 14 }}>
          {editingId && !editMode ? (
            <div>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 14 }}>
                <div>
                  <div style={{ fontWeight: 700, fontSize: mfs(16) }}>{form.title}</div>
                  <div style={{ display: "flex", gap: 6, marginTop: 6, alignItems: "center" }}>
                    <span
                      style={{
                        fontSize: mfs(11),
                        background: form.statusTag === "正在找" ? "var(--accent)" : "#F0EEE8",
                        color: form.statusTag === "正在找" ? "#fff" : "var(--muted)",
                        padding: "3px 10px",
                        borderRadius: 10,
                        fontWeight: 700,
                      }}
                    >
                      {form.statusTag}
                    </span>
                    {form.shared && <span style={{ fontSize: mfs(11), color: "var(--muted)" }}>已分享</span>}
                  </div>
                </div>
                <div style={{ display: "flex", gap: 8, flexShrink: 0 }}>
                  {canEditFull && (
                    <button className="btn ghost" type="button" style={{ fontSize: mfs(12) }} onClick={() => setEditMode(true)}>
                      編輯
                    </button>
                  )}
                  <button className="btn ghost" type="button" style={{ fontSize: mfs(12) }} onClick={() => setShowForm(false)}>
                    關閉
                  </button>
                </div>
              </div>

              {viewStats.length > 0 && (
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: `repeat(${viewStats.length}, 1fr)`,
                    gap: 8,
                    textAlign: "center",
                    background: "#fff",
                    borderRadius: 8,
                    padding: "12px 0",
                    marginBottom: 12,
                  }}
                >
                  {viewStats.map((s, i) => (
                    <div key={i}>
                      <div style={{ fontSize: mfs(16), fontWeight: 700 }}>{s.value}</div>
                      <div style={{ fontSize: mfs(10), color: "var(--muted)" }}>{s.label}</div>
                    </div>
                  ))}
                </div>
              )}

              <div style={{ fontSize: mfs(13), marginBottom: 10 }}>
                {viewAreaText && (
                  <div style={{ marginBottom: 4 }}>
                    <span style={{ color: "var(--muted)" }}>區域：</span>
                    {viewAreaText}
                  </div>
                )}
                {form.topFloorOnly && (
                  <div style={{ marginBottom: 4 }}>
                    <span style={{ color: "var(--muted)" }}>樓層：</span>偏好頂樓
                  </div>
                )}
                {(form.types.length > 0 || form.purposes.length > 0 || form.motivation) && (
                  <div style={{ marginBottom: 4 }}>
                    <span style={{ color: "var(--muted)" }}>類型：</span>
                    {[...form.types, ...form.purposes, form.motivation].filter(Boolean).join("、")}
                  </div>
                )}
                {form.notes && (
                  <div style={{ marginTop: 8, color: "var(--muted)", whiteSpace: "pre-wrap" }}>{form.notes}</div>
                )}
              </div>

              <NeedTierSummary need={form} />

              {canEditFull && (
                <button
                  className="btn danger"
                  type="button"
                  style={{ fontSize: mfs(12) }}
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
          ) : (
          <form onSubmit={onSubmit}>
            <div style={{ opacity: canEditFull ? 1 : 0.55, pointerEvents: canEditFull ? "auto" : "none" }}>

              <div style={{ display: "flex", gap: 8, marginBottom: 10 }}>
                <input
                  value={form.title}
                  onChange={(e) => setForm({ ...form, title: e.target.value })}
                  placeholder="客需名稱，例如：電梯大樓需求"
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

              <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer", fontSize: mfs(12), color: "var(--muted)", marginBottom: 14 }}>
                <input type="checkbox" checked={!!form.shared} onChange={(e) => setForm({ ...form, shared: e.target.checked })} />
                分享給同事（協助介紹物件）
              </label>

              <div style={{ fontSize: mfs(11), fontWeight: 700, color: "var(--muted)", marginBottom: 8 }}>找房條件</div>

              <div style={{ marginBottom: 10 }}>
                {form.areas.map((a, idx) => {
                  const cityValid = TAIWAN_CITIES.includes(a.city);
                  return (
                    <div key={idx} style={{ display: "flex", flexWrap: isMobile ? "wrap" : "nowrap", gap: 6, marginBottom: 6 }}>
                      <select value={cityValid ? a.city : ""} onChange={(e) => updateAreaCity(idx, e.target.value)} style={{ ...fieldBox, flex: isMobile ? "1 1 45%" : "0 0 100px", minWidth: 0 }}>
                        <option value="">縣市</option>
                        {TAIWAN_CITIES.map((c) => <option key={c} value={c}>{c}</option>)}
                      </select>
                      <select value={a.district} onChange={(e) => updateArea(idx, "district", e.target.value)} disabled={!cityValid} style={{ ...fieldBox, flex: isMobile ? "1 1 45%" : "0 0 100px", minWidth: 0 }}>
                        <option value="">鄉鎮市區</option>
                        {(TAIWAN_REGIONS[a.city] || []).map((d) => <option key={d} value={d}>{d}</option>)}
                      </select>
                      <input value={a.community} onChange={(e) => updateArea(idx, "community", e.target.value)} placeholder="社區（選填）" style={{ ...fieldBox, flex: isMobile ? "1 1 100%" : 1, minWidth: 0 }} />
                      {form.areas.length > 1 && (
                        <button type="button" onClick={() => removeArea(idx)} style={{ border: "none", background: "none", color: "var(--muted)", cursor: "pointer", fontSize: mfs(12) }}>✕</button>
                      )}
                    </div>
                  );
                })}
                <button type="button" className="btn ghost" onClick={addArea} style={{ fontSize: mfs(12) }}>＋ 新增區域</button>
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

              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 10, marginBottom: 10 }}>
                {[
                  { label: "總價（萬）", minKey: "budgetMin", maxKey: "budgetMax" },
                  { label: "主建物坪數", minKey: "mainAreaMin", maxKey: "mainAreaMax" },
                  { label: "房", minKey: "roomsMin", maxKey: "roomsMax" },
                  { label: "衛", minKey: "bathMin", maxKey: "bathMax" },
                  { label: "屋齡（年）", minKey: "ageMin", maxKey: "ageMax" },
                  { label: "樓層", minKey: "floorMin", maxKey: "floorMax" },
                ].map((r) => (
                  <div key={r.label}>
                    <div style={{ fontSize: mfs(11), color: "var(--muted)", marginBottom: 4 }}>{r.label}</div>
                    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                      <input
                        type="number"
                        value={form[r.minKey]}
                        onChange={(e) => setForm({ ...form, [r.minKey]: e.target.value })}
                        placeholder="最低"
                        style={{ ...fieldBox, width: 0, flex: 1 }}
                      />
                      <span style={{ color: "var(--muted)" }}>～</span>
                      <input
                        type="number"
                        value={form[r.maxKey]}
                        onChange={(e) => setForm({ ...form, [r.maxKey]: e.target.value })}
                        placeholder="最高"
                        style={{ ...fieldBox, width: 0, flex: 1 }}
                      />
                    </div>
                  </div>
                ))}
              </div>

              <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer", fontSize: mfs(12), color: "var(--muted)", marginBottom: 10 }}>
                <input type="checkbox" checked={!!form.topFloorOnly} onChange={(e) => setForm({ ...form, topFloorOnly: e.target.checked })} />
                偏好頂樓
              </label>

              <NeedCriteriaTiers form={form} setForm={setForm} compact />

              <textarea
                rows="2"
                value={form.notes}
                onChange={(e) => setForm({ ...form, notes: e.target.value })}
                placeholder="其他補充…"
                style={{ ...fieldBox, width: "100%", fontFamily: "inherit", marginBottom: 4 }}
              />
            </div>

            <div style={{ display: "flex", gap: 10, marginTop: 14 }}>
              <button className="btn" type="submit">{editingId ? "儲存變更" : "新增客需"}</button>
              <button className="btn ghost" type="button" onClick={() => (editingId ? setEditMode(false) : setShowForm(false))}>取消</button>
              {editingId && canEditFull && (
                <button className="btn danger" type="button" onClick={async () => { if (window.confirm("確定要刪除這筆客需嗎？")) { await remove(editingId); setShowForm(false); } }}>刪除</button>
              )}
            </div>
          </form>
          )}

          <div style={{ marginTop: 16, paddingTop: 14, borderTop: "1px solid var(--border)" }}>
            <RecommendedProperties
              value={form.recommendedProperties}
              onChange={handleRecommendedChange}
              need={form}
            />
          </div>
        </div>
      )}

      {myNeeds.length === 0 && !showForm && <div style={{ fontSize: mfs(12), color: "var(--muted)" }}>還沒有客需資料</div>}
      {myNeeds.map((n) => {
        const recommendationSummary = recommendationCounts(n.recommendedProperties);
        const { total: totalCount, pending: pendingCount, introduced: introducedCount, interested: interestedCount, notInterested: notInterestedCount } = recommendationSummary;
        const ranges = normalizeNeedRanges(n);
        const stats = [
          rangeStatText(ranges.budgetMin, ranges.budgetMax, "萬") && { value: rangeStatText(ranges.budgetMin, ranges.budgetMax, "萬"), label: "總價" },
          rangeStatText(ranges.mainAreaMin, ranges.mainAreaMax, "坪") && { value: rangeStatText(ranges.mainAreaMin, ranges.mainAreaMax, "坪"), label: "主建物坪數" },
          rangeStatText(ranges.roomsMin, ranges.roomsMax, "房") && { value: rangeStatText(ranges.roomsMin, ranges.roomsMax, "房"), label: "房數" },
          rangeStatText(ranges.bathMin, ranges.bathMax, "衛") && { value: rangeStatText(ranges.bathMin, ranges.bathMax, "衛"), label: "衛浴數" },
          rangeStatText(ranges.ageMin, ranges.ageMax, "年") && { value: rangeStatText(ranges.ageMin, ranges.ageMax, "年"), label: "屋齡" },
          rangeStatText(n.floorMin, n.floorMax, "樓") && { value: rangeStatText(n.floorMin, n.floorMax, "樓"), label: "樓層" },
        ].filter(Boolean);
        const areaText = (n.areas || []).map(areaLabel).filter(Boolean).join("、");
        return (
          <div key={n.id} style={{ background: "#fff", border: "1px solid var(--border)", borderRadius: 10, padding: "12px 14px", marginBottom: 10 }}>
            <div onClick={() => openEdit(n)} style={{ cursor: "pointer", display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: stats.length > 0 ? 10 : 4 }}>
              <div style={{ fontWeight: 700, fontSize: mfs(14) }}>{n.title}</div>
              <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                {n.topFloorOnly && <span title="偏好頂樓" style={{ fontSize: mfs(11), color: "var(--muted)" }}>頂樓</span>}
                {n.shared && <span title="已分享" style={{ fontSize: mfs(11), color: "var(--muted)" }}>已分享</span>}
                <span
                  style={{
                    fontSize: mfs(11),
                    background: n.statusTag === "正在找" ? "var(--accent)" : "#F0EEE8",
                    color: n.statusTag === "正在找" ? "#fff" : "var(--muted)",
                    padding: "3px 10px",
                    borderRadius: 10,
                    fontWeight: 700,
                  }}
                >
                  {n.statusTag}
                </span>
              </div>
            </div>

            {stats.length > 0 && (
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: `repeat(${stats.length}, 1fr)`,
                  gap: 8,
                  textAlign: "center",
                  background: "#FAFAF8",
                  borderRadius: 8,
                  padding: "10px 0",
                  marginBottom: 8,
                }}
              >
                {stats.map((s, i) => (
                  <div key={i}>
                    <div style={{ fontSize: mfs(15), fontWeight: 700 }}>{s.value}</div>
                    <div style={{ fontSize: mfs(10), color: "var(--muted)" }}>{s.label}</div>
                  </div>
                ))}
              </div>
            )}

            {areaText && <div style={{ fontSize: mfs(12), color: "var(--muted)" }}>{areaText}</div>}
            {totalCount > 0 && (
              <div style={{ fontSize: mfs(11), color: "var(--accent)", marginTop: 4, fontWeight: 700 }}>
                待處理 {pendingCount + interestedCount} 筆・已介紹 {introducedCount} 筆・沒興趣 {notInterestedCount} 筆
              </div>
            )}

            <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
              <button className="btn ghost" type="button" style={{ fontSize: mfs(11) }} onClick={() => openEdit(n)}>
                查看詳情
              </button>
              {itemEditable(n) && (
                <button
                  className="btn ghost"
                  type="button"
                  style={{ fontSize: mfs(11) }}
                  onClick={() => openEdit(n, { startInEditMode: true })}
                >
                  編輯
                </button>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
