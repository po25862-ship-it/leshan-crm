import React, { useState } from "react";
import { useAuth } from "../AuthContext";
import { useSharedCollection } from "../hooks/useSharedCollection";
import { newBuyerContact } from "../lib/newBuyerContact";

export default function BuyerRecipientPicker({ value, onChange }) {
  const { user } = useAuth();
  const { items: contacts, add } = useSharedCollection("contacts", "name", user.uid);
  const buyers = contacts.filter((contact) => (contact.tags || []).includes("買方"));
  const [showNew, setShowNew] = useState(false);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const createBuyer = async (event) => {
    event.preventDefault();
    if (!name.trim() || saving) return;
    setSaving(true);
    setError("");
    try {
      const ref = await add(newBuyerContact({ name, phone, notes }, user.uid));
      onChange(ref.id);
      setName("");
      setPhone("");
      setNotes("");
      setShowNew(false);
    } catch (err) {
      console.error(err);
      setError("新增客戶失敗，請稍後再試。");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="buyer-recipient-picker">
      <div className="buyer-recipient-row">
        <label>
          介紹給哪位買方客戶
          <select value={value || ""} onChange={(event) => onChange(event.target.value)}>
            <option value="">— 尚未指定客戶 —</option>
            {buyers.map((buyer) => <option key={buyer.id} value={buyer.id}>{buyer.name}{buyer.phone ? `（${buyer.phone}）` : ""}</option>)}
          </select>
        </label>
        <button type="button" className="btn ghost" onClick={() => { setShowNew((current) => !current); setError(""); }}>
          {showNew ? "取消新增" : "＋ 新增客人"}
        </button>
      </div>
      {showNew && (
        <form className="buyer-recipient-new" onSubmit={createBuyer}>
          <input value={name} onChange={(event) => setName(event.target.value)} placeholder="客戶姓名（必填）" aria-label="新客戶姓名" required />
          <input value={phone} onChange={(event) => setPhone(event.target.value)} placeholder="電話（選填）" aria-label="新客戶電話" type="tel" />
          <input value={notes} onChange={(event) => setNotes(event.target.value)} placeholder="需求備註（選填）" aria-label="新客戶需求備註" />
          <button type="submit" className="btn" disabled={saving || !name.trim()}>{saving ? "新增中…" : "新增並選取"}</button>
          {error && <span role="alert" className="buyer-recipient-error">{error}</span>}
        </form>
      )}
    </div>
  );
}
