import React, { createContext, useContext, useEffect, useId, useRef, useState } from "react";
import { TEXT_SIZE_OPTIONS, normalizeTextSizes, readTextSizes, textSizeKey, writeTextSizes } from "../lib/textSize";
import "./TextSizeSettings.css";

const TextSizeContext = createContext(null);

export function TextSizeProvider({ userId, isMobile, children }) {
  const [preferences, setPreferences] = useState(() => {
    try { return readTextSizes(window.localStorage, userId); }
    catch { return normalizeTextSizes(null); }
  });
  const [saved, setSaved] = useState(true);
  const mode = isMobile ? "mobile" : "desktop";
  const size = preferences[mode];
  const scale = TEXT_SIZE_OPTIONS.find((option) => option.value === size).scale;

  useEffect(() => {
    const onStorage = (event) => {
      if (event.key !== null && event.key !== textSizeKey(userId)) return;
      try { setPreferences(readTextSizes(window.localStorage, userId)); }
      catch { setPreferences(normalizeTextSizes(null)); }
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, [userId]);

  const selectSize = (nextSize) => {
    const next = normalizeTextSizes({ ...preferences, [mode]: nextSize });
    setPreferences(next);
    try { setSaved(writeTextSizes(window.localStorage, userId, next)); }
    catch { setSaved(false); }
  };

  return <TextSizeContext.Provider value={{ size, selectSize, saved }}>
    <div className="crm-font-scope" data-crm-text-size={size} style={{ "--crm-font-scale": scale }}>
      {children}
    </div>
  </TextSizeContext.Provider>;
}

export default function TextSizeSettings() {
  const { size, selectSize, saved } = useContext(TextSizeContext);
  const [open, setOpen] = useState(false);
  const id = useId();
  const panelId = `text-size-${id}`;
  const rootRef = useRef(null);
  const buttonRef = useRef(null);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event) => {
      if (!rootRef.current?.contains(event.target)) setOpen(false);
    };
    const onKeyDown = (event) => {
      if (event.key === "Escape") {
        setOpen(false);
        buttonRef.current?.focus();
      }
    };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  return <div className="text-size-settings" ref={rootRef}>
    <button ref={buttonRef} type="button" className="text-size-trigger" aria-label="字體大小設定" aria-expanded={open} aria-controls={open ? panelId : undefined} onClick={() => setOpen((current) => !current)}><span aria-hidden="true">Aa</span> 字體</button>
    {open && <section id={panelId} className="text-size-panel" aria-label="字體大小">
      <div className="text-size-heading"><strong>字體大小</strong><button type="button" aria-label="關閉字體設定" onClick={() => { setOpen(false); buttonRef.current?.focus(); }}>×</button></div>
      <fieldset><legend>選擇適合你的閱讀大小</legend>
        <div className="text-size-options">{TEXT_SIZE_OPTIONS.map((option) => <label key={option.value} data-selected={size === option.value}>
          <input type="radio" name={`text-size-${id}`} value={option.value} checked={size === option.value} onChange={() => selectSize(option.value)} />
          <span className={`text-size-example text-size-example--${option.value}`} aria-hidden="true">字</span>
          <span>{option.label}</span>
        </label>)}</div>
      </fieldset>
      <p className="text-size-note">這個瀏覽器會記住你的選擇。手機、電腦可分開調整，不影響其他同事。</p>
      <p className="text-size-feedback" role="status">{saved ? `目前使用「${TEXT_SIZE_OPTIONS.find((option) => option.value === size).label}」字體` : "已套用；瀏覽器目前無法記住設定，重新開啟後需再選一次。"}</p>
    </section>}
  </div>;
}
