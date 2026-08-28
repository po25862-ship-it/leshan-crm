import React, { useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { CheckCircle2, FileJson, FileText, LockKeyhole, Sparkles, Upload, WandSparkles, XCircle } from "lucide-react";
import { addDoc, collection, serverTimestamp } from "firebase/firestore";
import { db } from "../firebase";
import { useAuth } from "../AuthContext";
import { useNeedsCollection } from "../hooks/useNeedsCollection";
import { useSharedCollection } from "../hooks/useSharedCollection";
import { useCollection } from "../hooks/useCollection";
import { matchPropertiesForNeed } from "../lib/needsMatch";
import { analysisNotes, analyzeLineConversation, analyzeSellerConversation, analyzeTeamConversation, parseLineChat, sellerAnalysisNotes, teamAnalysisNotes } from "../lib/lineConversationAnalyzer";
import { parseDeepAnalysisImport } from "../lib/deepAnalysisImport";

const SAMPLE_TEXT = `2026/8/27（四）
10:15\t房仲\t想找哪一區與多少預算呢？
10:18\t陳小姐\t想找新竹市東區或竹北市，預算 1200-1600 萬，至少 3 房 2 衛
10:19\t陳小姐\t希望有平面車位、採光好，電梯大樓自住
10:25\t陳小姐\t這週六可以安排看屋嗎？也想了解貸款成數`;

const SELLER_SAMPLE_TEXT = `2026/8/28（五）
09:00\t房仲\t想了解您出售的原因、期待價格和時間嗎？
09:03\t林先生\t我換屋想賣新北市板橋區文化路一段100號的電梯大樓
09:05\t林先生\t希望開價 2380 萬，底價 2200 萬，三個月內賣掉
09:08\t林先生\t這週可以來現勘，我會準備權狀，也可以談專任委託`;

const TEAM_SAMPLE_TEXT = `2026/8/28（五）
09:00\t小美\tCRM 沒有權限上傳物件照片，一直出現錯誤
09:02\t小美\t麻煩今天下班前協助處理，明天要傳給屋主
09:05\t店長\t收到，我先確認帳號和錯誤畫面`;

function ResultList({ items, empty, tone = "positive" }) {
  if (!items.length) return <p className="conversation-empty-copy">{empty}</p>;
  return <div className={`conversation-result-list ${tone}`}>{items.map((item) => <span key={item}>{tone === "positive" ? <CheckCircle2 size={14} /> : <XCircle size={14} />}{item}</span>)}</div>;
}

export default function ConversationAnalysis() {
  const { user } = useAuth();
  const { add: addNeed } = useNeedsCollection(user.uid);
  const { items: contacts, add: addContact } = useSharedCollection("contacts", "name", user.uid);
  const { add: addTopic } = useSharedCollection("topics", "createdAt", user.uid);
  const { items: properties } = useCollection("properties", "createdAt");
  const { items: colleagues } = useCollection("colleagues", "name");
  const buyers = contacts.filter((contact) => (contact.tags || []).includes("買方"));
  const sellers = contacts.filter((contact) => (contact.tags || []).includes("賣方"));
  const fileInput = useRef(null);
  const aiFileInput = useRef(null);
  const [rawText, setRawText] = useState("");
  const [analysisMode, setAnalysisMode] = useState("buyer");
  const [fileName, setFileName] = useState("");
  const [isDragging, setIsDragging] = useState(false);
  const [isAiDragging, setIsAiDragging] = useState(false);
  const [participant, setParticipant] = useState("");
  const [contactId, setContactId] = useState("");
  const [result, setResult] = useState(null);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [savedRecord, setSavedRecord] = useState(null);
  const [copied, setCopied] = useState(false);

  const parsed = useMemo(() => parseLineChat(rawText), [rawText]);
  const matches = useMemo(() => result?.need ? matchPropertiesForNeed(result.need, properties).slice(0, 5) : [], [result, properties]);
  const selectableContacts = analysisMode === "buyer" ? buyers : analysisMode === "seller" ? sellers : colleagues;

  const readFile = async (file) => {
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
    setSavedRecord(null);
    setError("");
  };

  const readAiAnalysisFile = async (file) => {
    if (!file) return;
    if (!file.name.toLowerCase().endsWith(".json")) {
      setError("請選擇 ChatGPT 產生的 .json 深度分析檔。");
      return;
    }
    if (file.size > 512 * 1024) {
      setError("分析檔超過 512 KB，請確認選到的是 CRM 深度分析 JSON。");
      return;
    }
    try {
      const imported = parseDeepAnalysisImport(await file.text());
      setAnalysisMode(imported.analysisType);
      setParticipant(imported.participant);
      setContactId("");
      setRawText("");
      setFileName(imported.sourceFileName || file.name);
      setResult(imported);
      setSavedRecord(null);
      setError("");
    } catch (importError) {
      setError(importError.message || "深度分析檔無法讀取，請重新產生後再試一次。");
    }
  };

  const loadAiFile = async (event) => {
    await readAiAnalysisFile(event.target.files?.[0]);
    event.target.value = "";
  };

  const dropAiFile = async (event) => {
    event.preventDefault();
    setIsAiDragging(false);
    const files = Array.from(event.dataTransfer?.files || []);
    if (files.length !== 1) {
      setError("請一次拖入一個深度分析 .json 檔案。");
      return;
    }
    await readAiAnalysisFile(files[0]);
  };

  const loadFile = async (event) => {
    await readFile(event.target.files?.[0]);
    event.target.value = "";
  };

  const dropFile = async (event) => {
    event.preventDefault();
    setIsDragging(false);
    const files = Array.from(event.dataTransfer?.files || []);
    if (files.length !== 1) {
      setError("請一次拖入一個 LINE .txt 檔案。");
      return;
    }
    await readFile(files[0]);
  };

  const copyFollowUp = async () => {
    if (!result?.followUpMessage) return;
    try {
      await navigator.clipboard.writeText(result.followUpMessage);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      setError("無法自動複製，請手動選取下方文字。");
    }
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
    const nextResult = analysisMode === "seller"
      ? analyzeSellerConversation(parsed.messages, participant)
      : analysisMode === "team"
        ? analyzeTeamConversation(parsed.messages, participant)
        : analyzeLineConversation(parsed.messages, participant);
    setResult(nextResult);
    setSavedRecord(null);
    setError("");
  };

  const saveAnalysis = async () => {
    if (!result) return;
    if (analysisMode === "team") {
      setSaving(true);
      try {
        const colleague = colleagues.find((item) => item.id === contactId);
        const reference = await addTopic({
          ...result.topic,
          counterpart: colleague?.name || result.topic.counterpart,
          notes: teamAnalysisNotes(result),
          lastUpdatedDate: new Date().toISOString().slice(0, 10),
          ownerUid: user.uid,
          lastModifiedByUid: user.uid,
          sharedWith: [],
          teamRequestAnalysis: {
            analysisSource: result.analysisSource || "local-rules",
            deepAnalysis: result.deepAnalysis || null,
            score: result.score,
            priorityLevel: result.intentLevel,
            requestTypes: result.requestTypes,
            requests: result.requests,
            blockers: result.blockers,
            deadlines: result.deadlines,
            nextStep: result.nextStep,
            plainLanguageExplanation: result.plainLanguageExplanation,
            evidence: result.evidence,
            missingInformation: result.missingInformation,
            recommendedQuestions: result.recommendedQuestions,
            followUpMessage: result.followUpMessage,
            participant: result.participant,
            messageCount: result.messageCount,
            sourceFileName: fileName || "貼上的對話",
            analyzedAt: new Date().toISOString(),
            parserVersion: 1,
          },
        });
        setSavedRecord({ type: "team", id: reference.id });
      } catch (saveError) {
        console.error(saveError);
        setError("同事訴求儲存失敗，請確認網路與 Firebase 權限後再試一次。");
      } finally {
        setSaving(false);
      }
      return;
    }
    if (analysisMode === "seller") {
      setSaving(true);
      try {
        let contact = sellers.find((seller) => seller.id === contactId);
        if (!contact) {
          const reference = await addContact({
            name: result.participant || "LINE 屋主",
            phone: "",
            tags: ["賣方"],
            source: "LINE 對話分析",
            notes: sellerAnalysisNotes(result),
            lastContactDate: new Date().toISOString().slice(0, 10),
            ownerUid: user.uid,
            lastModifiedByUid: user.uid,
            sharedWith: [],
          });
          contact = { id: reference.id, name: result.participant || "LINE 屋主" };
        }
        const listingReference = await addDoc(collection(db, `contacts/${contact.id}/listings`), {
          ...result.listing,
          title: result.listing.title || `${contact.name}・售屋追蹤`,
          ownerUid: user.uid,
          lastModifiedByUid: user.uid,
          sellerAnalysis: {
            analysisSource: result.analysisSource || "local-rules",
            deepAnalysis: result.deepAnalysis || null,
            score: result.score,
            intentLevel: result.intentLevel,
            motivations: result.motivations,
            timeline: result.timeline,
            occupancy: result.occupancy,
            signals: result.signals,
            objections: result.objections,
            nextStep: result.nextStep,
            plainLanguageExplanation: result.plainLanguageExplanation,
            evidence: result.evidence,
            missingInformation: result.missingInformation,
            recommendedQuestions: result.recommendedQuestions,
            followUpMessage: result.followUpMessage,
            notes: sellerAnalysisNotes(result),
            participant: result.participant,
            messageCount: result.messageCount,
            sourceFileName: fileName || "貼上的對話",
            analyzedAt: new Date().toISOString(),
            parserVersion: 1,
          },
          createdAt: serverTimestamp(),
        });
        setSavedRecord({ type: "seller", id: listingReference.id, contactId: contact.id });
      } catch (saveError) {
        console.error(saveError);
        setError("屋主追蹤儲存失敗，請確認網路與 Firebase 權限後再試一次。");
      } finally {
        setSaving(false);
      }
      return;
    }
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
        analysisSource: result.analysisSource || "local-rules",
        deepAnalysis: result.deepAnalysis || null,
        score: result.score,
        intentLevel: result.intentLevel,
        signals: result.signals,
        objections: result.objections,
        nextStep: result.nextStep,
        plainLanguageExplanation: result.plainLanguageExplanation,
        evidence: result.evidence,
        missingInformation: result.missingInformation,
        recommendedQuestions: result.recommendedQuestions,
        followUpMessage: result.followUpMessage,
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
      setSavedRecord({ type: "buyer", id: reference.id });
    } catch (saveError) {
      console.error(saveError);
      setError("客需儲存失敗，請確認網路與 Firebase 權限後再試一次。");
    } finally {
      setSaving(false);
    }
  };

  return <main className="conversation-analysis-page">
    <div className="conversation-hero">
      <div><div className="conversation-eyebrow">LOCAL CONVERSATION INTELLIGENCE</div><h2>LINE 對話分析</h2><p>支援買方客需、屋主委售與同事內部訴求分析。</p></div>
      <span><LockKeyhole size={14} />分析只在此裝置執行</span>
    </div>

    <div className="conversation-workspace">
      <section className="panel conversation-input-card">
        <div className="conversation-card-head"><span><Upload size={18} /></span><div><h3>1. 匯入對話</h3><p>支援 LINE「傳送聊天記錄」產生的 .txt</p></div></div>
        <input ref={fileInput} type="file" accept=".txt,text/plain" onChange={loadFile} hidden />
        <button
          type="button"
          className={`conversation-dropzone${isDragging ? " is-dragging" : ""}`}
          onClick={() => fileInput.current?.click()}
          onDragEnter={(event) => { event.preventDefault(); setIsDragging(true); }}
          onDragOver={(event) => { event.preventDefault(); event.dataTransfer.dropEffect = "copy"; setIsDragging(true); }}
          onDragLeave={(event) => { event.preventDefault(); if (!event.currentTarget.contains(event.relatedTarget)) setIsDragging(false); }}
          onDrop={dropFile}
        >
          <FileText size={28} /><strong>{isDragging ? "放開即可匯入 LINE 對話" : (rawText && fileName) || "拖拉 LINE .txt 到這裡"}</strong><small>{rawText && fileName ? `${parsed.messages.length} 則訊息・${parsed.participants.length} 位發言者` : "也可以點一下選擇檔案・內容只在本機解析"}</small>
        </button>
        <div className="conversation-divider"><span>或直接貼上</span></div>
        <textarea value={rawText} onChange={(event) => { setRawText(event.target.value); setFileName(""); setResult(null); }} rows={9} placeholder="貼上 LINE 聊天記錄…" />
        <div className="conversation-input-actions">
          <button type="button" className="btn ghost" onClick={() => { const sample = analysisMode === "seller" ? SELLER_SAMPLE_TEXT : analysisMode === "team" ? TEAM_SAMPLE_TEXT : SAMPLE_TEXT; const name = analysisMode === "seller" ? "林先生" : analysisMode === "team" ? "小美" : "陳小姐"; setRawText(sample); setFileName(`${analysisMode === "seller" ? "屋主" : analysisMode === "team" ? "同事" : "買方"}範例對話.txt`); setParticipant(name); setResult(null); setSavedRecord(null); }}>載入{analysisMode === "seller" ? "屋主" : analysisMode === "team" ? "同事" : "買方"}範例</button>
          <span>{rawText.length.toLocaleString()} 字</span>
        </div>
      </section>

      <section className="panel conversation-setup-card">
        <div className="conversation-card-head"><span><Sparkles size={18} /></span><div><h3>2. 指定發言者並分析</h3><p>指定對象可避免把其他人的回覆誤判為訴求</p></div></div>
        <label>分析對象<div className="conversation-mode-tabs"><button type="button" className={analysisMode === "buyer" ? "active" : ""} onClick={() => { setAnalysisMode("buyer"); setContactId(""); setResult(null); setSavedRecord(null); }}>買方客需</button><button type="button" className={analysisMode === "seller" ? "active" : ""} onClick={() => { setAnalysisMode("seller"); setContactId(""); setResult(null); setSavedRecord(null); }}>屋主委售</button><button type="button" className={analysisMode === "team" ? "active" : ""} onClick={() => { setAnalysisMode("team"); setContactId(""); setResult(null); setSavedRecord(null); }}>同事訴求</button></div></label>
        <label>{analysisMode === "buyer" ? "買方" : analysisMode === "seller" ? "屋主" : "提出訴求的同事"}在 LINE 的名稱<select value={participant} onChange={(event) => { setParticipant(event.target.value); setResult(null); }}><option value="">分析全部發言者</option>{parsed.participants.map((name) => <option key={name} value={name}>{name}</option>)}</select></label>
        <label>連結現有{analysisMode === "buyer" ? "買方" : analysisMode === "seller" ? "屋主" : "同事"}（寫入時使用）<select value={contactId} onChange={(event) => setContactId(event.target.value)}><option value="">{analysisMode === "buyer" ? "暫不連結" : analysisMode === "seller" ? "未選擇時自動建立屋主" : "以 LINE 名稱記錄"}</option>{selectableContacts.map((contact) => <option key={contact.id} value={contact.id}>{contact.name}{contact.phone ? `・${contact.phone}` : ""}</option>)}</select></label>
        <div className="conversation-privacy-note"><LockKeyhole size={16} /><div><strong>本機規則分析</strong><p>不呼叫外部 AI API。只有確認建立後，結構化結果才會存進既有 Firebase。</p></div></div>
        {error && <div className="conversation-error">{error}</div>}
        <button type="button" className="btn conversation-analyze-button" onClick={runAnalysis} disabled={!rawText.trim()}><WandSparkles size={15} />開始分析</button>
      </section>
    </div>

    <section className="panel conversation-ai-import-card">
      <div className="conversation-card-head"><span><FileJson size={18} /></span><div><h3>已有 ChatGPT 深度分析？直接拖進來</h3><p>適合重要客戶、屋主或同事案件：不呼叫 API、不產生額外 AI 費用</p></div></div>
      <input ref={aiFileInput} type="file" accept=".json,application/json" onChange={loadAiFile} hidden />
      <button
        type="button"
        className={`conversation-ai-dropzone${isAiDragging ? " is-dragging" : ""}`}
        onClick={() => aiFileInput.current?.click()}
        onDragEnter={(event) => { event.preventDefault(); setIsAiDragging(true); }}
        onDragOver={(event) => { event.preventDefault(); event.dataTransfer.dropEffect = "copy"; setIsAiDragging(true); }}
        onDragLeave={(event) => { event.preventDefault(); if (!event.currentTarget.contains(event.relatedTarget)) setIsAiDragging(false); }}
        onDrop={dropAiFile}
      >
        <FileJson size={24} />
        <span><strong>{isAiDragging ? "放開即可匯入深度分析" : "拖拉 .json 到這裡，或點一下選擇檔案"}</strong><small>只讀取固定分析欄位，不會執行檔案內容；匯入後先預覽，再由你確認寫入。</small></span>
      </button>
    </section>

    {result && <>
      <section className="conversation-results">
        <article className="panel conversation-score-card">
          <div className={`conversation-score-ring level-${result.intentLevel}`}><strong>{result.score}</strong><span>/ 100</span></div>
          <div><span className="conversation-label">{analysisMode === "seller" ? "委售意願" : analysisMode === "team" ? "處理優先程度" : "購屋意願"}</span><h3>{result.intentLevel}{analysisMode === "team" ? "優先訴求" : `意願${analysisMode === "seller" ? "屋主" : "買方"}`}</h3><p>{analysisMode === "seller" ? "依估價、現勘、物件資料、委託與價格訊號估算。" : analysisMode === "team" ? "依明確請求、影響、阻礙、時限與急迫語句估算。" : "依客需完整度、看屋／出價／貸款等訊號與異議估算。"}</p></div>
        </article>
        <article className="panel"><span className="conversation-label">{analysisMode === "seller" ? "屋主狀況摘要" : analysisMode === "team" ? "同事訴求摘要" : "客需摘要"}</span><h3>{result.summary}</h3><p className="conversation-muted">{result.analysisSource === "chatgpt-import" ? `深度分析來源：${fileName || "ChatGPT 匯入檔"}` : `分析 ${result.messageCount} 則指定對象訊息，共 ${result.totalMessageCount} 則對話。`}</p></article>
        <article className="panel"><span className="conversation-label">建議下一步</span><h3>{result.nextStep}</h3></article>
      </section>

      <section className="panel conversation-explanation-card">
        <div className="conversation-explanation-head"><div><span className="conversation-label">ANALYSIS EXPLAINED</span><h3>這份分析到底代表什麼？</h3></div><div className="conversation-analysis-badges">{result.analysisSource === "chatgpt-import" && <span className="conversation-ai-badge">ChatGPT 深度分析</span>}<span className={`conversation-priority level-${result.intentLevel}`}>{result.intentLevel}優先</span></div></div>
        <p className="conversation-plain-explanation">{result.plainLanguageExplanation}</p>
        <div className="conversation-explanation-grid">
          <div><h4>為什麼得到 {result.score} 分</h4><ul>{result.scoreReasons.map((reason) => <li key={reason}>{reason}</li>)}</ul></div>
          <div><h4>系統從哪些原話判斷</h4>{result.evidence.length ? <div className="conversation-evidence-list">{result.evidence.map((item, index) => <blockquote key={`${item.label}-${index}`}><span>{item.label}</span>「{item.text}」</blockquote>)}</div> : <p className="conversation-empty-copy">對話中還沒有足夠明確的判斷語句。</p>}</div>
          <div><h4>目前還缺少什麼</h4>{result.missingInformation.length ? <ul>{result.missingInformation.map((item) => <li key={item}>{item}</li>)}</ul> : <p className="conversation-complete-copy">主要資訊已相當完整，可以進入下一步。</p>}</div>
          <div><h4>下一次建議怎麼問</h4>{result.recommendedQuestions.length ? <ol>{result.recommendedQuestions.map((item) => <li key={item}>{item}</li>)}</ol> : <p className="conversation-complete-copy">不必再補問基本資料，直接推進下一個行動。</p>}</div>
        </div>
        <div className="conversation-reply-box"><div><span>可直接傳送的 LINE 回覆</span><p>{result.followUpMessage}</p></div><button type="button" className="btn ghost" onClick={copyFollowUp}>{copied ? "已複製 ✓" : "複製文字"}</button></div>
      </section>

      {result.deepAnalysis && <section className="panel conversation-deep-card">
        <div className="conversation-deep-head"><div><span className="conversation-label">DEEP READING</span><h3>進一步判讀與追蹤策略</h3><p>把「對方在想什麼、卡在哪裡、接下來怎麼做」拆開說明。</p></div></div>
        <div className="conversation-deep-overview">
          <div><small>核心動機</small><p>{result.deepAnalysis.coreMotivation || "待確認"}</p></div>
          <div><small>情緒與信任變化</small><p>{result.deepAnalysis.emotionalTrend || "待確認"}</p></div>
          <div><small>目前決策階段</small><p>{result.deepAnalysis.decisionStage || "待確認"}</p></div>
        </div>
        <div className="conversation-deep-grid">
          <div><h4>誰會影響決定</h4><ResultList items={result.deepAnalysis.decisionMakers} empty="尚未辨識決策者。" /></div>
          <div><h4>可能沒直接說出的顧慮</h4><ResultList items={result.deepAnalysis.hiddenConcerns} empty="尚未辨識隱藏顧慮。" tone="negative" /></div>
          <div><h4>前後不一致或需核對</h4><ResultList items={result.deepAnalysis.contradictions} empty="目前沒有明顯矛盾。" tone="negative" /></div>
          <div><h4>你目前做得好的地方</h4><ResultList items={result.deepAnalysis.agentStrengths} empty="尚無足夠內容判斷。" /></div>
          <div><h4>這次可以補強的地方</h4><ResultList items={result.deepAnalysis.agentMissedOpportunities} empty="尚無明顯遺漏。" tone="negative" /></div>
        </div>
        <div className="conversation-action-plan">
          <div><span>24 小時內</span><ol>{result.deepAnalysis.actionPlan.within24Hours.map((item) => <li key={item}>{item}</li>)}</ol></div>
          <div><span>3 天內</span><ol>{result.deepAnalysis.actionPlan.within3Days.map((item) => <li key={item}>{item}</li>)}</ol></div>
          <div><span>7 天內</span><ol>{result.deepAnalysis.actionPlan.within7Days.map((item) => <li key={item}>{item}</li>)}</ol></div>
        </div>
      </section>}

      <section className="conversation-detail-grid">
        <article className="panel"><div className="conversation-subhead"><CheckCircle2 size={17} /><h3>{analysisMode === "seller" ? "委託訊號" : analysisMode === "team" ? "訴求重點" : "成交訊號"}</h3></div><ResultList items={result.signals} empty={`尚未偵測到明確${analysisMode === "seller" ? "委託" : analysisMode === "team" ? "訴求" : "成交"}訊號。`} /></article>
        <article className="panel"><div className="conversation-subhead objection"><XCircle size={17} /><h3>{analysisMode === "team" ? "阻礙與風險" : "異議與風險"}</h3></div><ResultList items={result.objections} empty={`尚未偵測到明確${analysisMode === "team" ? "阻礙" : "異議"}。`} tone="negative" /></article>
      </section>

      {analysisMode === "buyer" && <section className="panel conversation-matches-card">
        <div className="conversation-matches-head"><div><span className="conversation-label">AUTOMATIC MATCHING</span><h3>現有物件自動配對</h3><p>直接沿用 CRM Matching Engine V2；建立客需後仍可在客需頁調整必要／偏好條件。</p></div><strong>{matches.length} 間</strong></div>
        {matches.length ? <div className="conversation-match-list">{matches.map((match) => <Link to={`/properties?open=${match.property.id}`} key={match.property.id}><b>{match.percent}%</b><div><strong>{match.property.title}</strong><span>{match.property.totalPrice ? `${Number(match.property.totalPrice).toLocaleString()} 萬` : "價格未填"}・{match.property.layout || "格局未填"}</span><small>{[...match.reasons.slice(0, 3), ...match.missedReasons.slice(0, 1)].join("・")}</small></div><span>查看 ›</span></Link>)}</div> : <p className="conversation-empty-copy">目前沒有可配對物件；可能是尚未抽取到區域等必要條件，或物件庫沒有符合項目。</p>}
      </section>}

      {analysisMode === "seller" && <section className="panel conversation-matches-card">
        <div className="conversation-matches-head"><div><span className="conversation-label">SELLER SITUATION</span><h3>屋主狀況整理</h3><p>建立後會放入現有賣方委託流程，先以「追蹤中」管理，不會直接公開到物件庫。</p></div><strong>{result.timeline}</strong></div>
        <div className="conversation-seller-facts"><span><small>售屋動機</small><b>{result.motivations.join("、") || "待確認"}</b></span><span><small>委託偏好</small><b>{result.agreementPreference}</b></span><span><small>使用狀況</small><b>{result.occupancy}</b></span><span><small>開價／底價</small><b>{result.listing.askingPrice || "—"}／{result.listing.floorPrice || "—"} 萬</b></span></div>
      </section>}

      {analysisMode === "team" && <section className="panel conversation-matches-card">
        <div className="conversation-matches-head"><div><span className="conversation-label">TEAM REQUEST</span><h3>同事訴求整理</h3><p>建立後會寫入現有商談管理，方便指定負責人、補充紀錄與追蹤處理狀態。</p></div><strong>{result.topic.statusTag}</strong></div>
        <div className="conversation-seller-facts"><span><small>訴求類型</small><b>{result.requestTypes.join("、") || "待確認"}</b></span><span><small>提出者</small><b>{result.participant || "未指定"}</b></span><span><small>時限</small><b>{result.deadlines.join("、") || "未提及"}</b></span><span><small>目前阻礙</small><b>{result.blockers.join("、") || "未偵測到"}</b></span></div>
      </section>}

      <section className="panel conversation-save-card">
        <div><span className="conversation-label">WRITE TO CRM</span><h3>把分析結果建立為{analysisMode === "seller" ? "屋主追蹤" : analysisMode === "team" ? "商談事項" : "客需"}</h3><p>{analysisMode === "seller" ? "會建立或連結屋主，新增一筆追蹤中委託並保留完整分析。" : analysisMode === "team" ? "會寫入既有商談管理，保留訴求、阻礙、時限、優先分數與下一步。" : "會寫入既有 needs 結構，並保留分數、訊號、異議與分析來源。"}</p></div>
        {savedRecord ? <div className="conversation-saved"><CheckCircle2 size={17} />{analysisMode === "seller" ? "屋主追蹤" : analysisMode === "team" ? "商談事項" : "客需"}已建立 <Link to={savedRecord.type === "seller" ? `/sellers/${savedRecord.contactId}/${savedRecord.id}` : savedRecord.type === "team" ? `/topics?open=${savedRecord.id}` : `/needs?open=${savedRecord.id}`}>開啟資料</Link></div> : <button type="button" className="btn" onClick={saveAnalysis} disabled={saving}>{saving ? "建立中…" : `建立${analysisMode === "seller" ? "屋主追蹤" : analysisMode === "team" ? "商談事項" : "客需"}`}</button>}
      </section>
    </>}
  </main>;
}
