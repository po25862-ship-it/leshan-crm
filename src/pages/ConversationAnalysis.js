import React, { useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { CheckCircle2, FileText, LockKeyhole, Sparkles, Upload, WandSparkles, XCircle } from "lucide-react";
import { useAuth } from "../AuthContext";
import { useNeedsCollection } from "../hooks/useNeedsCollection";
import { useSharedCollection } from "../hooks/useSharedCollection";
import { useCollection } from "../hooks/useCollection";
import { matchPropertiesForNeed } from "../lib/needsMatch";
import { analysisNotes, analyzeLineConversation, parseLineChat } from "../lib/lineConversationAnalyzer";

const SAMPLE_TEXT = `2026/8/27（四）
10:15\t房仲\t想找哪一區與多少預算呢？
10:18\t陳小姐\t想找新竹市東區或竹北市，預算 1200-1600 萬，至少 3 房 2 衛
10:19\t陳小姐\t希望有平面車位、採光好，電梯大樓自住
10:25\t陳小姐\t這週六可以安排看屋嗎？也想了解貸款成數`;

function ResultList({ items, empty, tone = "positive" }) {
  if (!items.length) return <p className="conversation-empty-copy">{empty}</p>;
  return <div className={`conversation-result-list ${tone}`}>{items.map((item) => <span key={item}>{tone === "positive" ? <CheckCircle2 size={14} /> : <XCircle size={14} />}{item}</span>)}</div>;
}

export default function ConversationAnalysis() {
  const { user } = useAuth();
  const { add: addNeed } = useNeedsCollection(user.uid);
  const { items: contacts } = useSharedCollection("contacts", "name", user.uid);
  const { items: properties } = useCollection("properties", "createdAt");
  const buyers = contacts.filter((contact) => (contact.tags || []).includes("買方"));
  const fileInput = useRef(null);
  const [rawText, setRawText] = useState("");
  const [fileName, setFileName] = useState("");
  const [participant, setParticipant] = useState("");
  const [contactId, setContactId] = useState("");
  const [result, setResult] = useState(null);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [savedId, setSavedId] = useState("");

  const parsed = useMemo(() => parseLineChat(rawText), [rawText]);
  const matches = useMemo(() => result ? matchPropertiesForNeed(result.need, properties).slice(0, 5) : [], [result, properties]);

  const loadFile = async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    if (!file.name.toLowerCase().endsWith(".txt")) {
      setError("請選擇 LINE 匯出的 .txt 檔案。");
      return;
    }
    if (file.size > 2 * 1024 * 1024) {
      setError("檔案超過 2 MB，請先縮小對話範圍後再匯入。");
      return;
    }
    const text = await file.text();
    setRawText(text);
    setFileName(file.name);
    setParticipant("");
    setResult(null);
    setSavedId("");
    setError("");
  };

  const runAnalysis = () => {
    if (!rawText.trim()) {
      setError("請先匯入 LINE .txt，或貼上對話內容。");
      return;
    }
    if (!parsed.messages.length) {
      setError("找不到 LINE 訊息。請確認內容包含「時間、發言者、訊息」三個欄位。");
      return;
    }
    const nextResult = analyzeLineConversation(parsed.messages, participant);
    setResult(nextResult);
    setSavedId("");
    setError("");
  };

  const saveNeed = async () => {
    if (!result) return;
    const contact = buyers.find((buyer) => buyer.id === contactId);
    const notes = analysisNotes(result);
    const payload = {
      ...result.need,
      contactId: contact?.id || "",
      contactName: contact?.name || result.need.contactName,
      title: contact ? `${contact.name}・LINE 對話客需` : result.need.title,
      notes,
      ownerUid: user.uid,
      lastModifiedByUid: user.uid,
      conversationAnalysis: {
        score: result.score,
        intentLevel: result.intentLevel,
        signals: result.signals,
        objections: result.objections,
        nextStep: result.nextStep,
        participant: result.participant,
        messageCount: result.messageCount,
        sourceFileName: fileName || "貼上的對話",
        analyzedAt: new Date().toISOString(),
        parserVersion: 1,
      },
    };
    setSaving(true);
    try {
      const reference = await addNeed(payload);
      setSavedId(reference.id);
    } catch (saveError) {
      console.error(saveError);
      setError("客需儲存失敗，請確認網路與 Firebase 權限後再試一次。");
    } finally {
      setSaving(false);
    }
  };

  return <main className="conversation-analysis-page">
    <div className="conversation-hero">
      <div><div className="conversation-eyebrow">LOCAL CONVERSATION INTELLIGENCE</div><h2>LINE 對話分析</h2><p>把聊天紀錄轉成可追蹤的客需、購屋意願與物件配對。</p></div>
      <span><LockKeyhole size={14} />分析只在此裝置執行</span>
    </div>

    <div className="conversation-workspace">
      <section className="panel conversation-input-card">
        <div className="conversation-card-head"><span><Upload size={18} /></span><div><h3>1. 匯入對話</h3><p>支援 LINE「傳送聊天記錄」產生的 .txt</p></div></div>
        <input ref={fileInput} type="file" accept=".txt,text/plain" onChange={loadFile} hidden />
        <button type="button" className="conversation-dropzone" onClick={() => fileInput.current?.click()}>
          <FileText size={28} /><strong>{fileName || "選擇 LINE .txt 檔案"}</strong><small>{fileName ? `${parsed.messages.length} 則訊息・${parsed.participants.length} 位發言者` : "檔案不會上傳到外部分析服務"}</small>
        </button>
        <div className="conversation-divider"><span>或直接貼上</span></div>
        <textarea value={rawText} onChange={(event) => { setRawText(event.target.value); setFileName(""); setResult(null); }} rows={9} placeholder="貼上 LINE 聊天記錄…" />
        <div className="conversation-input-actions">
          <button type="button" className="btn ghost" onClick={() => { setRawText(SAMPLE_TEXT); setFileName("範例對話.txt"); setParticipant("陳小姐"); setResult(null); }}>載入範例</button>
          <span>{rawText.length.toLocaleString()} 字</span>
        </div>
      </section>

      <section className="panel conversation-setup-card">
        <div className="conversation-card-head"><span><Sparkles size={18} /></span><div><h3>2. 指定客戶並分析</h3><p>指定客戶發言者可避免把房仲的話當成需求</p></div></div>
        <label>客戶在 LINE 的名稱<select value={participant} onChange={(event) => { setParticipant(event.target.value); setResult(null); }}><option value="">分析全部發言者</option>{parsed.participants.map((name) => <option key={name} value={name}>{name}</option>)}</select></label>
        <label>連結現有買方（寫入時使用）<select value={contactId} onChange={(event) => setContactId(event.target.value)}><option value="">暫不連結</option>{buyers.map((buyer) => <option key={buyer.id} value={buyer.id}>{buyer.name}{buyer.phone ? `・${buyer.phone}` : ""}</option>)}</select></label>
        <div className="conversation-privacy-note"><LockKeyhole size={16} /><div><strong>本機規則分析</strong><p>不呼叫外部 AI API。只有按下「建立客需」後，抽取結果才會存進既有 Firebase。</p></div></div>
        {error && <div className="conversation-error">{error}</div>}
        <button type="button" className="btn conversation-analyze-button" onClick={runAnalysis} disabled={!rawText.trim()}><WandSparkles size={15} />開始分析</button>
      </section>
    </div>

    {result && <>
      <section className="conversation-results">
        <article className="panel conversation-score-card">
          <div className={`conversation-score-ring level-${result.intentLevel}`}><strong>{result.score}</strong><span>/ 100</span></div>
          <div><span className="conversation-label">購屋意願</span><h3>{result.intentLevel}意願買方</h3><p>依客需完整度、看屋／出價／貸款等訊號與異議估算，供業務排序使用。</p></div>
        </article>
        <article className="panel"><span className="conversation-label">客需摘要</span><h3>{result.summary}</h3><p className="conversation-muted">分析 {result.messageCount} 則客戶訊息，共 {result.totalMessageCount} 則對話。</p></article>
        <article className="panel"><span className="conversation-label">建議下一步</span><h3>{result.nextStep}</h3></article>
      </section>

      <section className="conversation-detail-grid">
        <article className="panel"><div className="conversation-subhead"><CheckCircle2 size={17} /><h3>成交訊號</h3></div><ResultList items={result.signals} empty="尚未偵測到明確成交訊號。" /></article>
        <article className="panel"><div className="conversation-subhead objection"><XCircle size={17} /><h3>異議與風險</h3></div><ResultList items={result.objections} empty="尚未偵測到明確異議。" tone="negative" /></article>
      </section>

      <section className="panel conversation-matches-card">
        <div className="conversation-matches-head"><div><span className="conversation-label">AUTOMATIC MATCHING</span><h3>現有物件自動配對</h3><p>直接沿用 CRM Matching Engine V2；建立客需後仍可在客需頁調整必要／偏好條件。</p></div><strong>{matches.length} 間</strong></div>
        {matches.length ? <div className="conversation-match-list">{matches.map((match) => <Link to={`/properties?open=${match.property.id}`} key={match.property.id}><b>{match.percent}%</b><div><strong>{match.property.title}</strong><span>{match.property.totalPrice ? `${Number(match.property.totalPrice).toLocaleString()} 萬` : "價格未填"}・{match.property.layout || "格局未填"}</span><small>{[...match.reasons.slice(0, 3), ...match.missedReasons.slice(0, 1)].join("・")}</small></div><span>查看 ›</span></Link>)}</div> : <p className="conversation-empty-copy">目前沒有可配對物件；可能是尚未抽取到區域等必要條件，或物件庫沒有符合項目。</p>}
      </section>

      <section className="panel conversation-save-card">
        <div><span className="conversation-label">WRITE TO CRM</span><h3>把分析結果建立為客需</h3><p>會寫入既有 `needs` 結構，並保留分數、訊號、異議與分析來源。</p></div>
        {savedId ? <div className="conversation-saved"><CheckCircle2 size={17} />客需已建立 <Link to={`/needs?open=${savedId}`}>開啟客需</Link></div> : <button type="button" className="btn" onClick={saveNeed} disabled={saving}>{saving ? "建立中…" : "建立客需"}</button>}
      </section>
    </>}
  </main>;
}
