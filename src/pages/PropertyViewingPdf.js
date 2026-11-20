import React, { useEffect, useRef, useState } from "react";
import { todayStr } from "../lib/dates";
import { getPropertySheetPlan, mergePropertySheets } from "../lib/propertyViewingPdf";
import { downloadPropertySheet } from "../lib/propertySheetDownload";
import { useAuth } from "../AuthContext";
import { useSharedCollection } from "../hooks/useSharedCollection";
import { pdfLibraryError } from "../lib/propertyPdfLibrary";
import { readLatestPdfProperties } from "../lib/propertyPdfLatest";
import { renderAnnotatedPropertyImage } from "../lib/propertyAnnotatedImage";
import AsyncActionButton from "../components/AsyncActionButton";

const isImageSheet = file => file && (/^image\//i.test(file.type) || /\.(?:jpe?g|png|webp|heic|heif|gif|tiff?)$/i.test(file.name));

export default function PropertyViewingPdf({ properties, buyerId, onClose, onGenerated, onBusyChange }) {
  const { user } = useAuth();
  const { items: contacts } = useSharedCollection("contacts", "name", user.uid);
  const buyerName = contacts.find((contact) => contact.id === buyerId)?.name || "";
  const safeBuyerName = buyerName.replace(/[\\/:*?"<>|]/g, "").trim().slice(0, 24);
  const [busy, setBusy] = useState(false);
  const [busyAction, setBusyAction] = useState("");
  const busyRef = useRef(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState(null);
  const [imageResult, setImageResult] = useState(null);
  const [storageNotice, setStorageNotice] = useState("");
  const [storageWarning, setStorageWarning] = useState("");
  const requestId = useRef(0);
  const plan = getPropertySheetPlan(properties);
  const selectionKey = JSON.stringify(properties.map((p) => [p.id, p.totalPrice, p.monthlyRent, p.rentFeeNote, p.leaseStartDate, p.leaseEndDate, p.leaseTermNote, p.sheetFiles, p.sheetFileUrl]));
  const unavailable = plan.filter((entry) => entry.invalid);
  const summaryCount = plan.filter((entry) => entry.missing).length;
  const fileCount = plan.reduce((count, entry) => count + entry.files.length, 0);
  const canCreateImage = plan.length === 1 && !plan[0].invalid && isImageSheet(plan[0].files[0]);

  useEffect(() => () => {
    if (result?.url) URL.revokeObjectURL(result.url);
  }, [result]);
  useEffect(() => () => {
    if (imageResult?.url) URL.revokeObjectURL(imageResult.url);
  }, [imageResult]);
  useEffect(() => { onBusyChange?.(busy); }, [busy, onBusyChange]);
  useEffect(() => () => onBusyChange?.(false), [onBusyChange]);

  useEffect(() => {
    requestId.current += 1;
    setResult(null);
    setImageResult(null);
    setError("");
    setBusy(false);
    busyRef.current = false;
    setBusyAction("");
    setStorageNotice("");
    setStorageWarning("");
    return () => { requestId.current += 1; };
  }, [buyerId, selectionKey]);

  const createPdf = async () => {
    if (busyRef.current || unavailable.length > 0) return;
    busyRef.current = true;
    setBusyAction("pdf");
    const request = ++requestId.current;
    setBusy(true);
    setError("");
    setStorageNotice("");
    setStorageWarning("");
    setResult(null);
    try {
      const latest = await readLatestPdfProperties(properties);
      if (request !== requestId.current) return;
      const merged = await mergePropertySheets(latest, (url) => downloadPropertySheet(url, user), undefined, { latestPrices: true, rentalInfo: true });
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
          const record = await onGenerated({ properties: latest, buyerId, buyerName }, { ...merged, filename });
          if (request === requestId.current) setStorageNotice(`已自動保留在「暫存 ${record.slot + 1}」。離開頁面後，可從「帶看 PDF 暫存／常用」再次讀取。`);
        } catch (saveError) {
          if (request === requestId.current) setStorageWarning(`PDF 已製作完成，但沒有存入暫存。${pdfLibraryError(saveError)}`);
        }
      }
    } catch (err) {
      console.error(err);
      if (request === requestId.current) setError(err.message || "PDF 製作失敗，請確認每份資料表可以正常開啟後再試一次。");
    } finally {
      if (request === requestId.current) { busyRef.current = false; setBusy(false); setBusyAction(""); }
    }
  };

  const createImage = async () => {
    if (busyRef.current || !canCreateImage) return;
    busyRef.current = true;
    setBusyAction("image");
    const request = ++requestId.current;
    setBusy(true); setError(""); setImageResult(null);
    try {
      const latest = await readLatestPdfProperties(properties);
      if (request !== requestId.current) return;
      const latestPlan = getPropertySheetPlan(latest), file = latestPlan[0]?.files[0];
      if (!isImageSheet(file) || !file.url) throw new Error("最新資料表不是圖片，請使用製作 PDF。");
      const loaded = await downloadPropertySheet(file.url, user);
      if (request !== requestId.current) return;
      const image = await renderAnnotatedPropertyImage(latest[0], file, loaded);
      if (request !== requestId.current) return;
      const filename = `${latest[0].listingNo || "物件"}_分享物調.png`.replace(/[\\/:*?"<>|]/g, "");
      setImageResult({ url: URL.createObjectURL(new Blob([image.bytes], { type: "image/png" })), filename, rentalPlacement: image.rentalPlacement });
    } catch (err) {
      if (request === requestId.current) setError(err.message || "分享圖片製作失敗，請確認原始資料表。");
    } finally {
      if (request === requestId.current) { busyRef.current = false; setBusy(false); setBusyAction(""); }
    }
  };

  return (
    <section className="panel property-viewing-pdf" aria-label="合併帶看物件資料表">
      <div className="property-viewing-pdf-head">
        <div>
          <h2>合併帶看資料表 PDF</h2>
          {buyerName && <p>準備介紹給：{buyerName}</p>}
          <p>每間物件只取最新一份資料表，依目前帶看順序整理 {plan.length} 間：{fileCount} 份原始資料表、{summaryCount} 頁系統摘要。多間物件可先在勾選區調整帶看順序；舊檔保留，完成後自動暫存在這台裝置。</p>
          <p>製作時重新讀取最新售價，以紅色粗體大字標示；有調價時將原表舊價打叉，不顯示調價日期。無法確認售價位置的格式，會在頁首另列最新售價，避免蓋到其他資料。</p>
          <p>有填租金或租期的物件，會一起加上月租金、包含費用與租期。原物調有合適的空白欄位就放入欄位；其他格式另加資訊列，保留原始內容。單間圖片物調也可製作 PNG 傳給客人。</p>
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
        <AsyncActionButton type="button" aria-label="製作合併 PDF" onClick={createPdf} disabled={busy || unavailable.length > 0} busy={busyAction === "pdf"} busyLabel="正在製作資料表…" success={Boolean(result)} successLabel="PDF 已完成">製作合併 PDF</AsyncActionButton>
        {canCreateImage && <AsyncActionButton type="button" aria-label="製作分享圖片 PNG" className="btn ghost" onClick={createImage} disabled={busy} busy={busyAction === "image"} busyLabel="正在製作圖片…" success={Boolean(imageResult)} successLabel="圖片已完成">製作分享圖片 PNG</AsyncActionButton>}
        {result && (
          <>
            <a className="btn" href={result.url} target="_blank" rel="noreferrer">開啟 PDF／列印</a>
            <a className="btn ghost" href={result.url} download={result.filename}>下載 PDF</a>
          </>
        )}
        {imageResult && <a className="btn" href={imageResult.url} download={imageResult.filename}>下載分享圖片</a>}
      </div>
      {imageResult && <p className="property-viewing-pdf-ready" role="status">分享圖片已完成，可下載後傳給客人。{imageResult.rentalPlacement === "cell" ? "租金與租期已放入物調空白欄位。" : imageResult.rentalPlacement === "header" ? "租金與租期已放在新增的資訊列。" : ""}原始檔保留，沒有另存到雲端。</p>}
      {result && <p className="property-viewing-pdf-ready" role="status">已整理 {result.fileCount} 份原始資料表、{result.summaryCount} 頁系統摘要，共 {result.pageCount} 頁。開啟後可一次列印全部頁面。</p>}
      {result?.priceOverlayCount > 0 && <p className="property-viewing-pdf-ready">{result.priceOverlayCount} 頁已在原售價欄標示最新售價；價格相同時不畫叉。</p>}
      {result?.priceHeaderCount > 0 && <p className="property-viewing-pdf-summary-note">{result.priceHeaderCount} 頁未能確認原售價位置，已在頁首清楚標示最新售價。</p>}
      {result?.rentalOverlayCount > 0 && <p className="property-viewing-pdf-ready">{result.rentalOverlayCount} 頁已在物調空白欄位標示租金與租期。</p>}
      {result?.rentalHeaderCount > 0 && <p className="property-viewing-pdf-summary-note">{result.rentalHeaderCount} 頁已另加租金與租期資訊列。</p>}
      {(result || imageResult) && <p className="property-viewing-pdf-summary-note">已下載或暫存的檔案不會自行更新；售價、租金或租期變更後，請重新製作。</p>}
      {storageNotice && <p className="property-viewing-pdf-ready" role="status">{storageNotice}</p>}
      {storageWarning && <p className="property-viewing-pdf-warning" role="alert">{storageWarning} 仍可使用上方的下載按鈕保留檔案。</p>}
    </section>
  );
}
