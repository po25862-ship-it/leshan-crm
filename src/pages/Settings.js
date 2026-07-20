import React, { useState, useEffect } from "react";
import { collection, collectionGroup, getDocs, doc, writeBatch } from "firebase/firestore";
import { db } from "../firebase";
import { useDoc } from "../hooks/useDoc";
import { useGoogleAuth } from "../GoogleAuthContext";

export default function Settings() {
  const { data, save } = useDoc("settings/general", { reminderDays: 5 });
  const [days, setDays] = useState(5);
  const { isConnected, email, connect, disconnect, gsiReady } = useGoogleAuth();
  const [migrating, setMigrating] = useState(false);
  const [migrateResult, setMigrateResult] = useState(null);

  useEffect(() => {
    setDays(data.reminderDays ?? 5);
  }, [data.reminderDays]);

  const onSave = async () => {
    await save({ reminderDays: Number(days) });
    alert("已儲存");
  };

  const migrateOldFiles = async () => {
    if (!window.confirm("這會把物件資料表、賣方委託資料、出租合約裡舊格式的單一檔案，轉成新的多檔案格式。確定要執行嗎？")) {
      return;
    }
    setMigrating(true);
    let counts = { properties: 0, listings: 0, rentals: 0 };
    try {
      // 物件資料表
      const propSnap = await getDocs(collection(db, "properties"));
      let batch = writeBatch(db);
      let opCount = 0;
      for (const d of propSnap.docs) {
        const data = d.data();
        if (data.sheetFileUrl && (!data.sheetFiles || data.sheetFiles.length === 0)) {
          batch.update(doc(db, "properties", d.id), {
            sheetFiles: [{ url: data.sheetFileUrl, name: data.sheetFileName || "檔案", type: data.sheetFileType || "" }],
          });
          counts.properties++;
          opCount++;
          if (opCount >= 400) {
            await batch.commit();
            batch = writeBatch(db);
            opCount = 0;
          }
        }
      }
      if (opCount > 0) await batch.commit();

      // 賣方委託資料（跨所有客戶底下的 listings 子集合）
      const listingSnap = await getDocs(collectionGroup(db, "listings"));
      batch = writeBatch(db);
      opCount = 0;
      for (const d of listingSnap.docs) {
        const data = d.data();
        if (data.documentUrl && (!data.documents || data.documents.length === 0)) {
          batch.update(d.ref, {
            documents: [{ url: data.documentUrl, name: data.documentName || "檔案", type: data.documentType || "" }],
          });
          counts.listings++;
          opCount++;
          if (opCount >= 400) {
            await batch.commit();
            batch = writeBatch(db);
            opCount = 0;
          }
        }
      }
      if (opCount > 0) await batch.commit();

      // 出租合約／照片
      const rentalSnap = await getDocs(collection(db, "rentals"));
      batch = writeBatch(db);
      opCount = 0;
      for (const d of rentalSnap.docs) {
        const data = d.data();
        if (data.documentUrl && (!data.documents || data.documents.length === 0)) {
          batch.update(doc(db, "rentals", d.id), {
            documents: [{ url: data.documentUrl, name: data.documentName || "檔案", type: data.documentType || "" }],
          });
          counts.rentals++;
          opCount++;
          if (opCount >= 400) {
            await batch.commit();
            batch = writeBatch(db);
            opCount = 0;
          }
        }
      }
      if (opCount > 0) await batch.commit();

      setMigrateResult(counts);
    } catch (err) {
      console.error(err);
      alert("搬移過程發生錯誤，請截圖錯誤訊息給我");
    }
    setMigrating(false);
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

      <div className="section-title">舊版檔案格式搬移</div>
      <div className="panel" style={{ maxWidth: 420 }}>
        <div style={{ fontSize: 13, color: "var(--muted)", marginBottom: 14 }}>
          之前上傳過的物件資料表、賣方委託資料、出租合約，因為升級成「可上傳多個檔案」，需要把舊格式轉一次。<b style={{ color: "var(--ink)" }}>資料本身沒有不見，只是要轉換一下參照方式。可以重複點擊，已經轉過的不會重複處理。</b>
        </div>
        <button className="btn" onClick={migrateOldFiles} disabled={migrating}>
          {migrating ? "搬移中…" : "搬移舊版檔案"}
        </button>
        {migrateResult && (
          <div style={{ marginTop: 12, fontSize: 12, color: "var(--accent)" }}>
            完成：物件 {migrateResult.properties} 筆、賣方委託 {migrateResult.listings} 筆、出租 {migrateResult.rentals} 筆
          </div>
        )}
      </div>
    </main>
  );
}
