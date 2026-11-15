import React, { useMemo, useRef, useState } from "react";
import SearchSelect from "./SearchSelect";
import { choiceKey, choiceText } from "../lib/propertyChoices";
import { buyerSourceChanges, buyerSourceGroups, reverseSourceChanges } from "../lib/buyerSources";
import { saveBuyerSourceChanges } from "../lib/buyerSourceRepository";
import "./BuyerSourceManager.css";

export default function BuyerSourceManager({ buyers, uid, onClose }) {
  const [query, setQuery] = useState("");
  const [action, setAction] = useState(null);
  const [target, setTarget] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [undo, setUndo] = useState(null);
  const lock = useRef(false);
  const groups = useMemo(() => buyerSourceGroups(buyers), [buyers]);
  const filtered = groups.filter(group => choiceKey(group.name).includes(choiceKey(query)));
  const source = groups.find(group => group.key === action?.key);
  const replacement = action?.mode === "delete" ? "" : choiceText(target);
  const merge = action?.mode === "edit" && groups.find(group => group.key !== source?.key && group.key === choiceKey(replacement));
  const changes = source ? buyerSourceChanges(buyers, source.key, replacement) : [];
  const valid = source && changes.length > 0 && (action.mode === "delete" || replacement);

  function begin(group, mode) {
    setAction({ key: group.key, mode }); setTarget(group.name); setError(""); setMessage("");
  }
  async function apply(plan, isUndo = false) {
    if (lock.current || !plan.length) return;
    lock.current = true; setBusy(true); setError(""); setMessage("");
    try {
      const saved = await saveBuyerSourceChanges(uid, plan);
      setUndo(isUndo ? null : reverseSourceChanges(saved));
      setMessage(isUndo ? `已復原 ${saved.length} 位買方的來源。` : `已整理 ${saved.length} 位買方的來源，其他資料保留。`);
      setAction(null);
    } catch (e) {
      setError(e.code === "permission-denied" ? "目前無權限整理部分買方，請重新整理後再試。本次沒有修改資料。" : e.message || "整理失敗，請稍後再試。");
    } finally { lock.current = false; setBusy(false); }
  }

  return <section className="panel buyer-source-manager" aria-label="管理買方來源" aria-busy={busy}>
    <div className="buyer-source-heading"><div><h2>管理來源</h2><p>改名稱、合併重複來源，或清掉打錯的來源。</p></div><button type="button" className="btn ghost" disabled={busy} onClick={onClose}>關閉管理來源</button></div>
    <p className="buyer-source-scope">整理範圍是目前可查看及編輯的買方，包含同事分享的資料。每次確認後，只會更新指定買方的來源；姓名、客需及互動紀錄保留。</p>
    {message && <div className="buyer-source-success" role="status">{message}</div>}
    {error && <div className="buyer-source-error" role="alert">{error}</div>}
    {undo && <div className="buyer-source-undo"><button type="button" className="btn ghost" disabled={busy} onClick={() => apply(undo, true)}>復原上次整理</button><small>關閉這個整理頁面前可復原；來源若又被修改，會先停止，避免蓋掉新資料。</small></div>}

    {action ? <form className="buyer-source-confirm" onSubmit={event => { event.preventDefault(); if (valid) apply(changes); }}>
      <h3>{action.mode === "delete" ? "刪除來源" : "修改／合併來源"}</h3>
      {source ? <>
        <div className="buyer-source-original"><span>目前來源</span><strong>{source.name}</strong><span>{source.buyers.length} 位買方使用</span></div>
        {action.mode === "edit" ? <SearchSelect label="修改後的來源" value={target} options={groups.map(group => group.name)} onChange={setTarget} disabled={busy} placeholder="輸入正確名稱，或選擇要合併的來源" help="改成已有的來源名稱，就會合併到同一個選項。" /> : <p>確認後，這 {changes.length} 位買方的來源欄位會清空，來源也會從選單移除。買方資料不會刪除。</p>}
        {merge && <p className="buyer-source-preview">將併入「{merge.name}」，整理後這個來源共有 {source.buyers.length + merge.buyers.length} 位買方。</p>}
        {action.mode === "edit" && !merge && <p className="buyer-source-preview">{changes.length ? `將更新 ${changes.length} 位買方的來源。` : "目前名稱沒有變更。"}</p>}
        <details><summary>查看本次會更新的買方（{changes.length} 位）</summary><ul>{source.buyers.filter(buyer => changes.some(change => change.id === buyer.id)).map(buyer => <li key={buyer.id}>{buyer.name || "未命名買方"}</li>)}</ul></details>
        <div className="buyer-source-confirm-actions"><button className={`btn${action.mode === "delete" ? " danger" : ""}`} type="submit" disabled={busy || !valid}>{busy ? "儲存中…" : action.mode === "delete" ? "確認刪除來源" : merge ? "確認合併來源" : "確認修改來源"}</button><button type="button" className="btn ghost" disabled={busy} onClick={() => { setAction(null); setError(""); }}>取消整理</button></div>
      </> : <><p>這個來源已變更，請返回清單重新選擇。</p><button className="btn ghost" type="button" onClick={() => { setAction(null); setError(""); }}>返回來源清單</button></>}
    </form> : <>
      <label className="buyer-source-search">搜尋來源<input value={query} disabled={busy} onChange={event => setQuery(event.target.value)} placeholder="例如：591、介紹、FB" /></label>
      <div className="buyer-source-count">{query ? `找到 ${filtered.length} 個來源` : `共有 ${groups.length} 個來源`}</div>
      <div className="buyer-source-list">{filtered.map(group => <div key={group.key} className="buyer-source-row"><div><strong>{group.name}</strong><span>{group.buyers.length} 位買方使用{group.variants.size > 1 ? "・含不同大小寫／格式" : ""}</span></div><div className="buyer-source-row-actions"><button className="btn ghost" type="button" aria-label={`修改或合併來源：${group.name}`} disabled={busy} onClick={() => begin(group, "edit")}>修改／合併</button><button className="btn ghost buyer-source-delete" type="button" aria-label={`刪除來源：${group.name}`} disabled={busy} onClick={() => begin(group, "delete")}>刪除</button></div></div>)}</div>
      {!filtered.length && <p className="empty-state">{query ? "找不到符合的來源，換個字試試。" : "目前還沒有來源。新增買方並填入來源後，就會出現在這裡。"}</p>}
    </>}
  </section>;
}
