import React, { useState, useEffect } from "react";
import { useDoc } from "../hooks/useDoc";
import { useGoogleAuth } from "../GoogleAuthContext";

export default function Settings() {
  const { data, save } = useDoc("settings/general", { reminderDays: 5 });
  const [days, setDays] = useState(5);
  const { isConnected, email, connect, disconnect, gsiReady } = useGoogleAuth();

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
      <div className="panel" style={{ maxWidth: 420, marginBottom: 24 }}>
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

      <div className="section-title">Google 行事曆</div>
      <div className="panel" style={{ maxWidth: 420 }}>
        {isConnected ? (
          <>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 4 }}>
              <div>
                <div style={{ fontSize: 14, fontWeight: 700 }}>已連結</div>
                <div style={{ fontSize: 12, color: "var(--muted)" }}>{email}</div>
              </div>
              <span
                style={{
                  fontSize: 12,
                  fontWeight: 700,
                  color: "#2F9E5C",
                  background: "#E6F5EC",
                  padding: "4px 12px",
                  borderRadius: 20,
                }}
              >
                ● 已連結
              </span>
            </div>
            <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 10 }}>
              之後在「案件」表單裡設定關鍵日期時，可以選擇同步到這個 Google 帳號的行事曆。
            </div>
            <button className="btn ghost" style={{ marginTop: 14 }} onClick={disconnect}>
              中斷連結
            </button>
          </>
        ) : (
          <>
            <div style={{ fontSize: 13, color: "var(--muted)", marginBottom: 14 }}>
              連結 Google 帳號後，案件的關鍵日期（委託到期、簽約日等）可以同步到你的 Google 行事曆。
            </div>
            <button className="btn" onClick={connect} disabled={!gsiReady}>
              {gsiReady ? "連結 Google 帳號" : "載入中…"}
            </button>
          </>
        )}
      </div>
    </main>
  );
}
