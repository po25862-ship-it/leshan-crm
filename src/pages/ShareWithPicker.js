import React from "react";
import { useCollection } from "../hooks/useCollection";
import { useAuth } from "../AuthContext";

// 勾選要分享給哪些同事，value 是 uid 陣列
export default function ShareWithPicker({ value, onChange }) {
  const { user } = useAuth();
  const { items: colleagues } = useCollection("colleagues", "name");
  const others = colleagues.filter((c) => c.id !== user.uid);

  const toggle = (uid) => {
    const next = (value || []).includes(uid)
      ? (value || []).filter((id) => id !== uid)
      : [...(value || []), uid];
    onChange(next);
  };

  if (others.length === 0) {
    return <div style={{ fontSize: 12, color: "var(--muted)" }}>目前還沒有同事註冊帳號</div>;
  }

  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
      {others.map((c) => (
        <label key={c.id} style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13, cursor: "pointer" }}>
          <input type="checkbox" checked={(value || []).includes(c.id)} onChange={() => toggle(c.id)} />
          {c.name}
        </label>
      ))}
    </div>
  );
}
