import React from "react";
import { useCollection } from "../hooks/useCollection";
import { useAuth } from "../AuthContext";

// 你（主要負責人）本來就看得到全部資料，不需要、也不應該出現在「可以分享」的名單裡
const MAIN_OWNER_UID = "KiYlsnWcChW5muRkG167r7Mi1132";

// value 是已分享的 uid 陣列，onChange 傳回更新後的陣列
export default function ShareWithPicker({ value, onChange }) {
  const { user } = useAuth();
  const { items: colleagues } = useCollection("colleagues", "name");
  const shared = value || [];
  const remaining = colleagues.filter((c) => c.id !== user.uid && c.id !== MAIN_OWNER_UID && !shared.includes(c.id));

  const addShare = (uid) => {
    if (!uid) return;
    onChange([...shared, uid]);
  };
  const removeShare = (uid) => onChange(shared.filter((id) => id !== uid));

  const nameOf = (uid) => colleagues.find((c) => c.id === uid)?.name || "（未知帳號）";

  return (
    <div>
      <div style={{ fontSize: 11, fontWeight: 700, color: "var(--muted)", marginBottom: 6 }}>目前連結中</div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 12 }}>
        {shared.length === 0 && <span style={{ fontSize: 13, color: "var(--muted)" }}>目前沒有分享給任何人</span>}
        {shared.map((uid) => (
          <span
            key={uid}
            className="tag"
            style={{ display: "inline-flex", alignItems: "center", gap: 6 }}
          >
            {nameOf(uid)}
            <button
              type="button"
              onClick={() => removeShare(uid)}
              style={{ border: "none", background: "none", cursor: "pointer", color: "inherit", fontSize: 13, lineHeight: 1, padding: 0 }}
              title="取消分享"
            >
              ×
            </button>
          </span>
        ))}
      </div>

      <div style={{ fontSize: 11, fontWeight: 700, color: "var(--muted)", marginBottom: 6 }}>分享給同事</div>
      {remaining.length === 0 ? (
        <div style={{ fontSize: 12, color: "var(--muted)" }}>
          {colleagues.length <= 1 ? "目前還沒有同事註冊帳號" : "沒有其他同事可以選了"}
        </div>
      ) : (
        <select value="" onChange={(e) => addShare(e.target.value)}>
          <option value="">＋ 選擇要新增分享的同事</option>
          {remaining.map((c) => (
            <option key={c.id} value={c.id}>{c.name}</option>
          ))}
        </select>
      )}
    </div>
  );
}
