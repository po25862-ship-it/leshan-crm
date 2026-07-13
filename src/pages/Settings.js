import React, { useState, useEffect } from "react";
import { useDoc } from "../hooks/useDoc";

export default function Settings() {
  const { data, save } = useDoc("settings/general", { reminderDays: 5 });
  const [days, setDays] = useState(5);

  useEffect(() => {
    setDays(data.reminderDays ?? 5);
  }, [data.reminderDays]);

  const onSave = async () => {
    await save({ reminderDays: Number(days) });
    alert("已儲存");
  };

  return (
    <main>
      <div className="section-title">設定</div>
      <div className="panel" style={{ maxWidth: 420 }}>
        <div className="form-field">
          <label>跟進提醒天數（超過幾天未聯絡就提醒）</label>
          <input
            type="number"
            min="1"
            value={days}
            onChange={(e) => setDays(e.target.value)}
          />
        </div>
        <div style={{ marginTop: 16 }}>
          <button className="btn" onClick={onSave}>
            儲存設定
          </button>
        </div>
      </div>
    </main>
  );
}
