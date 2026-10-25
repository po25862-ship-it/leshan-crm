import React, { useCallback, useEffect, useRef, useState } from "react";
import { todayStr } from "../lib/dates";
import { clearManualSharePoint, locateSharedProperties, saveManualSharePoint } from "../lib/propertyShareMap";
import { getShareMapLayout, panShareMapViewport, pointFromShareMapClick,
  shareMapSectionAt, zoomShareMapViewport } from "../lib/shareMapLayout";
import { renderPropertyShareMap } from "../lib/renderPropertyShareMap";
import { getMapBackgroundStyle, MAP_BACKGROUND_STYLES } from "../lib/shareMapStyles";

const STYLE_STORAGE_KEY = "leshan-property-share-map-style-v1";

function savedMapStyle() {
  try { return getMapBackgroundStyle(localStorage.getItem(STYLE_STORAGE_KEY)).id; }
  catch { return "standard"; }
}

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
  const [activeSectionKey, setActiveSectionKey] = useState("section-0");
  const [mapStyle, setMapStyle] = useState(savedMapStyle);
  const pointerStart = useRef(null);

  const showImage = useCallback((blob, nextLocations, viewports) => {
    const url = URL.createObjectURL(blob);
    setImage({ url, blob, viewports, missing: nextLocations.filter((item) => !item.point).length });
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
      const blob = await renderPropertyShareMap(locations, {}, mapStyle);
      showImage(blob, locations, {});
      setActiveSectionKey("section-0");
    } catch (err) {
      console.error(err);
      setError(err.message || "位置圖製作失敗，請稍後重試。");
    } finally {
      setBusy(false);
      setProgress("");
    }
  }, [properties, busy, showImage, mapStyle]);

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
      setError("請點圖片中的地圖區域，不能點物件清單。");
      return;
    }
    const nextLocations = locations.map((item) => item.number === adjustingNumber
      ? { ...item, point, manual: true } : item);
    setBusy(true);
    setError("");
    setProgress("正在更新圖片位置…");
    try {
      const blob = await renderPropertyShareMap(nextLocations, {}, mapStyle);
      showImage(blob, nextLocations, {});
      setActiveSectionKey("section-0");
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

  const renderViewports = async (nextViewports) => {
    if (busy || !image || !locations.length) return;
    setBusy(true);
    setError("");
    setProgress("正在移動地圖…");
    try {
      const blob = await renderPropertyShareMap(locations, nextViewports, mapStyle);
      showImage(blob, locations, nextViewports);
    } catch (err) {
      setError(err.message || "地圖移動失敗，請稍後重試。");
    } finally {
      setBusy(false);
      setProgress("");
    }
  };

  const changeViewport = (sectionKey, nextViewport) => {
    if (nextViewport) renderViewports({ ...image.viewports, [sectionKey]: nextViewport });
  };

  const chooseMapStyle = async (nextStyle) => {
    if (busy || !image || nextStyle === mapStyle) return;
    setBusy(true);
    setError("");
    setProgress("正在更換地圖底圖…");
    try {
      const blob = await renderPropertyShareMap(locations, image.viewports, nextStyle);
      showImage(blob, locations, image.viewports);
      setMapStyle(nextStyle);
      try { localStorage.setItem(STYLE_STORAGE_KEY, nextStyle); } catch { /* Preference is optional. */ }
    } catch (err) {
      setError(err.message || "底圖切換失敗，請稍後重試。");
    } finally {
      setBusy(false);
      setProgress("");
    }
  };

  const imageCoordinates = (event) => {
    const rect = event.currentTarget.getBoundingClientRect();
    const layout = getShareMapLayout(locations, image.viewports);
    return {
      layout,
      x: (event.clientX - rect.left) * layout.width / rect.width,
      y: (event.clientY - rect.top) * layout.height / rect.height,
    };
  };

  const onMapPointerDown = (event) => {
    if (busy || (event.pointerType === "mouse" && event.button !== 0)) return;
    const { layout, x, y } = imageCoordinates(event);
    const section = shareMapSectionAt(layout, x, y);
    if (!section) return;
    pointerStart.current = { pointerId: event.pointerId, sectionKey: section.key, x, y };
    setActiveSectionKey(section.key);
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
      changeViewport(start.sectionKey, panShareMapViewport(layout, start.sectionKey, dx, dy));
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

  const imageLayout = image && locations.length ? getShareMapLayout(locations, image.viewports) : null;
  const activeSection = imageLayout?.sections.find((section) => section.key === activeSectionKey)
    || imageLayout?.sections[0];

  return (
    <section className="property-share-map" aria-label="物件位置圖">
      <h3>物件位置圖</h3>
      <p>不同區域會分開放大，編號對應左側分享文字；下載一張 PNG 即可傳給客人。</p>
      {busy && <div className="property-share-map-loading" role="status">{progress || "正在製作位置圖…"}</div>}
      {error && <div className="property-share-map-error" role="alert">{error}</div>}
      {notice && <div className="property-share-map-loading" role="status">{notice}</div>}
      {image && <>
        <div className="property-share-map-styles" role="group" aria-label="選擇地圖底圖風格">
          <span className="property-share-map-styles-title">背景底圖</span>
          <div className="property-share-map-style-options">
            {MAP_BACKGROUND_STYLES.map((style) => <button key={style.id} type="button"
              className={`property-share-map-style${mapStyle === style.id ? " is-selected" : ""}`}
              aria-pressed={mapStyle === style.id} disabled={busy}
              onClick={() => chooseMapStyle(style.id)}>
              <span className={`property-share-map-style-swatch is-${style.swatch}`} aria-hidden="true" />
              <span>{style.label}</span>
            </button>)}
          </div>
          <small>只更換地圖底色；物件編號、案名與總價不變。</small>
        </div>
        <div className={`property-share-map-picker${dragging ? " is-dragging" : ""}`}
          onPointerDown={onMapPointerDown} onPointerMove={onMapPointerMove}
          onPointerUp={onMapPointerUp} onPointerCancel={() => { pointerStart.current = null; setDragging(false); }}>
          <img src={image.url} draggable="false" alt={`已標示 ${properties.length} 間物件編號、案名及價格的位置圖`} />
        </div>
        <div className="property-share-map-navigation" aria-label="移動地圖">
          {imageLayout.sections.length > 1 && <label className="property-share-map-zone">操作區域
            <select value={activeSection.key} onChange={(event) => setActiveSectionKey(event.target.value)}>
              {imageLayout.sections.map((section) => <option key={section.key} value={section.key}>{section.label}</option>)}
            </select>
          </label>}
          <button type="button" className="btn ghost" onClick={() => changeViewport(activeSection.key, zoomShareMapViewport(imageLayout, activeSection.key, 1))} disabled={busy || activeSection.viewport.zoom >= 18}>放大＋</button>
          <button type="button" className="btn ghost" onClick={() => changeViewport(activeSection.key, zoomShareMapViewport(imageLayout, activeSection.key, -1))} disabled={busy || activeSection.viewport.zoom <= 5}>縮小－</button>
          <button type="button" className="btn ghost" onClick={() => renderViewports({})} disabled={busy}>重設地圖範圍</button>
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
            <p>選好物件後，點任何一塊地圖上的正確位置即可移動編號；也可以先拖曳或縮放該區地圖。</p>
            <div className="property-share-map-actions">
              <button type="button" className="btn ghost" onClick={() => setAdjustingNumber(null)}>取消調整</button>
              {locations[adjustingNumber - 1]?.manual && <button type="button" className="btn ghost" onClick={resetSelectedMarker} disabled={busy}>恢復自動位置</button>}
            </div>
          </div>
        )}
        <div className="property-share-map-actions">
          <a className="btn" href={image.url} download={`物件位置圖_${getMapBackgroundStyle(mapStyle).label}_${todayStr()}_${properties.length}間.png`}>下載圖片</a>
          {typeof ClipboardItem !== "undefined" && <button type="button" className="btn ghost" onClick={copyImage}>{copied ? "已複製圖片" : "複製圖片"}</button>}
          <button type="button" className="btn ghost" onClick={generate} disabled={busy}>重新製作</button>
        </div>
      </>}
      {!busy && !image && <button type="button" className="btn ghost" onClick={generate}>重試製作位置圖</button>}
      <small>地圖為公開路段示意，並非精確門牌。地圖與定位資料來源：<a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">OpenStreetMap contributors</a>。</small>
    </section>
  );
}
