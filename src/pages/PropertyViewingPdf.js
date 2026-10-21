import React, { useEffect, useState } from "react";
import { todayStr } from "../lib/dates";
import { getPropertySheetPlan, mergePropertySheets } from "../lib/propertyViewingPdf";
import { downloadPropertySheet } from "../lib/propertySheetDownload";
import { useAuth } from "../AuthContext";

export default function PropertyViewingPdf({ properties, onClose }) {
  const { user } = useAuth();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState(null);
  const plan = getPropertySheetPlan(properties);
  const unavailable = plan.filter((entry) => entry.invalid);
  const summaryCount = plan.filter((entry) => entry.missing).length;
  const fileCount = plan.reduce((count, entry) => count + entry.files.length, 0);

  useEffect(() => () => {
    if (result?.url) URL.revokeObjectURL(result.url);
  }, [result]);

  const createPdf = async () => {
    if (busy || unavailable.length > 0) return;
    setBusy(true);
    setError("");
    setResult(null);
    try {
      const merged = await mergePropertySheets(properties, (url) => downloadPropertySheet(url, user));
      const url = URL.createObjectURL(new Blob([merged.bytes], { type: "application/pdf" }));
      setResult({
        ...merged,
        url,
        filename: `帶看物件資料表_${todayStr()}_${properties.length}間.pdf`,
      });
    } catch (err) {
      console.error(err);
      setError(err.message || "PDF 製作失敗，請確認每份資料表可以正常開啟後再試一次。");
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="panel property-viewing-pdf" aria-label="合併帶看物件資料表">
      <div className="property-viewing-pdf-head">
        <div>
          <h2>合併帶看資料表 PDF</h2>
          <p>依勾選順序整理 {plan.length} 間物件：{fileCount} 份原始資料表、{summaryCount} 頁系統摘要。原始檔不會更動，也不會另外上傳合併檔。</p>
        </div>
        <button type="button" className="btn ghost" onClick={onClose}>關閉</button>
      </div>
      <ol className="property-viewing-pdf-list">
        {plan.map((entry) => (
          <li key={entry.id}>
            <strong>{entry.title}</strong>
            {entry.listingNo && <span>{entry.listingNo}</span>}
            <em className={entry.invalid ? "is-missing" : entry.missing ? "is-summary" : ""}>
              {entry.invalid ? "檔案連結不完整" : entry.missing ? "以系統摘要代替原始物調表" : `${entry.files.length} 份資料表`}
            </em>
            {entry.files.length > 0 && <small>{entry.files.map((file) => file.name).join("、")}</small>}
          </li>
        ))}
      </ol>
      {summaryCount > 0 && (
        <p className="property-viewing-pdf-summary-note" role="status">
          {summaryCount} 間尚未上傳原始資料表，將以 CRM 現有的價格、面積、格局、地址等欄位產生摘要；缺少的欄位會標示「未提供」，不會自行補寫。
        </p>
      )}
      {unavailable.length > 0 && (
        <p className="property-viewing-pdf-warning" role="alert">
          有 {unavailable.length} 間資料表連結不完整。請先到該物件修正，或取消勾選後再製作，避免漏印。
        </p>
      )}
      {error && <p className="property-viewing-pdf-warning" role="alert">{error}</p>}
      <div className="property-viewing-pdf-actions">
        <button type="button" className="btn" onClick={createPdf} disabled={busy || unavailable.length > 0}>
          {busy ? "正在合併資料表…" : "製作合併 PDF"}
        </button>
        {result && (
          <>
            <a className="btn" href={result.url} target="_blank" rel="noreferrer">開啟 PDF／列印</a>
            <a className="btn ghost" href={result.url} download={result.filename}>下載 PDF</a>
          </>
        )}
      </div>
      {result && <p className="property-viewing-pdf-ready" role="status">已整理 {result.fileCount} 份原始資料表、{result.summaryCount} 頁系統摘要，共 {result.pageCount} 頁。開啟後可一次列印全部頁面。</p>}
    </section>
  );
}
