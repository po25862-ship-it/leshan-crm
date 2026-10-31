import React, { useState, useEffect } from "react";
import { addDoc, collection, serverTimestamp } from "firebase/firestore";
import { db } from "../firebase";
import { useSharedCollection } from "../hooks/useSharedCollection";
import { buildPropertyShareText, DEFAULT_PROPERTY_SHARE_INTRO } from "../lib/propertyShareText";
import { todayStr } from "../lib/dates";
import { useAuth } from "../AuthContext";
import { usePersonalAgid } from "../hooks/usePersonalAgid";
import { openLinePersonalTool } from "../lib/linePersonal";
import BuyerRecipientPicker from "./BuyerRecipientPicker";
import PropertyShareMap from "./PropertyShareMap";

// defaultBuyerId（選填）：從客需的「推薦物件」開啟分享時，該客需本來就綁定買方，
// 直接預選起來，不用再選一次；其他呼叫端（例如物件列表的多選分享）不傳就跟原本一樣要自己選。
export default function PropertyShare({ properties, onClose, defaultBuyerId = "", selectedBuyerId }) {
  const { user } = useAuth();
  const { agid } = usePersonalAgid();
  const { items: contacts } = useSharedCollection("contacts", "name", user.uid);
  const buyers = contacts.filter((c) => (c.tags || []).includes("買方"));

  const [intro, setIntro] = useState(DEFAULT_PROPERTY_SHARE_INTRO);
  const [previewText, setPreviewText] = useState("");
  const [buyerId, setBuyerId] = useState(defaultBuyerId);
  const recipientId = selectedBuyerId !== undefined ? selectedBuyerId : buyerId;
  const [logging, setLogging] = useState(false);
  const [copied, setCopied] = useState(false);
  const [includeMaps, setIncludeMaps] = useState(false);

  // 開頭文字或選取的物件變動時，重新產生預覽文字（產生後你還是可以自己再手動調整）
  useEffect(() => {
    setPreviewText(buildPropertyShareText(properties, intro, agid, includeMaps));
  }, [intro, properties, agid, includeMaps]);

  const onCopy = async () => {
    try {
      await navigator.clipboard.writeText(previewText);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      alert("複製失敗，請手動選取文字複製");
    }
  };

  const onCopyAndOpenLine = async () => {
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
    if (!recipientId) {
      alert("請先選擇要記錄到哪位買方");
      return;
    }
    setLogging(true);
    try {
      await addDoc(collection(db, `contacts/${recipientId}/interactions`), {
        date: todayStr(),
        properties: properties.map((p) => ({ label: p.title, propertyId: p.id })),
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

      <div className="form-field">
        <label>開頭文字</label>
        <textarea rows="2" value={intro} onChange={(e) => setIntro(e.target.value)} />
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
          rows={Math.min(22, 6 + properties.length * (includeMaps ? 8 : 7))}
          value={previewText}
          onChange={(e) => setPreviewText(e.target.value)}
          style={{ fontFamily: "inherit", background: "#FAFAF8" }}
        />
      </div>

      <div style={{ display: "flex", gap: 10, marginBottom: 16, flexWrap: "wrap" }}>
        <button className="btn" onClick={onCopy} disabled={!agid}>
          {copied ? "已複製！" : "複製文字"}
        </button>
        <button className="btn" onClick={onCopyAndOpenLine} disabled={!agid}>
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
        <button className="btn ghost" onClick={onLogToBuyer} disabled={logging || !recipientId}>
          {logging ? "記錄中…" : "記錄到互動紀錄"}
        </button>
      </div>
      </div>
      <PropertyShareMap key={properties.map((property) => property.id).join("|")} properties={properties} />
      </div>
    </div>
  );
}
