import React, { useEffect, useId, useRef, useState } from "react";
import { fileSelectionProblem } from "../lib/fileSelection";
import "./WorkflowControls.css";

export default function FileDropZone({ label, hint, accept, multiple = true, maxFiles, maxBytes, disabled = false, onFiles }) {
  const id = useId(), input = useRef(null), locked = useRef(false), depth = useRef(0), alive = useRef(true);
  const [dragging, setDragging] = useState(false), [working, setWorking] = useState(false), [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const unavailable = disabled || working;
  useEffect(() => {
    alive.current = true;
    const preventFileNavigation = event => { if ([...(event.dataTransfer?.types || [])].includes("Files")) event.preventDefault(); };
    window.addEventListener("dragover", preventFileNavigation);
    window.addEventListener("drop", preventFileNavigation);
    return () => { alive.current = false; window.removeEventListener("dragover", preventFileNavigation); window.removeEventListener("drop", preventFileNavigation); };
  }, []);
  async function receive(rawFiles) {
    if (disabled || locked.current) return;
    const files = Array.from(rawFiles || []);
    const problem = fileSelectionProblem(files, { accept, multiple, maxFiles, maxBytes });
    setNotice(""); setError(problem);
    if (problem) return;
    locked.current = true; setWorking(true);
    try { const result = await onFiles(files); if (alive.current && result !== false) setNotice(`已處理 ${files.length} 份檔案，請確認檔案清單。`); }
    catch (err) { if (alive.current) setError(err.message || "檔案處理失敗，請再試一次。"); }
    finally { locked.current = false; if (alive.current) setWorking(false); }
  }
  return <div className="file-drop-field">
    <div className={`file-drop-zone${dragging ? " is-dragging" : ""}`} role="group" aria-label={label} aria-disabled={unavailable} aria-busy={unavailable}
      onDragEnter={event => { event.preventDefault(); event.stopPropagation(); depth.current++; if (!unavailable) setDragging(true); }}
      onDragOver={event => { event.preventDefault(); event.stopPropagation(); if (event.dataTransfer) event.dataTransfer.dropEffect = unavailable ? "none" : "copy"; }}
      onDragLeave={event => { event.preventDefault(); event.stopPropagation(); depth.current = Math.max(0, depth.current - 1); if (!depth.current) setDragging(false); }}
      onDrop={event => { event.preventDefault(); event.stopPropagation(); depth.current = 0; setDragging(false); if (unavailable) return; const directory = [...(event.dataTransfer?.items || [])].some(item => item.webkitGetAsEntry?.()?.isDirectory); if (directory) { setError("請選擇檔案；整個資料夾請使用原本的資料夾匯入功能。"); return; } receive(event.dataTransfer?.files); }}>
      <span className="file-drop-icon" aria-hidden="true">↥</span><div className="file-drop-copy"><strong>{unavailable ? "檔案處理中，請稍候…" : dragging ? "放開即可加入檔案" : label}</strong><span>{hint}</span></div>
      <button type="button" className="file-drop-button" disabled={unavailable} onClick={() => input.current?.click()}>選擇檔案</button>
      <input ref={input} id={`drop-${id}`} aria-label={`選擇${label}`} type="file" accept={accept} multiple={multiple} hidden disabled={unavailable} onChange={event => { const files = [...event.target.files]; event.target.value = ""; if (files.length) receive(files); }} />
    </div>
    {error && <p className="file-drop-error" role="alert">{error}</p>}{!error && notice && <p className="file-drop-notice" role="status">{notice}</p>}
  </div>;
}
