import React from "react";
import { useCollection } from "../hooks/useCollection";

const MODE_LABELS = { buyer: "買方客需", seller: "屋主委售" };

function dateLabel(value) {
  const date = value?.toDate?.();
  return date ? date.toLocaleString("zh-TW", { year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" }) : "剛剛建立";
}

function List({ title, items }) {
  if (!items?.length) return null;
  return <div><b>{title}</b><ul>{items.map((item) => <li key={item}>{item}</li>)}</ul></div>;
}

export default function ContactConversationAnalyses({ contactId }) {
  const { items, loading } = useCollection(`contacts/${contactId}/conversationAnalyses`, "createdAt", Boolean(contactId));
  return <div className="contact-analysis-history">
    <div className="contact-analysis-title"><div><span>CONVERSATION HISTORY</span><h3>對話分析</h3></div><strong>{items.length} 份</strong></div>
    {loading && <p className="conversation-empty-copy">載入分析紀錄中…</p>}
    {!loading && !items.length && <p className="conversation-empty-copy">尚未有對話分析。完成分析並選擇這位客戶後，紀錄會顯示在這裡。</p>}
    {items.map((analysis, index) => <details className="contact-analysis-item" key={analysis.id} open={index === 0}>
      <summary><span className={`contact-analysis-score level-${analysis.intentLevel}`}>{analysis.score}</span><span><b>{MODE_LABELS[analysis.mode] || "對話分析"}・{analysis.intentLevel}優先</b><small>{dateLabel(analysis.createdAt)}・{analysis.customerStage || "正式"}</small></span><em>展開查看</em></summary>
      <div className="contact-analysis-content">
        <section><b>摘要</b><p>{analysis.summary || "—"}</p></section>
        <section className="accent"><b>建議下一步</b><p>{analysis.nextStep || "—"}</p></section>
        {analysis.plainLanguageExplanation && <section><b>白話解讀</b><p>{analysis.plainLanguageExplanation}</p></section>}
        <div className="contact-analysis-grid"><List title="成交／委託訊號" items={analysis.signals} /><List title="異議與風險" items={analysis.objections} /><List title="尚待確認" items={analysis.missingInformation} /><List title="建議追問" items={analysis.recommendedQuestions} /></div>
        {analysis.deepAnalysis && <div className="contact-analysis-deep"><div><b>核心動機</b><p>{analysis.deepAnalysis.coreMotivation || "待確認"}</p></div><div><b>情緒與信任</b><p>{analysis.deepAnalysis.emotionalTrend || "待確認"}</p></div><div><b>決策階段</b><p>{analysis.deepAnalysis.decisionStage || "待確認"}</p></div><List title="隱藏顧慮" items={analysis.deepAnalysis.hiddenConcerns} /></div>}
        {analysis.followUpMessage && <section className="reply"><b>建議 LINE 回覆</b><p>{analysis.followUpMessage}</p></section>}
        <small className="contact-analysis-source">來源：{analysis.sourceFileName || "貼上的對話"}</small>
      </div>
    </details>)}
  </div>;
}
