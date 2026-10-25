import React, { useCallback, useEffect, useRef, useState } from "react";
import { todayStr } from "../lib/dates";
import { clearManualSharePoint, locateSharedProperties, saveManualSharePoint } from "../lib/propertyShareMap";
import { getShareMapLayout, panShareMapViewport, pointFromShareMapClick,
  renderPropertyShareMap, zoomShareMapViewport } from "../lib/renderPropertyShareMap";

export default function PropertyShareMap({ properties }) {
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState("");
  const [error, setError] = useState("");
  const [image, setImage] = useState(null);
  const [locations, setLocations] = useState([]);
  const [adjustingNumber, setAdjustingNumber] = useState(null);
  const [notice, setNotice] = useState("");
  const [copied, setCopied] = useState(false);
  const [dragging, setDragging] = useState(false);
  const pointerStart = useRef(null);

  const showImage = useCallback((blob, nextLocations, viewport) => {
    const url = URL.createObjectURL(blob);
    setImage({ url, blob, viewport, missing: nextLocations.filter((item) => !item.point).length });
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
      const viewport = getShareMapLayout(locations).viewport;
      const blob = await renderPropertyShareMap(locations, viewport);
      showImage(blob, locations, viewport);
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

  const moveSelectedMarker = async (point) => {
    if (adjustingNumber === null || busy || !locations.length) return;
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
      const blob = await renderPropertyShareMap(nextLocations, image.viewport);
      showImage(blob, nextLocations, image.viewport);
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

  const changeViewport = async (nextViewport) => {
    if (busy || !image || !locations.length) return;
    setBusy(true);
    setError("");
    setProgress("正在移動地圖…");
    try {
      const blob = await renderPropertyShareMap(locations, nextViewport);
      showImage(blob, locations, nextViewport);
    } catch (err) {
      setError(err.message || "地圖移動失敗，請稍後重試。");
    } finally {
      setBusy(false);
      setProgress("");
    }
  };

  const imageCoordinates = (event) => {
    const rect = event.currentTarget.getBoundingClientRect();
    const layout = getShareMapLayout(locations, image.viewport);
    return {
      layout,
      x: (event.clientX - rect.left) * layout.width / rect.width,
      y: (event.clientY - rect.top) * layout.height / rect.height,
    };
  };

  const onMapPointerDown = (event) => {
    if (busy || (event.pointerType === "mouse" && event.button !== 0)) return;
    const { layout, x, y } = imageCoordinates(event);
    if (x < layout.mapX || x > layout.mapX + layout.mapWidth
      || y < layout.mapY || y > layout.mapY + layout.mapHeight) return;
    pointerStart.current = { pointerId: event.pointerId, x, y };
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const onMapPointerMove = (event) => {
    if (pointerStart.current?.pointerId !== event.pointerId) return;
    const { x, y } = imageCoordinates(event);
    if (Math.hypot(x - pointerStart.current.x, y - pointerStart.current.y) > 8) setDragging(true);
  };

  const onMapPointerUp = (event) => {
    const start = pointerStart.current;
    if (!start || start.pointerId !== event.pointerId) return;
    pointerStart.current = null;
    setDragging(false);
    const { layout, x, y } = imageCoordinates(event);
    const dx = x - start.x;
    const dy = y - start.y;
    if (Math.hypot(dx, dy) > 8) {
      changeViewport(panShareMapViewport(layout, dx, dy));
    } else if (adjustingNumber !== null) {
      moveSelectedMarker(pointFromShareMapClick(layout, x, y));
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
      <p>圖上編號對應左側分享文字。拖曳地圖可移動到 A7 等區域；下載 PNG 後可直接傳給客人。</p>
      {busy && <div className="property-share-map-loading" role="status">{progress || "正在製作位置圖…"}</div>}
      {error && <div className="property-share-map-error" role="alert">{error}</div>}
      {notice && <div className="property-share-map-loading" role="status">{notice}</div>}
      {image && <>
        <div className={`property-share-map-picker${dragging ? " is-dragging" : ""}`}
          onPointerDown={onMapPointerDown} onPointerMove={onMapPointerMove}
          onPointerUp={onMapPointerUp} onPointerCancel={() => { pointerStart.current = null; setDragging(false); }}>
          <img src={image.url} draggable="false" alt={`已標示 ${properties.length} 間物件編號、案名及價格的位置圖`} />
        </div>
        <div className="property-share-map-navigation" aria-label="移動地圖">
          <button type="button" className="btn ghost" onClick={() => changeViewport(zoomShareMapViewport(getShareMapLayout(locations, image.viewport), 1))} disabled={busy || image.viewport.zoom >= 18}>放大＋</button>
          <button type="button" className="btn ghost" onClick={() => changeViewport(zoomShareMapViewport(getShareMapLayout(locations, image.viewport), -1))} disabled={busy || image.viewport.zoom <= 5}>縮小－</button>
          <button type="button" className="btn ghost" onClick={() => changeViewport(getShareMapLayout(locations).viewport)} disabled={busy}>顯示全部標記</button>
          <a className="btn ghost" href={image.url} target="_blank" rel="noreferrer">查看大圖</a>
        </div>
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
            <p>先拖曳地圖找到位置，可用「縮小」看更大範圍；選好物件後點圖片左側地圖，編號就會移到該處。</p>
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
