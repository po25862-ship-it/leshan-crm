import React from "react";
import { toRocDateStr } from "../lib/dates";

// 顯示在日期欄位旁邊，把選好的西元日期轉成民國年文字當參考
// 用法：<RocDateHint date={form.someDate} />
export default function RocDateHint({ date }) {
  const text = toRocDateStr(date);
  if (!text) return null;
  return (
    <span
      className="mono"
      style={{ fontSize: 11, color: "var(--muted)", marginLeft: 8, whiteSpace: "nowrap" }}
    >
      {text}
    </span>
  );
}
