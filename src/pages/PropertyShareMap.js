import React, { useCallback, useEffect, useState } from "react";
import { todayStr } from "../lib/dates";
import { clearManualSharePoint, locateSharedProperties, saveManualSharePoint } from "../lib/propertyShareMap";
import { getShareMapLayout, pointFromShareMapClick, renderPropertyShareMap } from "../lib/renderPropertyShareMap";

export default function PropertyShareMap({ properties }) {
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState("");
  const [error, setError] = useState("");
  const [image, setImage] = useState(null);
  const [locations, setLocations] = useState([]);
  const [adjustingNumber, setAdjustingNumber] = useState(null);
  const [notice, setNotice] = useState("");
  const [copied, setCopied] = useState(false);

  const showImage = useCallback((blob, nextLocations) => {
    const url = URL.createObjectURL(blob);
    setImage({ url, blob, missing: nextLocations.filter((item) => !item.point).length });
    setLocations(nextLocations);
  }, []);

  const generate = useCallback(async () => {
    if (!properties.length || busy) return;
    setBusy(true);
    setError("");
    setNotice("");
    setProgress("準備位置圖…");
    try {
      const locations = await locateSharedProperties(properties, setProgress);
      setProgress("正在繪製地圖與物件編號…");
      const blob = await renderPropertyShareMap(locations);
      showImage(blob, locations);
    } catch (err) {
      console.error(err);
      setError(err.message || "位置圖製作失敗，請稍後重試。");
    } finally {
      setBusy(false);
      setProgress("");
    }
  }, [properties, busy, showImage]);

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

  const moveSelectedMarker = async (event) => {
    if (adjustingNumber === null || busy || !locations.length) return;
    const layout = getShareMapLayout(locations);
    const rect = event.currentTarget.getBoundingClientRect();
    const x = (event.clientX - rect.left) * layout.width / rect.width;
    const y = (event.clientY - rect.top) * layout.height / rect.height;
    const point = pointFromShareMapClick(layout, x, y);
    if (!point) {
      setError("請點圖片左側的地圖區域，不能點右側案名清單。");
      return;
    }
    const nextLocations = locations.map((item) => item.number === adjustingNumber
      ? { ...item, point, manual: true } : item);
    setBusy(true);
    setError("");
    setProgress("正在更新圖片位置…");
    try {
      const blob = await renderPropertyShareMap(nextLocations);
      showImage(blob, nextLocations);
      const saved = saveManualSharePoint(properties[adjustingNumber - 1], point);
      setNotice(saved ? `第 ${adjustingNumber} 間已調整；這台電腦會記住位置，下載圖片也是新位置。`
        : `第 ${adjustingNumber} 間已調整；下載圖片是新位置，但此瀏覽器無法記住設定。`);
      setAdjustingNumber(null);
    } catch (err) {
      setError(err.message || "位置調整失敗，請稍後重試。");
    } finally {
      setBusy(false);
      setProgress("");
    }
  };

  const resetSelectedMarker = () => {
    if (adjustingNumber === null) return;
    clearManualSharePoint(properties[adjustingNumber - 1]);
    setAdjustingNumber(null);
    generate();
  };

  return (
    <section className="property-share-map" aria-label="物件位置圖">
      <h3>物件位置圖</h3>
      <p>圖上編號對應左側分享文字；下載 PNG 圖片後可直接傳給客人。</p>
      {busy && <div className="property-share-map-loading" role="status">{progress || "正在製作位置圖…"}</div>}
      {error && <div className="property-share-map-error" role="alert">{error}</div>}
      {notice && <div className="property-share-map-loading" role="status">{notice}</div>}
      {image && <>
        {adjustingNumber === null ? (
          <a href={image.url} target="_blank" rel="noreferrer" title="點開查看大圖">
            <img src={image.url} alt={`已標示 ${properties.length} 間物件編號、案名及價格的位置圖`} />
          </a>
        ) : (
          <button type="button" className="property-share-map-picker" onClick={moveSelectedMarker}
            aria-label={`點地圖調整第 ${adjustingNumber} 間物件的位置`} disabled={busy}>
            <img src={image.url} alt={`請點左側地圖，放置第 ${adjustingNumber} 間物件的編號`} />
          </button>
        )}
        {image.missing > 0 && <small>{image.missing} 間因地址不足或路段未找到，已在圖片中標為「位置待確認」，不會亂放地圖點。</small>}
        {adjustingNumber === null ? (
          <button type="button" className="btn ghost" onClick={() => { setAdjustingNumber(1); setError(""); }} disabled={busy}>調整編號位置</button>
        ) : (
          <div className="property-share-map-edit">
            <label>要調整的物件
              <select value={adjustingNumber} onChange={(event) => setAdjustingNumber(Number(event.target.value))}>
                {locations.map((item) => <option key={item.number} value={item.number}>{item.number}. {item.title}</option>)}
              </select>
            </label>
            <p>選好物件後，直接點圖片左側地圖上的正確位置；圖片會立即更新。</p>
            <div className="property-share-map-actions">
              <button type="button" className="btn ghost" onClick={() => setAdjustingNumber(null)}>取消調整</button>
              {locations[adjustingNumber - 1]?.manual && <button type="button" className="btn ghost" onClick={resetSelectedMarker} disabled={busy}>恢復自動位置</button>}
            </div>
          </div>
        )}
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
