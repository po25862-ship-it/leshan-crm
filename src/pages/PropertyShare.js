import React, { useState, useEffect, useRef, useMemo } from "react";
import { addDoc, collection, serverTimestamp } from "firebase/firestore";
import { db } from "../firebase";
import { useSharedCollection } from "../hooks/useSharedCollection";
import { buildPropertyShareText, DEFAULT_PROPERTY_SHARE_INTRO, DEFAULT_PRICE_DROP_INTRO, propertySharePriceDrop } from "../lib/propertyShareText";
import { todayStr } from "../lib/dates";
import { useAuth } from "../AuthContext";
import { usePersonalAgid } from "../hooks/usePersonalAgid";
import { openLinePersonalTool } from "../lib/linePersonal";
import BuyerRecipientPicker from "./BuyerRecipientPicker";
import PropertyShareMap from "./PropertyShareMap";

// defaultBuyerId（選填）：從客需的「推薦物件」開啟分享時，該客需本來就綁定買方，
// 直接預選起來，不用再選一次；其他呼叫端（例如物件列表的多選分享）不傳就跟原本一樣要自己選。
export default function PropertyShare({ properties, onClose, defaultBuyerId = "", selectedBuyerId, onIntroduced }) {
  const { user } = useAuth();
  const { agid } = usePersonalAgid();
  const { items: contacts } = useSharedCollection("contacts", "name", user.uid);
  const buyers = contacts.filter((c) => (c.tags || []).includes("買方"));

  const [messageMode, setMessageMode] = useState("recommend");
  const [intros, setIntros] = useState({ recommend: DEFAULT_PROPERTY_SHARE_INTRO, "price-drop": DEFAULT_PRICE_DROP_INTRO });
  const intro = intros[messageMode];
  const [previewText, setPreviewText] = useState("");
  const [buyerId, setBuyerId] = useState(defaultBuyerId);
  const recipientId = selectedBuyerId !== undefined ? selectedBuyerId : buyerId;
  const [logging, setLogging] = useState(false);
  const [copied, setCopied] = useState(false);
  const [includeMaps, setIncludeMaps] = useState(false);
  const introductionEvent = useRef(`intro-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  const [introductionDone, setIntroductionDone] = useState(false);
  const [introductionError, setIntroductionError] = useState("");
  const priceDropProperties = useMemo(() => properties.filter(propertySharePriceDrop), [properties]);
  const sharedProperties = messageMode === "price-drop" ? priceDropProperties : properties;
  const excludedProperties = messageMode === "price-drop" ? properties.filter((property) => !propertySharePriceDrop(property)) : [];
  const sharedPropertyKey = sharedProperties.map((property) => property.id).join("|");
  const hasShareContent = sharedProperties.length > 0 && !!previewText.trim();
  const canIntroduce = !!onIntroduced && !!defaultBuyerId && recipientId === defaultBuyerId;
  useEffect(() => { setBuyerId(defaultBuyerId); }, [defaultBuyerId]);
  useEffect(() => {
    introductionEvent.current = `intro-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    setIntroductionDone(false);
    setIntroductionError("");
    setCopied(false);
  }, [recipientId, messageMode, sharedPropertyKey]);

  // 開頭文字或選取的物件變動時，重新產生預覽文字（產生後你還是可以自己再手動調整）
  useEffect(() => {
    setPreviewText(buildPropertyShareText(properties, intro, agid, includeMaps, messageMode));
  }, [intro, properties, agid, includeMaps, messageMode]);

  const onCopy = async () => {
    if (!hasShareContent) return;
    try {
      await navigator.clipboard.writeText(previewText);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      alert("複製失敗，請手動選取文字複製");
    }
  };

  const onCopyAndOpenLine = async () => {
    if (!hasShareContent) return;
    openLinePersonalTool();
    try {
      await navigator.clipboard.writeText(previewText);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      alert("個人 LINE 工具已開啟；文字複製失敗，請手動選取預覽內容複製");
    }
  };

  const onLogToBuyer = async () => {
    if (!hasShareContent) return;
    if (!recipientId) {
      alert("請先選擇要記錄到哪位買方");
      return;
    }
    setLogging(true);
    try {
      await addDoc(collection(db, `contacts/${recipientId}/interactions`), {
        date: todayStr(),
        properties: sharedProperties.map((p) => ({ label: p.title, propertyId: p.id })),
        feedback: "",
        communication: previewText,
        googleEventId: null,
        googleEventLink: null,
        createdAt: serverTimestamp(),
      });
      alert("已記錄到這位買方的互動紀錄");
    } catch (err) {
      console.error(err);
      alert("記錄失敗，請再試一次");
    }
    setLogging(false);
  };

  const confirmIntroduction = async () => {
    if (!canIntroduce || !hasShareContent || logging || introductionDone) return;
    const eventId = introductionEvent.current;
    setLogging(true); setIntroductionError("");
    try {
      await onIntroduced({ recipientId, properties: sharedProperties, communication: previewText, eventId, day: todayStr() });
      if (introductionEvent.current === eventId) setIntroductionDone(true);
    }
    catch (error) { if (introductionEvent.current === eventId) setIntroductionError(error.message || "記錄失敗，請重試。"); }
    finally { setLogging(false); }
  };

  return (
    <div className="panel property-share-panel" style={{ marginBottom: 24 }}>
      <div className="section-title" style={{ fontSize: 15 }}>
        分享物件（已選 {properties.length} 筆）
      </div>

      <div className="property-share-grid">
      <div className="property-share-main">

      {!agid && (
        <div style={{ background: "var(--danger-soft)", color: "var(--danger)", borderRadius: 10, padding: "10px 12px", marginBottom: 14, fontSize: 12, lineHeight: 1.6 }}>
          尚未設定個人 AGID，請先到「設定」填寫後再分享物件。
        </div>
      )}

      <div role="group" aria-label="訊息類型" style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 14 }}>
        <button type="button" className={`btn ${messageMode === "recommend" ? "" : "ghost"}`} aria-pressed={messageMode === "recommend"} disabled={logging} onClick={() => setMessageMode("recommend")}>一般推薦</button>
        <button type="button" className={`btn ${messageMode === "price-drop" ? "" : "ghost"}`} aria-pressed={messageMode === "price-drop"} disabled={logging} onClick={() => setMessageMode("price-drop")}>降價通知</button>
      </div>
      {messageMode === "price-drop" && (
        <div role="status" style={{ background: "var(--brass-soft)", color: "var(--ink)", padding: "10px 12px", borderRadius: 10, marginBottom: 14, fontSize: 12, lineHeight: 1.7 }}>
          將帶入 {sharedProperties.length} 筆降價物件。
          {excludedProperties.length > 0 && <div>以下 {excludedProperties.length} 筆缺少可確認的降價紀錄，請確認前次價格與最新售價：{excludedProperties.map((property) => property.title || "未命名物件").join("、")}。</div>}
          {!sharedProperties.length && <div>確認價格異動紀錄後再製作通知，或切回「一般推薦」。</div>}
        </div>
      )}

      <div className="form-field">
        <label>開頭文字</label>
        <textarea rows="2" value={intro} onChange={(e) => setIntros((current) => ({ ...current, [messageMode]: e.target.value }))} />
      </div>

      <label style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10, fontSize: 13, cursor: "pointer" }}>
        <input type="checkbox" checked={includeMaps} onChange={(e) => setIncludeMaps(e.target.checked)} />
        文字另外附上地圖連結（選填）
      </label>
      {includeMaps && <p style={{ margin: "0 0 14px", color: "var(--muted)", fontSize: 12, lineHeight: 1.6 }}>
        分享文字會另外附上每間的路段連結；位置圖可下載成圖片，直接傳給客人。
      </p>}

      <div className="form-field">
        <label>預覽（可以自己再修改，複製/記錄都是用這裡的內容）</label>
        <textarea
          rows={Math.min(22, 6 + sharedProperties.length * (includeMaps ? 8 : 7) + (messageMode === "price-drop" ? sharedProperties.length * 2 : 0))}
          value={previewText}
          onChange={(e) => setPreviewText(e.target.value)}
          style={{ fontFamily: "inherit", background: "#FAFAF8" }}
        />
      </div>

      <div style={{ display: "flex", gap: 10, marginBottom: 16, flexWrap: "wrap" }}>
        <button className="btn" onClick={onCopy} disabled={!agid || !hasShareContent}>
          {copied ? "已複製！" : "複製文字"}
        </button>
        <button className="btn" onClick={onCopyAndOpenLine} disabled={!agid || !hasShareContent}>
          複製並開啟個人 LINE
        </button>
        <button className="btn ghost" onClick={onClose}>
          關閉
        </button>
      </div>

      <div style={{ borderTop: "1px solid var(--border)", paddingTop: 14 }}>
        {selectedBuyerId === undefined ? (
          <BuyerRecipientPicker value={buyerId} onChange={setBuyerId} />
        ) : (
          <div style={{ fontSize: 13, marginBottom: 12 }}>介紹對象：<strong>{buyers.find((buyer) => buyer.id === recipientId)?.name || "尚未指定客戶"}</strong>（可在上方更改）</div>
        )}
        {canIntroduce ? <><p className="need-help">實際傳送給客人後，按下方按鈕，同時更新客需與買方互動紀錄。複製文字不會自動標記已介紹。</p><button className="btn" onClick={confirmIntroduction} disabled={logging || introductionDone || !hasShareContent}>{introductionDone ? "已記錄本次介紹" : logging ? "記錄中…" : "已實際傳送，記錄本次介紹"}</button></> : <button className="btn ghost" onClick={onLogToBuyer} disabled={logging || !recipientId || !hasShareContent}>{logging ? "記錄中…" : "記錄到互動紀錄"}</button>}
        {introductionError && <p role="alert" className="need-error">{introductionError}</p>}
      </div>
      </div>
      {sharedProperties.length > 0 && <PropertyShareMap key={sharedPropertyKey} properties={sharedProperties} />}
      </div>
    </div>
  );
}
