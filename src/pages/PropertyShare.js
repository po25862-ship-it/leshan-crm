import React, { useState, useEffect } from "react";
import { addDoc, collection, serverTimestamp } from "firebase/firestore";
import { db } from "../firebase";
import { useCollection } from "../hooks/useCollection";
import { withAgid } from "../lib/url";
import { truncateAddress } from "../lib/address";
import { todayStr } from "../lib/dates";

export default function PropertyShare({ properties, onClose }) {
  const { items: contacts } = useCollection("contacts", "name");
  const buyers = contacts.filter((c) => (c.tags || []).includes("買方"));

  const [intro, setIntro] = useState("下面有推薦你幾間物件，您看看有沒有合適的");
  const [previewText, setPreviewText] = useState("");
  const [buyerId, setBuyerId] = useState("");
  const [logging, setLogging] = useState(false);
  const [copied, setCopied] = useState(false);

  const buildText = (introText) =>
    [
      introText,
      "",
      ...properties.flatMap((p) => {
        const line1 = [p.title, truncateAddress(p.address), p.totalPrice ? `${p.totalPrice}萬` : ""]
          .filter(Boolean)
          .join("・");
        const line2 = p.websiteUrl ? withAgid(p.websiteUrl) : "";
        return [line1, line2, ""];
      }),
    ]
      .join("\n")
      .trim();

  // 開頭文字或選取的物件變動時，重新產生預覽文字（產生後你還是可以自己再手動調整）
  useEffect(() => {
    setPreviewText(buildText(intro));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [intro, properties]);

  const onCopy = async () => {
    try {
      await navigator.clipboard.writeText(previewText);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      alert("複製失敗，請手動選取文字複製");
    }
  };

  const onLogToBuyer = async () => {
    if (!buyerId) {
      alert("請先選擇要記錄到哪位買方");
      return;
    }
    setLogging(true);
    try {
      await addDoc(collection(db, `contacts/${buyerId}/interactions`), {
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
    <div className="panel" style={{ marginBottom: 24, maxWidth: 640 }}>
      <div className="section-title" style={{ fontSize: 15 }}>
        分享物件（已選 {properties.length} 筆）
      </div>

      <div className="form-field">
        <label>開頭文字</label>
        <textarea rows="2" value={intro} onChange={(e) => setIntro(e.target.value)} />
      </div>

      <div className="form-field">
        <label>預覽（可以自己再修改，複製/記錄都是用這裡的內容）</label>
        <textarea
          rows={Math.min(14, 4 + properties.length * 2)}
          value={previewText}
          onChange={(e) => setPreviewText(e.target.value)}
          style={{ fontFamily: "inherit", background: "#FAFAF8" }}
        />
      </div>

      <div style={{ display: "flex", gap: 10, marginBottom: 16, flexWrap: "wrap" }}>
        <button className="btn" onClick={onCopy}>
          {copied ? "已複製！" : "複製文字"}
        </button>
        <button className="btn ghost" onClick={onClose}>
          關閉
        </button>
      </div>

      <div style={{ borderTop: "1px solid var(--border)", paddingTop: 14 }}>
        <div className="form-field">
          <label>同時記錄到買方的互動紀錄（選填）</label>
          <select value={buyerId} onChange={(e) => setBuyerId(e.target.value)}>
            <option value="">— 選擇買方客戶 —</option>
            {buyers.map((b) => (
              <option key={b.id} value={b.id}>{b.name}{b.phone ? `（${b.phone}）` : ""}</option>
            ))}
          </select>
        </div>
        <button className="btn ghost" onClick={onLogToBuyer} disabled={logging || !buyerId}>
          {logging ? "記錄中…" : "記錄到互動紀錄"}
        </button>
      </div>
    </div>
  );
}
