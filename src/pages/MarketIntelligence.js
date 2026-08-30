import React, { useEffect, useMemo, useState } from "react";
import { collection, doc, onSnapshot } from "firebase/firestore";
import { getIdToken } from "firebase/auth";
import { db } from "../firebase";
import { useAuth } from "../AuthContext";

const TEST_URL = "https://www.twhg.com.tw/buy/DE02505039?agid=06459";

function PrivateDriveImage({ fileId, alt }) {
  const { user } = useAuth();
  const [src, setSrc] = useState("");
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let objectUrl = "";
    let cancelled = false;
    if (!fileId || !user) return undefined;
    (async () => {
      try {
        const token = await getIdToken(user);
        const response = await fetch(`/api/market/image?file_id=${encodeURIComponent(fileId)}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!response.ok) throw new Error("image unavailable");
        objectUrl = URL.createObjectURL(await response.blob());
        if (!cancelled) setSrc(objectUrl);
      } catch {
        if (!cancelled) setFailed(true);
      }
    })();
    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [fileId, user]);

  if (failed) return <div style={{ aspectRatio: "4/3", display: "grid", placeItems: "center", background: "#F4F2ED", color: "var(--muted)", fontSize: 12 }}>圖片暫時無法載入</div>;
  if (!src) return <div style={{ aspectRatio: "4/3", background: "#F4F2ED" }} aria-label="圖片載入中" />;
  return <img src={src} alt={alt} style={{ display: "block", width: "100%", aspectRatio: "4/3", objectFit: "cover" }} />;
}

export default function MarketIntelligence({ propertyId, defaultUrl = "" }) {
  const { user } = useAuth();
  const [url, setUrl] = useState(defaultUrl || "");
  const [listings, setListings] = useState([]);
  const [photos, setPhotos] = useState([]);
  const [job, setJob] = useState(null);
  const [now, setNow] = useState(Date.now());
  const [scanning, setScanning] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    setUrl(defaultUrl || "");
  }, [propertyId, defaultUrl]);

  useEffect(() => {
    if (!propertyId) return undefined;
    const propertyUnsubscribe = onSnapshot(
      doc(db, "properties", propertyId),
      (snapshot) => setJob(snapshot.data()?.marketCrawl || null),
      (error) => console.error("讀取市場掃描狀態失敗", error)
    );
    const listingUnsubscribe = onSnapshot(
      collection(db, `properties/${propertyId}/marketListings`),
      (snapshot) => setListings(snapshot.docs.map((item) => ({ id: item.id, ...item.data() }))),
      (error) => console.error("讀取市場刊登失敗", error)
    );
    const photoUnsubscribe = onSnapshot(
      collection(db, `properties/${propertyId}/marketPhotos`),
      (snapshot) => setPhotos(snapshot.docs.map((item) => ({ id: item.id, ...item.data() })).sort((a, b) => Number(a.order || 0) - Number(b.order || 0))),
      (error) => console.error("讀取市場照片失敗", error)
    );
    return () => {
      propertyUnsubscribe();
      listingUnsubscribe();
      photoUnsubscribe();
    };
  }, [propertyId]);

  useEffect(() => {
    const interval = window.setInterval(() => setNow(Date.now()), 60000);
    return () => window.clearInterval(interval);
  }, []);

  useEffect(() => {
    const requestedAt = job?.requestedAt?.toMillis?.() || 0;
    const stale = ["queued", "running"].includes(job?.status) && now - requestedAt >= 45 * 60 * 1000;
    if (stale) {
      setMessage("掃描等待超過 45 分鐘，可能未成功啟動；現在可以重新送出。");
      return;
    }
    if (job?.status === "queued") setMessage("已排入免費掃描，正在等待 GitHub 臨時工作電腦啟動…");
    if (job?.status === "running") setMessage("掃描中：正在讀取物件、整理照片並上傳私人 Drive…");
    if (job?.status === "completed") setMessage(`掃描完成：${job.sourcePropertyId || "物件"}，已寫入 ${job.photoCount || 0} 張市場照片。`);
    if (job?.status === "failed") setMessage(`掃描失敗：${job.error || "請檢查 GitHub Actions 執行紀錄。"}`);
  }, [job, now]);

  const photosByListing = useMemo(() => photos.reduce((groups, photo) => {
    const key = photo.listingId || "unknown";
    groups[key] = [...(groups[key] || []), photo];
    return groups;
  }, {}), [photos]);

  const scan = async () => {
    if (!url.trim() || !user) return;
    setScanning(true);
    setMessage("正在送出免費掃描工作…");
    try {
      const token = await getIdToken(user, true);
      const response = await fetch("/api/market/crawl", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ crm_property_id: propertyId, url: url.trim() }),
      });
      const result = await response.json();
      if (!response.ok || !result.success) throw new Error(result.error?.message || result.error?.code || "市場掃描失敗");
      setMessage("已排入免費掃描，通常需要數分鐘，完成後本頁會自動更新。");
    } catch (error) {
      setMessage(`無法完成：${error.message}`);
    } finally {
      setScanning(false);
    }
  };

  const requestedAt = job?.requestedAt?.toMillis?.() || 0;
  const jobIsFresh = now - requestedAt < 45 * 60 * 1000;
  const busy = scanning || (["queued", "running"].includes(job?.status) && jobIsFresh);

  return (
    <div className="panel">
      <div style={{ fontSize: 14, fontWeight: 800, marginBottom: 4 }}>市場競品／市場照片</div>
      <div style={{ color: "var(--muted)", fontSize: 12, lineHeight: 1.6, marginBottom: 12 }}>
        目前支援台灣房屋單一物件。Drive 保持私人，照片只讓 CRM 已登入員工透過後端讀取。
      </div>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <input
          value={url}
          onChange={(event) => setUrl(event.target.value)}
          placeholder={TEST_URL}
          aria-label="市場物件網址"
          style={{ flex: "1 1 260px" }}
        />
        <button type="button" className="btn" onClick={scan} disabled={busy || !url.trim()}>
          {busy ? "掃描中…" : "從網址匯入"}
        </button>
      </div>
      {message && <div style={{ marginTop: 10, padding: "9px 11px", borderRadius: 8, background: "var(--accent-soft)", fontSize: 12, lineHeight: 1.5 }}>{message}</div>}

      {listings.length === 0 && !busy ? (
        <div style={{ marginTop: 14, color: "var(--muted)", fontSize: 12 }}>尚無市場資料。可貼入 DE02505039 測試網址開始。</div>
      ) : listings.map((listing) => {
        const listingPhotos = photosByListing[listing.listingId] || [];
        return (
          <section key={listing.id} style={{ marginTop: 16, borderTop: "1px solid var(--border)", paddingTop: 14 }}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 8, alignItems: "baseline", marginBottom: 8 }}>
              <div><strong>{listing.community || listing.title || listing.sourcePropertyId}</strong><div style={{ fontSize: 11, color: "var(--muted)", marginTop: 3 }}>{listing.source === "twhg" ? "台灣房屋" : listing.source}・{listing.sourcePropertyId}</div></div>
              {listing.price && <strong style={{ color: "var(--accent)" }}>{Math.round(listing.price / 10000).toLocaleString()} 萬</strong>}
            </div>
            <div style={{ fontSize: 12, color: "var(--muted)", marginBottom: 10 }}>
              {[listing.building_area && `${listing.building_area} 坪`, listing.layout, listing.floor && listing.total_floor && `${listing.floor}/${listing.total_floor} 樓`, listing.parking_type].filter(Boolean).join("・")}
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(110px, 1fr))", gap: 8 }}>
              {listingPhotos.map((photo) => (
                <div key={photo.id} style={{ borderRadius: 8, overflow: "hidden", border: "1px solid var(--border)" }}>
                  {photo.drive_file_id ? <PrivateDriveImage fileId={photo.drive_file_id} alt={`${listing.title || listing.sourcePropertyId} 市場照片 ${photo.order}`} /> : <div style={{ aspectRatio: "4/3", display: "grid", placeItems: "center", background: "#F4F2ED", color: "var(--muted)", fontSize: 11 }}>尚未上傳 Drive</div>}
                </div>
              ))}
            </div>
          </section>
        );
      })}
    </div>
  );
}
