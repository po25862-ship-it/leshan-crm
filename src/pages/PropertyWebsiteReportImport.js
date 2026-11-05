import React, { useState } from "react";
import { analyzeWebsiteReport } from "../lib/propertyWebsiteReport";

export default function PropertyWebsiteReportImport({ properties, update }) {
  const [payload, setPayload] = useState(null);
  const [preview, setPreview] = useState(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const read = async event => {
    const file = event.target.files?.[0]; event.target.value = "";
    setPreview(null); setPayload(null); setMessage("");
    if (!file) return;
    try {
      if (file.size > 1500000) throw new Error("核對檔過大，請選擇官網狀態檔。");
      const next = JSON.parse(await file.text());
      setPreview(analyzeWebsiteReport(next, properties)); setPayload(next);
    } catch (error) { setMessage(error.message || "無法讀取核對檔。"); }
  };
  const apply = async () => {
    if (busy || !payload) return;
    setBusy(true); setMessage(""); let count = 0;
    try {
      // Re-evaluate against the current collection before writes; never overwrite a newer scan.
      const next = analyzeWebsiteReport(payload, properties);
      for (const item of next.updates) { await update(item.id, item.patch); count++; }
      setPreview({ ...next, updates: [] }); setPayload(null);
      setMessage(`已更新 ${count} 筆官網紀錄。案件網址保留，其他物件資料不變。`);
    } catch { setMessage(`已更新 ${count} 筆，其餘尚未完成，請重新選擇核對檔再試。`); }
    finally { setBusy(false); }
  };
  return <details className="property-website-tools">
    <summary>官網狀態與核對紀錄</summary>
    <p>依公司後台「官網點閱」欄位是否有超連結判斷；沒有紀錄顯示待確認。每日同步會更新。官網會限制雲端程式連線，因此不把連線失敗當成下架。</p>
    <label className="btn ghost" style={{ display: "inline-flex", cursor: "pointer" }}>匯入公司官網核對檔<input aria-label="公司官網核對檔" type="file" accept=".json,application/json" disabled={busy} style={{ display: "none" }} onChange={read} /></label>
    {preview && <div>
      <p role="status">已比對 {preview.matched} 筆：需要修正 {preview.updates.length} 筆、原本一致 {preview.unchanged} 筆、略過 {preview.skipped} 筆（未找到、編號重複或已有較新紀錄）。</p>
      {preview.updates.length > 0 && <><ul>{preview.updates.map(item => <li key={item.id}>{item.listingNo} {item.title} → {item.patch.websitePublished ? "官網已上架" : "官網未上架"}</li>)}</ul><button type="button" className="btn" disabled={busy} onClick={apply}>{busy ? "更新中…" : `更新 ${preview.updates.length} 筆官網紀錄`}</button></>}
    </div>}
    {message && <p role="status">{message}</p>}
  </details>;
}
