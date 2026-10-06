import React, { useState } from "react";
import { normalizeTimeInput } from "../lib/timeInput";

export default function ManualTimeInput({ value, onChange, style }) {
  const [showPicker, setShowPicker] = useState(false);
  const normalized = normalizeTimeInput(value);

  return (
    <div style={{ display: "flex", gap: 4, flexWrap: "wrap", width: 164, flexShrink: 0, alignItems: "stretch" }}>
      <input
        aria-label="手動輸入時間"
        type="text"
        inputMode="numeric"
        autoComplete="off"
        placeholder="例如 14:30"
        title="可輸入 14:30、1430 或 9"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        onBlur={() => { if (normalized && normalized !== value) onChange(normalized); }}
        style={{ ...style, boxSizing: "border-box", width: 100, minWidth: 0, flex: "1 1 90px" }}
      />
      <button
        type="button"
        aria-label={showPicker ? "收起時間選擇器" : "打開時間選擇器"}
        onClick={() => setShowPicker((open) => !open)}
        style={{ border: "1px solid var(--border)", borderRadius: 7, background: "#fff", padding: "0 6px", fontSize: 11, cursor: "pointer" }}
      >
        選擇
      </button>
      {showPicker && (
        <input
          aria-label="時間選擇器"
          type="time"
          value={normalized || ""}
          onChange={(event) => { onChange(event.target.value); setShowPicker(false); }}
          style={{ ...style, boxSizing: "border-box", width: "100%" }}
        />
      )}
    </div>
  );
}
