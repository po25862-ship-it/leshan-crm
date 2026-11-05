import React, { useId, useState } from "react";
import PropertyTagPicker, { PropertyTagBadges } from "./PropertyTagPicker";
import { propertyTags, uniqueChoices } from "../lib/propertyChoices";

export default function PropertyListTags({ property, choices = [], onSave }) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);
  const id = useId();
  const start = () => {
    setDraft(propertyTags(property.tags));
    setError("");
    setSaved(false);
    setOpen(true);
  };
  const save = async () => {
    if (saving) return;
    setSaving(true);
    setError("");
    try {
      await onSave(draft);
      setOpen(false);
      setSaved(true);
    } catch {
      setError("標籤未儲存，請確認連線後再試一次。剛選的標籤仍保留在這裡。");
    } finally {
      setSaving(false);
    }
  };
  return <div className="property-list-tags" onClick={event => event.stopPropagation()} onKeyDown={event => event.stopPropagation()}>
    <div className="property-list-tags-bar">
      <PropertyTagBadges value={property.tags} />
      {!open && <button type="button" className="property-list-tags-toggle" aria-expanded={false} aria-controls={id} aria-label={`編輯${property.title || "物件"}的小標籤`} onClick={start}>＋ 標籤</button>}
      {!open && saved && <small role="status">標籤已儲存</small>}
    </div>
    {open && <div id={id} className="property-list-tags-panel" role="group" aria-label={`${property.title || "物件"}的小標籤`} aria-busy={saving}>
      <fieldset disabled={saving}>
        <PropertyTagPicker value={draft} choices={uniqueChoices([...choices, ...propertyTags(property.tagCatalog)])} onChange={setDraft} help="點選即可加入；按 × 移除，儲存後套用到這間物件。" />
      </fieldset>
      {error && <div className="property-choice-error" role="alert">{error}</div>}
      <div className="property-list-tags-buttons">
        <button type="button" className="property-list-tags-save" disabled={saving} onClick={save}>{saving ? "儲存中…" : "儲存標籤"}</button>
        <button type="button" className="property-list-tags-cancel" disabled={saving} onClick={() => { setOpen(false); setError(""); }}>取消</button>
      </div>
    </div>}
  </div>;
}
