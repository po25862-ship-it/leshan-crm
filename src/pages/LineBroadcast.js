import React, { useState } from "react";
import { Navigate } from "react-router-dom";
import { CheckCircle2, ExternalLink, Laptop, MessageCircle, ShieldCheck } from "lucide-react";
import { LINE_PERSONAL_TOOL_URL, openLinePersonalTool } from "../lib/linePersonal";
import { useIsMobile } from "../hooks/useIsMobile";

const steps = [
  { title: "啟動專用 Chrome", detail: "在「line群發」資料夾執行 start_line_debug.sh，並確認 LINE 擴充功能已登入。" },
  { title: "啟動群發介面", detail: "在同一資料夾執行 python3 line_web_ui.py，這個視窗在發送完成前不要關閉。" },
  { title: "回到這裡開啟工具", detail: "按下「開啟個人 LINE 群發」，選擇好友、標籤、訊息或排程，確認後再發送。" },
];

export default function LineBroadcast() {
  const isMobile = useIsMobile();
  const [copied, setCopied] = useState(false);

  if (isMobile) return <Navigate to="/more" replace />;

  const copyAddress = async () => {
    try {
      await navigator.clipboard.writeText(LINE_PERSONAL_TOOL_URL);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      window.prompt("請複製這個網址", LINE_PERSONAL_TOOL_URL);
    }
  };

  return (
    <main>
      <div className="line-hero">
        <div>
          <div className="line-eyebrow">PERSONAL LINE CONNECTOR</div>
          <h2>個人 LINE 群發</h2>
          <p>沿用目前已登入的個人 LINE，把 CRM 整理好的物件文字帶到本機群發工具。</p>
        </div>
        <div className="line-local-badge"><Laptop size={15} /> 每人使用自己的電腦與 LINE</div>
      </div>

      <div className="line-layout">
        <section className="panel line-launch-card">
          <div className="line-icon"><MessageCircle size={30} /></div>
          <h3>LINE 個人工具</h3>
          <p>好友名單、標籤、範本和發送紀錄都保留在各自電腦，不會上傳到 CRM，也不會共用你的個人 LINE。</p>
          <button className="btn line-launch-btn" onClick={openLinePersonalTool}>
            開啟個人 LINE 群發 <ExternalLink size={15} />
          </button>
          <button className="btn ghost" onClick={copyAddress}>{copied ? "網址已複製" : "複製本機工具網址"}</button>
          <div className="line-address">{LINE_PERSONAL_TOOL_URL}</div>
          <div className="line-hint">如果開啟後顯示無法連線，表示這台電腦尚未啟動本機工具，照右側三個步驟操作即可。</div>
        </section>

        <section className="panel line-steps-card">
          <div className="section-title" style={{ fontSize: 15 }}>第一次與每天開啟方式</div>
          <div className="line-steps">
            {steps.map((step, index) => (
              <div className="line-step" key={step.title}>
                <div className="line-step-number">{index + 1}</div>
                <div><strong>{step.title}</strong><p>{step.detail}</p></div>
              </div>
            ))}
          </div>
        </section>
      </div>

      <section className="panel line-safety-card">
        <ShieldCheck size={22} />
        <div>
          <strong>安全的本機串接方式</strong>
          <p>個人 LINE 無法直接在 Vercel 雲端登入，因此 CRM 只負責開啟工具與準備分享內容；真正發送仍在使用者自己的電腦進行，並保留名單預覽與人工確認。</p>
        </div>
        <div className="line-safe-points">
          <span><CheckCircle2 size={14} /> 不上傳好友資料</span>
          <span><CheckCircle2 size={14} /> 不保存 LINE 密碼</span>
          <span><CheckCircle2 size={14} /> 不共用個人帳號</span>
        </div>
      </section>
    </main>
  );
}
