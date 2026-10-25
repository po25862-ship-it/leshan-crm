import React, { useCallback, useEffect, useState } from "react";
import { todayStr } from "../lib/dates";
import { locateSharedProperties } from "../lib/propertyShareMap";
import { renderPropertyShareMap } from "../lib/renderPropertyShareMap";

export default function PropertyShareMap({ properties }) {
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState("");
  const [error, setError] = useState("");
  const [image, setImage] = useState(null);
  const [copied, setCopied] = useState(false);

  const generate = useCallback(async () => {
    if (!properties.length || busy) return;
    setBusy(true);
    setError("");
    setProgress("準備位置圖…");
    try {
      const locations = await locateSharedProperties(properties, setProgress);
      setProgress("正在繪製地圖與物件編號…");
      const blob = await renderPropertyShareMap(locations);
      const url = URL.createObjectURL(blob);
      setImage({ url, blob, missing: locations.filter((item) => !item.point).length });
    } catch (err) {
      console.error(err);
      setError(err.message || "位置圖製作失敗，請稍後重試。");
    } finally {
      setBusy(false);
      setProgress("");
    }
  }, [properties, busy]);

  useEffect(() => {
    generate();
    // This component is keyed to the selected property IDs, so it generates once per selection.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => () => {
    if (image?.url) URL.revokeObjectURL(image.url);
  }, [image]);

  const copyImage = async () => {
    if (!image) return;
    try {
      await navigator.clipboard.write([new ClipboardItem({ "image/png": image.blob })]);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setError("這個瀏覽器不支援複製圖片，請改用下載圖片後傳給客人。");
    }
  };

  return (
    <section className="property-share-map" aria-label="物件位置圖">
      <h3>物件位置圖</h3>
      <p>圖上編號對應左側分享文字；下載 PNG 圖片後可直接傳給客人。</p>
      {busy && <div className="property-share-map-loading" role="status">{progress || "正在製作位置圖…"}</div>}
      {error && <div className="property-share-map-error" role="alert">{error}</div>}
      {image && <>
        <a href={image.url} target="_blank" rel="noreferrer" title="點開查看大圖">
          <img src={image.url} alt={`已標示 ${properties.length} 間物件編號與案名的位置圖`} />
        </a>
        {image.missing > 0 && <small>{image.missing} 間因地址不足或路段未找到，已在圖片中標為「位置待確認」，不會亂放地圖點。</small>}
        <div className="property-share-map-actions">
          <a className="btn" href={image.url} download={`物件位置圖_${todayStr()}_${properties.length}間.png`}>下載圖片</a>
          {typeof ClipboardItem !== "undefined" && <button type="button" className="btn ghost" onClick={copyImage}>{copied ? "已複製圖片" : "複製圖片"}</button>}
          <button type="button" className="btn ghost" onClick={generate} disabled={busy}>重新製作</button>
        </div>
      </>}
      {!busy && !image && <button type="button" className="btn ghost" onClick={generate}>重試製作位置圖</button>}
      <small>地圖為公開路段示意，並非精確門牌。地圖與定位資料來源：<a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">OpenStreetMap contributors</a>。</small>
    </section>
  );
}
