import React, { useState, useEffect } from "react";
import { collection, collectionGroup, getDocs, doc, writeBatch } from "firebase/firestore";
import { db } from "../firebase";
import { useDoc } from "../hooks/useDoc";
import { useCollection } from "../hooks/useCollection";
import { useGoogleAuth } from "../GoogleAuthContext";
import { useAuth } from "../AuthContext";

export default function Settings() {
  const { user } = useAuth();
  const { data, save } = useDoc("settings/general", { reminderDays: 5 });
  const { items: activityLog } = useCollection("propertyActivityLog", "at");
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

  const [backfillingOwners, setBackfillingOwners] = useState(false);
  const [backfillOwnersResult, setBackfillOwnersResult] = useState(null);

  const backfillOwners = async () => {
    if (!window.confirm("這會把買方/賣方/出租/商談事項/客需裡，還沒有「擁有者」的舊資料，全部標記成屬於你。確定要執行嗎？")) {
      return;
    }
    setBackfillingOwners(true);
    const counts = { contacts: 0, listings: 0, rentals: 0, topics: 0, needs: 0 };
    try {
      const applyBatch = async (snap, colName) => {
        let batch = writeBatch(db);
        let opCount = 0;
        for (const d of snap.docs) {
          const data = d.data();
          if (data.ownerUid) continue; // 已經有擁有者的跳過
          batch.update(d.ref, { ownerUid: user.uid, lastModifiedByUid: user.uid, sharedWith: data.sharedWith || [] });
          counts[colName]++;
          opCount++;
          if (opCount >= 400) {
            await batch.commit();
            batch = writeBatch(db);
            opCount = 0;
          }
        }
        if (opCount > 0) await batch.commit();
      };

      await applyBatch(await getDocs(collection(db, "contacts")), "contacts");
      await applyBatch(await getDocs(collectionGroup(db, "listings")), "listings");
      await applyBatch(await getDocs(collection(db, "rentals")), "rentals");
      await applyBatch(await getDocs(collection(db, "topics")), "topics");
      await applyBatch(await getDocs(collection(db, "needs")), "needs");

      setBackfillOwnersResult(counts);
    } catch (err) {
      console.error(err);
      alert("補齊失敗，請截圖錯誤訊息給我");
    }
    setBackfillingOwners(false);
  };

  const [backfillingTopics, setBackfillingTopics] = useState(false);
  const [backfillTopicsResult, setBackfillTopicsResult] = useState(null);

  const backfillTopicStatus = async () => {
    setBackfillingTopics(true);
    let count = 0;
    try {
      const topicsSnap = await getDocs(collection(db, "topics"));
      const batch = writeBatch(db);
      let opCount = 0;
      for (const topicDoc of topicsSnap.docs) {
        const logsSnap = await getDocs(collection(db, `topics/${topicDoc.id}/logs`));
        if (logsSnap.empty) continue;
        const logs = logsSnap.docs.map((d) => d.data()).sort((a, b) => (a.date < b.date ? 1 : -1));
        const latest = logs[0];
        batch.update(doc(db, "topics", topicDoc.id), {
          lastStatusNote: latest.note || "",
          lastUpdatedDate: latest.date || topicDoc.data().lastUpdatedDate || "",
        });
        count++;
        opCount++;
        if (opCount >= 400) {
          await batch.commit();
          opCount = 0;
        }
      }
      if (opCount > 0) await batch.commit();
      setBackfillTopicsResult(count);
    } catch (err) {
      console.error(err);
      alert("補齊失敗，請截圖錯誤訊息給我");
    }
    setBackfillingTopics(false);
  };

  const [migratingInteractions, setMigratingInteractions] = useState(false);
  const [migrateInteractionsResult, setMigrateInteractionsResult] = useState(null);

  const migrateOldSellerInteractions = async () => {
    if (!window.confirm("這會把賣方客戶身上舊版的帶看/互動紀錄，搬移到對應的委託物件底下。確定要執行嗎？")) {
      return;
    }
    setMigratingInteractions(true);
    let movedCount = 0;
    let skippedContacts = [];
    try {
      const contactsSnap = await getDocs(collection(db, "contacts"));
      for (const contactDoc of contactsSnap.docs) {
        const data = contactDoc.data();
        if (!(data.tags || []).includes("賣方")) continue;

        const oldInteractionsSnap = await getDocs(collection(db, `contacts/${contactDoc.id}/interactions`));
        if (oldInteractionsSnap.empty) continue;

        const listingsSnap = await getDocs(collection(db, `contacts/${contactDoc.id}/listings`));
        if (listingsSnap.size !== 1) {
          skippedContacts.push({ name: data.name || contactDoc.id, count: oldInteractionsSnap.size, listings: listingsSnap.size });
          continue; // 有 0 筆或多筆委託物件時無法自動判斷要搬去哪一筆，先跳過
        }

        const listingId = listingsSnap.docs[0].id;
        const batch = writeBatch(db);
        oldInteractionsSnap.docs.forEach((d) => {
          const newRef = doc(collection(db, `contacts/${contactDoc.id}/listings/${listingId}/interactions`));
          batch.set(newRef, d.data());
          batch.delete(d.ref);
        });
        await batch.commit();
        movedCount += oldInteractionsSnap.size;
      }
      setMigrateInteractionsResult({ movedCount, skippedContacts });
    } catch (err) {
      console.error(err);
      alert("搬移過程發生錯誤，請截圖錯誤訊息給我");
    }
    setMigratingInteractions(false);
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

      <div className="section-title">多人協作準備：補齊資料擁有者（第一階段）</div>
      <div className="panel" style={{ maxWidth: 460, marginBottom: 24 }}>
        <div style={{ fontSize: 13, color: "var(--muted)", marginBottom: 14 }}>
          之後要開放同事使用買方/賣方/出租/商談事項/客需，每筆資料都需要標記「擁有者」。<b style={{ color: "var(--ink)" }}>點這個按鈕，會把目前所有還沒有擁有者的舊資料，全部標記成屬於你。</b>可以重複點，已經標記過的不會重複處理，不會出錯。
        </div>
        <button className="btn" onClick={backfillOwners} disabled={backfillingOwners}>
          {backfillingOwners ? "補齊中…" : "補齊資料擁有者"}
        </button>
        {backfillOwnersResult && (
          <div style={{ marginTop: 12, fontSize: 12, color: "var(--accent)" }}>
            完成：買方/賣方聯絡人 {backfillOwnersResult.contacts} 筆、委託物件 {backfillOwnersResult.listings} 筆、
            出租 {backfillOwnersResult.rentals} 筆、商談事項 {backfillOwnersResult.topics} 筆、客需 {backfillOwnersResult.needs} 筆
          </div>
        )}
      </div>

      <div className="section-title">同事異動紀錄（物件管理網站）</div>
      <div className="panel" style={{ maxWidth: 560, marginBottom: 24 }}>
        <div style={{ fontSize: 13, color: "var(--muted)", marginBottom: 14 }}>
          同事在「物件管理」網站新增或編輯物件時，會自動記在這裡（只有你看得到）。
        </div>
        {activityLog.length === 0 && (
          <div style={{ fontSize: 13, color: "var(--muted)" }}>目前還沒有紀錄</div>
        )}
        {activityLog.slice(0, 30).map((log) => (
          <div key={log.id} style={{ padding: "10px 0", borderBottom: "1px solid var(--border)", fontSize: 13 }}>
            <div style={{ display: "flex", justifyContent: "space-between" }}>
              <span>
                <span style={{ fontWeight: 700 }}>{log.byEmail || "未知帳號"}</span>
                　{log.action === "新增" ? "新增了" : "編輯了"}
                　<span style={{ fontWeight: 700 }}>{log.title}</span>
              </span>
              <span className="mono" style={{ fontSize: 11, color: "var(--muted)" }}>
                {log.at?.toDate ? log.at.toDate().toLocaleString("zh-TW", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" }) : ""}
              </span>
            </div>
            {log.changes && log.changes.length > 0 && (
              <div style={{ marginTop: 4, color: "var(--muted)" }}>
                {log.changes.map((c, i) => <div key={i}>・{c}</div>)}
              </div>
            )}
          </div>
        ))}
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

      <div className="section-title">商談事項最新狀況補齊</div>
      <div className="panel" style={{ maxWidth: 420, marginBottom: 24 }}>
        <div style={{ fontSize: 13, color: "var(--muted)", marginBottom: 14 }}>
          總覽頁「商談事項」的最新狀況，只有新增討論紀錄之後才會顯示。<b style={{ color: "var(--ink)" }}>點這個按鈕，會把每筆商談事項「原本已經有的最新一筆討論紀錄」抓出來補上</b>，之後就會在總覽頁看到。可以重複點，不會出錯。
        </div>
        <button className="btn" onClick={backfillTopicStatus} disabled={backfillingTopics}>
          {backfillingTopics ? "補齊中…" : "補齊商談事項最新狀況"}
        </button>
        {backfillTopicsResult !== null && (
          <div style={{ marginTop: 12, fontSize: 12, color: "var(--accent)" }}>
            完成：補齊了 {backfillTopicsResult} 筆商談事項
          </div>
        )}
      </div>

      <div className="section-title">賣方帶看紀錄搬移</div>
      <div className="panel" style={{ maxWidth: 420, marginBottom: 24 }}>
        <div style={{ fontSize: 13, color: "var(--muted)", marginBottom: 14 }}>
          之前賣方的帶看/互動紀錄，曾經存在「客戶本身」底下，後來改成存在「委託物件」底下。<b style={{ color: "var(--ink)" }}>如果某位賣方的舊紀錄在委託物件詳情頁看不到，點這個按鈕搬一次就會出現。</b>只有一筆委託物件的賣方會自動搬移；有 0 筆或多筆委託物件的賣方，因為不知道要搬去哪一筆，會列出來讓你知道，需要的話再跟我說個別處理。
        </div>
        <button className="btn" onClick={migrateOldSellerInteractions} disabled={migratingInteractions}>
          {migratingInteractions ? "搬移中…" : "搬移賣方帶看紀錄"}
        </button>
        {migrateInteractionsResult && (
          <div style={{ marginTop: 12, fontSize: 12 }}>
            <div style={{ color: "var(--accent)" }}>完成：搬了 {migrateInteractionsResult.movedCount} 筆記錄</div>
            {migrateInteractionsResult.skippedContacts.length > 0 && (
              <div style={{ marginTop: 8, color: "var(--brass)" }}>
                以下賣方跳過，需要手動處理：
                {migrateInteractionsResult.skippedContacts.map((s, i) => (
                  <div key={i}>・{s.name}（{s.count} 筆舊紀錄，目前有 {s.listings} 筆委託物件）</div>
                ))}
              </div>
            )}
          </div>
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
