import React, { useEffect, useRef, useState } from "react";
import { todayStr } from "../lib/dates";
import { getPropertySheetPlan, mergePropertySheets } from "../lib/propertyViewingPdf";
import { downloadPropertySheet } from "../lib/propertySheetDownload";
import { useAuth } from "../AuthContext";
import { useSharedCollection } from "../hooks/useSharedCollection";
import { pdfLibraryError } from "../lib/propertyPdfLibrary";

export default function PropertyViewingPdf({ properties, buyerId, onClose, onGenerated }) {
  const { user } = useAuth();
  const { items: contacts } = useSharedCollection("contacts", "name", user.uid);
  const buyerName = contacts.find((contact) => contact.id === buyerId)?.name || "";
  const safeBuyerName = buyerName.replace(/[\\/:*?"<>|]/g, "").trim().slice(0, 24);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState(null);
  const [storageNotice, setStorageNotice] = useState("");
  const [storageWarning, setStorageWarning] = useState("");
  const requestId = useRef(0);
  const plan = getPropertySheetPlan(properties);
  const unavailable = plan.filter((entry) => entry.invalid);
  const summaryCount = plan.filter((entry) => entry.missing).length;
  const fileCount = plan.reduce((count, entry) => count + entry.files.length, 0);

  useEffect(() => () => {
    if (result?.url) URL.revokeObjectURL(result.url);
  }, [result]);

  useEffect(() => {
    requestId.current += 1;
    setResult(null);
    setBusy(false);
    setStorageNotice("");
    setStorageWarning("");
    return () => { requestId.current += 1; };
  }, [buyerId]);

  const createPdf = async () => {
    if (busy || unavailable.length > 0) return;
    const request = ++requestId.current;
    setBusy(true);
    setError("");
    setStorageNotice("");
    setStorageWarning("");
    setResult(null);
    try {
      const merged = await mergePropertySheets(properties, (url) => downloadPropertySheet(url, user));
      if (request !== requestId.current) return;
      const url = URL.createObjectURL(new Blob([merged.bytes], { type: "application/pdf" }));
      const filename = `帶看物件資料表_${safeBuyerName ? `${safeBuyerName}_` : ""}${todayStr()}_${properties.length}間.pdf`;
      setResult({
        ...merged,
        bytes: undefined,
        url,
        filename,
      });
      if (onGenerated) {
        try {
          const record = await onGenerated({ properties, buyerId, buyerName }, { ...merged, filename });
          if (request === requestId.current) setStorageNotice(`已自動保留在「暫存 ${record.slot + 1}」。離開頁面後，可從「帶看 PDF 暫存／常用」再次讀取。`);
        } catch (saveError) {
          if (request === requestId.current) setStorageWarning(`PDF 已製作完成，但沒有存入暫存。${pdfLibraryError(saveError)}`);
        }
      }
    } catch (err) {
      console.error(err);
      if (request === requestId.current) setError(err.message || "PDF 製作失敗，請確認每份資料表可以正常開啟後再試一次。");
    } finally {
      if (request === requestId.current) setBusy(false);
    }
  };

  return (
    <section className="panel property-viewing-pdf" aria-label="合併帶看物件資料表">
      <div className="property-viewing-pdf-head">
        <div>
          <h2>合併帶看資料表 PDF</h2>
          {buyerName && <p>準備介紹給：{buyerName}</p>}
          <p>每間物件只取最新一份資料表，依勾選順序整理 {plan.length} 間：{fileCount} 份原始資料表、{summaryCount} 頁系統摘要。舊檔保留；完成後自動暫存在這台裝置，不會上傳合併檔。</p>
        </div>
        <button type="button" className="btn ghost" onClick={onClose}>關閉</button>
      </div>
      <ol className="property-viewing-pdf-list">
        {plan.map((entry) => (
          <li key={entry.id}>
            <strong>{entry.title}</strong>
            {entry.listingNo && <span>{entry.listingNo}</span>}
            <em className={entry.invalid ? "is-missing" : entry.missing ? "is-summary" : ""}>
              {entry.invalid ? "檔案連結不完整" : entry.missing ? "以系統摘要代替原始物調表" : entry.skippedCount > 0 ? `取最新 1 份（略過 ${entry.skippedCount} 份舊檔）` : "1 份資料表"}
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
      {storageNotice && <p className="property-viewing-pdf-ready" role="status">{storageNotice}</p>}
      {storageWarning && <p className="property-viewing-pdf-warning" role="alert">{storageWarning} 仍可使用上方的下載按鈕保留檔案。</p>}
    </section>
  );
}
