import React, { useEffect, useRef, useState } from "react";
import { RENTAL_KEY_ORIGIN, parseRentalKey, encodeRentalKey, rentalKeyUrl, rentalKeyStatus, rentalKeySelection } from "../lib/companyRentalKeys";

export default function RentalKeyPicker({ keyInfo, notes, onKeyChange, onNotesChange, notesProps }) {
  const selected = parseRentalKey(keyInfo);
  const [mode, setMode] = useState(selected || /鑰匙.{0,8}(店|櫃)/.test(notes || "") ? "store" : "contact"), [notice, setNotice] = useState("");
  const cleanup = useRef(() => {}), latest = useRef({notes, onKeyChange, onNotesChange});
  useEffect(() => { latest.current = {notes, onKeyChange, onNotesChange}; }, [notes, onKeyChange, onNotesChange]);
  useEffect(() => () => cleanup.current(), []);
  function chooseKey() {
    cleanup.current();
    const nonce = Array.from(window.crypto.getRandomValues(new Uint8Array(24)), n => n.toString(16).padStart(2, "0")).join("");
    const url = new URL("/full", RENTAL_KEY_ORIGIN);
    url.searchParams.set("crmSelect", "1"); url.searchParams.set("returnOrigin", window.location.origin); url.searchParams.set("nonce", nonce);
    const popup = window.open(url.href, "leshan-rental-key-picker", "popup,width=820,height=760");
    if (!popup) { setNotice("選擇視窗被瀏覽器擋住了，請允許開啟彈出視窗後重試。"); return; }
    setNotice("請在鑰匙視窗選擇對應紀錄；首次使用請先輸入店內通行碼。");
    const receive = event => {
      const key = rentalKeySelection(event, popup, nonce);
      if (!key) return;
      cleanup.current(); latest.current.onKeyChange(encodeRentalKey(key));
      if (!latest.current.notes?.trim()) latest.current.onNotesChange("鑰匙在樂善店，帶看前請先到鑰匙管理確認狀態並辦理借用。");
      setNotice("已連結鑰匙，儲存租賃案件後同事就能點選。" + (key.status === "out" ? "這把鑰匙目前已借出，請先確認歸還時間。" : ""));
    };
    window.addEventListener("message", receive);
    const timer = window.setInterval(() => { if (popup.closed) { cleanup.current(); setNotice("鑰匙視窗已關閉；尚未選擇時可重新開啟。"); } }, 1000);
    cleanup.current = () => { window.removeEventListener("message", receive); window.clearInterval(timer); cleanup.current = () => {}; };
    popup.focus?.();
  }
  return <div className="cr-viewing-access cr-wide">
    <div className="cr-access-heading"><h4>帶看與取鑰匙</h4><small>僅同仁可見</small></div>
    <label className="cr-field"><span>取鑰匙方式</span><select value={mode} onChange={event => { cleanup.current(); setMode(event.target.value); setNotice(""); if (event.target.value !== "store") onKeyChange(""); }}><option value="contact">先聯繫同事／屋主</option><option value="store">鑰匙在店裡</option></select></label>
    {mode === "store" && <div className="cr-key-selection">
      {selected ? <div className="cr-selected-key"><small>已連結的店內鑰匙</small><strong>{selected.slot || "位置未填"}・{selected.name}</strong><span>選取時：{rentalKeyStatus(selected)}；目前狀態請開啟鑰匙管理確認。</span><a className="cr-key-link" href={rentalKeyUrl(selected)} target="_blank" rel="noopener noreferrer">查看鑰匙／辦理借還 ↗</a></div> : <p>選擇這間房的鑰匙，儲存後同事可直接點進鑰匙管理。</p>}
      <div className="cr-actions"><button type="button" onClick={chooseKey}>{selected ? "更換鑰匙" : "從鑰匙管理選擇"}</button>{selected && <button type="button" onClick={() => { onKeyChange(""); setNotice("已解除連結，帶看說明仍保留。"); }}>解除連結</button>}</div>
      <small>尚未建檔也可以先填取鑰匙說明，之後再連結。</small>
    </div>}
    <label className="cr-field cr-wide"><span>帶看方式＊</span><textarea {...notesProps} rows={3} value={notes || ""} onChange={event => onNotesChange(event.target.value)} placeholder="例如：鑰匙在樂善店，請提前一天聯繫負責同事；門禁注意事項也寫在這裡。" /><small>帶看預約、取鑰匙與門禁注意事項統一填在這裡。</small></label>
    {notice && <p role="status" className="cr-key-notice">{notice}</p>}
  </div>;
}
