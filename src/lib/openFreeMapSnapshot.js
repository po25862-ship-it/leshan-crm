import "maplibre-gl/dist/maplibre-gl.css";

function centerFromViewport(section) {
  const { zoom, left, top } = section.viewport;
  const scale = 256 * 2 ** zoom;
  const x = left + section.mapWidth / 2;
  const y = top + section.mapHeight / 2;
  return [x / scale * 360 - 180,
    Math.atan(Math.sinh(Math.PI * (1 - 2 * y / scale))) * 180 / Math.PI];
}

export async function drawOpenFreeMapSnapshot(ctx, section, styleUrl) {
  const { Map } = await import("maplibre-gl");
  const host = document.createElement("div");
  Object.assign(host.style, {
    position: "fixed", left: "-10000px", top: "0", zIndex: "-1",
    width: `${section.mapWidth}px`, height: `${section.mapHeight}px`, pointerEvents: "none",
  });
  document.body.appendChild(host);
  let map;
  try {
    map = new Map({
      container: host,
      style: styleUrl,
      center: centerFromViewport(section),
      zoom: section.viewport.zoom - 1,
      pixelRatio: 1,
      interactive: false,
      attributionControl: false,
      fadeDuration: 0,
      renderWorldCopies: false,
      canvasContextAttributes: { preserveDrawingBuffer: true },
    });
    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error("新版地圖載入逾時，請改選原始街道或稍後重試。")), 20000);
      map.once("idle", () => { clearTimeout(timer); resolve(); });
      map.resize();
    });
    ctx.drawImage(map.getCanvas(), section.mapX, section.mapY, section.mapWidth, section.mapHeight);
  } finally {
    map?.remove();
    host.remove();
  }
}
