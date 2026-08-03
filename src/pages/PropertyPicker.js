import React, { useState, useRef, useEffect } from "react";

// 打字搜尋案名/地址，點選後回傳選中的物件（onSelect(property)）
// properties: 完整物件清單；value: 目前顯示在輸入框裡的文字（通常是案名）
export default function PropertyPicker({ properties, value, onChange, onSelect, placeholder }) {
  const [keyword, setKeyword] = useState(value || "");
  const [open, setOpen] = useState(false);
  const wrapRef = useRef(null);

  useEffect(() => setKeyword(value || ""), [value]);

  useEffect(() => {
    const onClickOutside = (e) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, []);

  const k = keyword.trim();
  const filtered = k
    ? properties.filter((p) => (p.title || "").includes(k) || (p.address || "").includes(k)).slice(0, 20)
    : properties.slice(0, 20);

  const handleInputChange = (e) => {
    const val = e.target.value;
    setKeyword(val);
    setOpen(true);
    if (onChange) onChange(val);
  };

  const handleSelect = (p) => {
    setKeyword(p.title);
    setOpen(false);
    if (onChange) onChange(p.title);
    if (onSelect) onSelect(p);
  };

  return (
    <div ref={wrapRef} style={{ position: "relative" }}>
      <input
        value={keyword}
        onChange={handleInputChange}
        onFocus={() => setOpen(true)}
        placeholder={placeholder || "輸入案名或地址搜尋…"}
        style={{ width: "100%", padding: "9px 10px", border: "1px solid var(--border)", borderRadius: 7, fontSize: 13 }}
      />
      {open && filtered.length > 0 && (
        <div
          style={{
            position: "absolute",
            top: "100%",
            left: 0,
            right: 0,
            zIndex: 20,
            background: "#fff",
            border: "1px solid var(--border)",
            borderRadius: 8,
            marginTop: 4,
            maxHeight: 240,
            overflowY: "auto",
            boxShadow: "0 4px 12px rgba(0,0,0,0.08)",
          }}
        >
          {filtered.map((p) => (
            <div
              key={p.id}
              onClick={() => handleSelect(p)}
              style={{ padding: "8px 12px", fontSize: 13, cursor: "pointer", borderBottom: "1px solid var(--border)" }}
              onMouseDown={(e) => e.preventDefault()}
            >
              <div style={{ fontWeight: 700 }}>{p.title}</div>
              {p.address && <div style={{ fontSize: 11, color: "var(--muted)" }}>{p.address}</div>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
