import React, { useEffect, useState } from "react";
import { useAuth } from "../AuthContext";
import { useSharedCollection } from "../hooks/useSharedCollection";
import { makePdfSelection, PDF_LIBRARY_LIMIT, pdfLibraryError, readSavedPdf, resolvePdfSelection } from "../lib/propertyPdfLibrary";

function savedTime(value) {
  return new Date(value).toLocaleString("zh-TW", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit", hour12: false });
}

function PropertyPdfLibraryContents({ library, properties, selectedProperties, buyerId, onLoad }) {
  const { user } = useAuth();
  const { items: contacts, loading: contactsLoading } = useSharedCollection("contacts", "name", user.uid);
  const [tab, setTab] = useState("draft");
  const [name, setName] = useState("");
  const [favoriteSlot, setFavoriteSlot] = useState("");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [renaming, setRenaming] = useState(null);
  const [renameValue, setRenameValue] = useState("");
  const [pendingDelete, setPendingDelete] = useState(null);
  const [pendingReplace, setPendingReplace] = useState(null);
  const [preview, setPreview] = useState(null);
  const drafts = library.records.filter((record) => record.kind === "draft");
  const favorites = library.records.filter((record) => record.kind === "favorite");
  const buyerName = contacts.find((contact) => contact.id === buyerId)?.name || "";

  useEffect(() => () => { if (preview?.url) URL.revokeObjectURL(preview.url); }, [preview]);

  const run = async (action) => {
    if (busy) return;
    setBusy(true);
    setError("");
    setNotice("");
    try { await action(); }
    catch (err) { setError(pdfLibraryError(err)); }
    finally { setBusy(false); }
  };

  const saveFavorite = () => run(async () => {
    const firstEmpty = Array.from({ length: PDF_LIBRARY_LIMIT }, (_, slot) => slot).find((slot) => !favorites.some((record) => record.slot === slot));
    const slot = favoriteSlot === "" ? firstEmpty : Number(favoriteSlot);
    if (slot === undefined) throw new Error("常用已滿 5 格，請先選擇要更新的那一格。");
    const selection = makePdfSelection(selectedProperties, buyerId, buyerName, name);
    if (favorites.some((record) => record.slot === slot)) {
      setPendingReplace({ slot, selection });
      return;
    }
    await library.saveFavorite(slot, selection);
    setTab("favorite");
    setName("");
    setFavoriteSlot("");
    setNotice(`已儲存到常用 ${slot + 1}。下次載入後，會以最新物件資料重新製作 PDF。`);
  });

  const load = (record) => {
    setError("");
    setNotice("");
    const resolved = resolvePdfSelection(record, properties);
    if (resolved.missing.length) {
      setError(`找不到 ${resolved.missing.length} 間：${resolved.missing.map((property) => property.title).join("、")}。為避免漏印，這次沒有載入；請重新選取需要的物件。已存的 PDF 仍可讀取。`);
      return;
    }
    const availableBuyer = contacts.find((contact) => contact.id === record.buyerId && (contact.tags || []).includes("買方"));
    onLoad(resolved.properties, availableBuyer ? record.buyerId : "");
    const buyerNotice = record.buyerId && !availableBuyer ? "原客戶已不在可用清單，請重新選擇介紹對象。" : "";
    const inactive = resolved.properties.filter((property) => property.status && property.status !== "active").length;
    setNotice(`已依原順序載入 ${resolved.properties.length} 間，請核對最新資料。${buyerNotice}${inactive ? `其中 ${inactive} 間目前不是在售狀態，製作前請確認。` : ""}`);
  };

  const retrieve = (record) => run(async () => {
    const bytes = await readSavedPdf(user.uid, record.slot);
    if (!bytes) throw new Error("這份 PDF 暫存已不存在，請重新載入物件製作。");
    setPreview({ url: URL.createObjectURL(new Blob([bytes], { type: "application/pdf" })), key: record.key, filename: record.filename, generatedAt: record.generatedAt });
  });

  return (
    <>
        <p className="pdf-library-help">每位同事各自 5 個暫存、5 個常用。僅保存在目前裝置與瀏覽器，主、副系統分開保存；不會上傳 PDF，也不會共用給其他同事。清除瀏覽資料會一併清除。</p>
        {selectedProperties.length > 0 && <div className="pdf-library-save">
          <label>這組物件的名稱<input value={name} maxLength={60} placeholder={buyerName ? `${buyerName}的帶看物件` : "例如：A7 兩房車"} onChange={(event) => setName(event.target.value)} /></label>
          <label>常用位置<select value={favoriteSlot} onChange={(event) => { setFavoriteSlot(event.target.value); setPendingReplace(null); }}>
            <option value="">自動放入空位</option>
            {Array.from({ length: PDF_LIBRARY_LIMIT }, (_, slot) => <option key={slot} value={slot}>常用 {slot + 1}：{favorites.find((record) => record.slot === slot)?.name || "空位"}</option>)}
          </select></label>
          <button type="button" className="btn" disabled={busy || library.loading || contactsLoading} onClick={saveFavorite}>將已選 {selectedProperties.length} 間存為常用</button>
        </div>}
        {pendingReplace && <div className="pdf-library-confirm" role="alert">
          <p>要將常用 {pendingReplace.slot + 1}「{favorites.find((record) => record.slot === pendingReplace.slot)?.name}」更新成「{pendingReplace.selection.name}」嗎？</p>
          <button className="btn" type="button" disabled={busy} onClick={() => run(async () => { await library.saveFavorite(pendingReplace.slot, pendingReplace.selection); setPendingReplace(null); setTab("favorite"); setNotice("常用紀錄已更新。"); })}>確認更新這一格</button>
          <button className="btn ghost" type="button" disabled={busy} onClick={() => setPendingReplace(null)}>取消</button>
        </div>}
        <div className="pdf-library-tabs" role="group" aria-label="PDF 紀錄種類">
          <button id="pdf-library-draft-tab" type="button" aria-pressed={tab === "draft"} aria-controls="pdf-library-records" className={tab === "draft" ? "btn" : "btn ghost"} onClick={() => { setTab("draft"); setPendingDelete(null); }}>暫存（{drafts.length}／5）</button>
          <button id="pdf-library-favorite-tab" type="button" aria-pressed={tab === "favorite"} aria-controls="pdf-library-records" className={tab === "favorite" ? "btn" : "btn ghost"} onClick={() => { setTab("favorite"); setPendingDelete(null); }}>常用（{favorites.length}／5）</button>
        </div>
        <p className="pdf-library-help">{tab === "draft" ? "製作 PDF 成功後自動暫存；相同物件順序與客戶會更新原格。滿 5 份時更新最早製作的一份，不影響常用紀錄。已存 PDF 不會跟著調價，請載入後重新製作以套用最新售價。" : "常用保留物件組合與順序，不會自動被覆蓋。載入後使用目前的價格與最新資料表重新製作。"}</p>
        {(library.error || error) && <p className="property-viewing-pdf-warning" role="alert">{error || library.error}</p>}
        {notice && <p className="pdf-library-notice" role="status">{notice}</p>}
        {library.loading ? <p>正在讀取這台裝置的紀錄…</p> : <div id="pdf-library-records" className="pdf-library-grid" role="region" aria-labelledby={`pdf-library-${tab}-tab`}>
          {Array.from({ length: PDF_LIBRARY_LIMIT }, (_, slot) => {
            const record = library.records.find((entry) => entry.kind === tab && entry.slot === slot);
            return <article key={`${tab}-${slot}`} className={`pdf-library-card${record ? "" : " is-empty"}`}>
              <small>{tab === "draft" ? "暫存" : "常用"} {slot + 1}</small>
              {!record ? <p>尚未儲存</p> : <>
                {renaming === record.key ? <form onSubmit={(event) => { event.preventDefault(); run(async () => { await library.rename(record.kind, slot, renameValue); setRenaming(null); setNotice("名稱已更新。"); }); }}>
                  <label>紀錄名稱<input autoFocus value={renameValue} maxLength={60} onChange={(event) => setRenameValue(event.target.value)} /></label>
                  <button className="btn" type="submit" disabled={busy || !renameValue.trim()}>儲存名稱</button><button className="btn ghost" type="button" onClick={() => setRenaming(null)}>取消</button>
                </form> : <h4>{record.name}</h4>}
                <p>{record.properties.length} 間 · {record.buyerName || "未指定客戶"}<br />{record.hasPdf ? `PDF 製作：${savedTime(record.generatedAt)} · ${record.pageCount} 頁` : `更新：${savedTime(record.updatedAt)}`}</p>
                <ol>{record.properties.map((property) => <li key={property.id}>{property.title}{property.listingNo ? `（${property.listingNo}）` : ""}</li>)}</ol>
                <div className="pdf-library-card-actions">
                  <button className="btn" type="button" disabled={busy || contactsLoading} onClick={() => load(record)}>載入物件製作 PDF</button>
                  {record.hasPdf && <button className="btn ghost" type="button" disabled={busy} onClick={() => retrieve(record)}>讀取已存 PDF</button>}
                  <button className="btn ghost" type="button" disabled={busy} onClick={() => { setRenaming(record.key); setRenameValue(record.name); }}>改名稱</button>
                  <button className="btn ghost" type="button" disabled={busy} onClick={() => setPendingDelete(record.key)}>刪除紀錄</button>
                </div>
                {preview?.key === record.key && <div className="pdf-library-file" role="status">
                  <p>這是 {savedTime(preview.generatedAt)} 製作的版本；要用最新資料請重新製作。</p>
                  <a className="btn" href={preview.url} target="_blank" rel="noreferrer">開啟 PDF／列印</a><a className="btn ghost" href={preview.url} download={preview.filename}>下載 PDF</a>
                </div>}
                {pendingDelete === record.key && <div className="pdf-library-confirm">
                  <p>刪除「{record.name}」這份紀錄？物件原始資料與附件不會刪除。</p>
                  <button className="btn" type="button" disabled={busy} onClick={() => run(async () => { await library.remove(record.kind, slot); if (preview?.key === record.key) setPreview(null); setPendingDelete(null); setNotice("已刪除這份紀錄。"); })}>確認刪除紀錄</button>
                  <button className="btn ghost" type="button" disabled={busy} onClick={() => setPendingDelete(null)}>取消</button>
                </div>}
              </>}
            </article>;
          })}
        </div>}
    </>
  );
}

export default function PropertyPdfLibrary(props) {
  const [expanded, setExpanded] = useState(false);
  const drafts = props.library.records.filter((record) => record.kind === "draft");
  const favorites = props.library.records.filter((record) => record.kind === "favorite");
  return (
    <section className="panel pdf-library" aria-label="帶看 PDF 暫存與常用紀錄">
      <div className="pdf-library-heading">
        <div><h3>帶看 PDF 暫存／常用</h3><span>我的暫存 {drafts.length}／5 · 常用 {favorites.length}／5</span></div>
        <button className="btn ghost" type="button" aria-expanded={expanded} onClick={() => setExpanded((value) => !value)}>{expanded ? "收起紀錄" : "開啟紀錄"}</button>
      </div>
      {expanded && <PropertyPdfLibraryContents {...props} />}
    </section>
  );
}
