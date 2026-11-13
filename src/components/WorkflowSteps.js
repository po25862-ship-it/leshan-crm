import React from "react";
import "./WorkflowControls.css";

export default function WorkflowSteps({ steps, current, onChange, completed = [], disabled = false, shortLabels = [], className = "", label = "填寫步驟" }) {
  return <nav className={`workflow-steps ${className}`} aria-label={label}>
    <p className="workflow-step-progress" role="status">第 {current + 1}／{steps.length} 步 · {steps[current]}</p>
    <ol>{steps.map((title, index) => <li key={title} data-state={current === index ? "current" : completed.includes(index) ? "complete" : "upcoming"}>
      <button type="button" aria-label={`${index + 1}. ${title}`} aria-current={current === index ? "step" : undefined} disabled={disabled} onClick={() => onChange(index)}><span className="workflow-step-number" aria-hidden="true">{completed.includes(index) && current !== index ? "✓" : index + 1}</span><span className={`workflow-step-title${shortLabels[index] ? " has-short" : ""}`}>{title}</span>{shortLabels[index] && <span className="workflow-step-short" aria-hidden="true">{shortLabels[index]}</span>}<span className="workflow-step-sr">{current === index ? "，目前步驟" : completed.includes(index) ? "，資料已填寫" : ""}</span></button>
    </li>)}</ol>
  </nav>;
}
