import React from "react";

const CRITERIA = [
  ["type", "物件類型"], ["mainArea", "主建物坪數"], ["rooms", "房數"],
  ["bath", "衛浴"], ["age", "屋齡"], ["floor", "樓層"], ["topFloor", "頂樓"],
];

const LEVEL_LABELS = { required: "必要", preferred: "偏好", ignored: "不計分" };

export function NeedTierSummary({ need }) {
  const required = ["區域", "預算（含 10% 容忍）"];
  const preferred = [];
  CRITERIA.forEach(([key, label]) => {
    const level = need.criteriaLevels?.[key] || "preferred";
    if (level === "required") required.push(label);
    if (level === "preferred") preferred.push(label);
  });
  if (need.parkingRequired) required.push("必須有車位");
  if (need.preferredFeatures) preferred.push(need.preferredFeatures);
  const excluded = [
    need.excludeGroundFloor && "一樓",
    need.excludeTopFloor && "頂樓",
    need.excludeMechanicalParking && "機械車位",
    need.excludedFeatures,
  ].filter(Boolean);
  return (
    <div className="need-tier-summary">
      <div><span>必要</span><strong>{required.join("・")}</strong></div>
      <div><span>偏好</span><strong>{preferred.length ? preferred.join("・") : "尚未指定"}</strong></div>
      <div><span>排除</span><strong>{excluded.length ? excluded.join("・") : "尚未指定"}</strong></div>
    </div>
  );
}

export default function NeedCriteriaTiers({ form, setForm, compact = false }) {
  const levels = form.criteriaLevels || {};
  const setLevel = (key, value) => setForm({
    ...form,
    criteriaLevels: { ...levels, [key]: value },
  });
  const checkbox = (key, label) => (
    <label className="need-tier-check">
      <input type="checkbox" checked={!!form[key]} onChange={(event) => setForm({ ...form, [key]: event.target.checked })} />
      <span>{label}</span>
    </label>
  );

  return (
    <section className={`need-tiers ${compact ? "compact" : ""}`}>
      <div className="need-tier required">
        <div className="need-tier-heading"><span>01</span><div><strong>必要條件</strong><small>不符合就不推薦</small></div></div>
        <p>區域與預算容忍固定採硬篩；下列條件可再指定層級。</p>
        <div className="need-level-grid">
          {CRITERIA.map(([key, label]) => (
            <label key={key}>
              <span>{label}</span>
              <select value={levels[key] || "preferred"} onChange={(event) => setLevel(key, event.target.value)}>
                {Object.entries(LEVEL_LABELS).map(([value, text]) => <option key={value} value={value}>{text}</option>)}
              </select>
            </label>
          ))}
        </div>
        {checkbox("parkingRequired", "一定要有車位")}
      </div>

      <div className="need-tier preferred">
        <div className="need-tier-heading"><span>02</span><div><strong>偏好條件</strong><small>命中加分，未命中仍保留</small></div></div>
        <label className="need-tier-text">
          <span>特色關鍵字</span>
          <input value={form.preferredFeatures || ""} onChange={(event) => setForm({ ...form, preferredFeatures: event.target.value })} placeholder="例如：衛浴開窗、雙陽台、近捷運" />
        </label>
        <p>用逗號或頓號分隔；會比對案名、地址、車位說明、備註與自訂欄位。</p>
      </div>

      <div className="need-tier excluded">
        <div className="need-tier-heading"><span>03</span><div><strong>排除條件</strong><small>命中任一項直接淘汰</small></div></div>
        <div className="need-exclusion-grid">
          {checkbox("excludeGroundFloor", "不要一樓")}
          {checkbox("excludeTopFloor", "不要頂樓")}
          {checkbox("excludeMechanicalParking", "不要機械車位")}
        </div>
        <label className="need-tier-text">
          <span>其他排除關鍵字</span>
          <input value={form.excludedFeatures || ""} onChange={(event) => setForm({ ...form, excludedFeatures: event.target.value })} placeholder="例如：面高架、嫌惡設施" />
        </label>
      </div>
    </section>
  );
}
