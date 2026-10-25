const PAPER = "#fffdf5";
const INK = "#33342f";

// Keep OpenFreeMap's real geometry and labels, but redraw its vector layers as ink on paper.
export function applyPenSketchMapStyle(map) {
  const layers = map.getStyle().layers;
  for (const layer of layers) {
    const { id, type } = layer;
    if (type === "background") map.setPaintProperty(id, "background-color", PAPER);
    if (type === "fill") {
      const color = /water/.test(id) ? "#eaf2f1"
        : /park|grass|wood|forest/.test(id) ? "#f0f1e6"
          : /building/.test(id) ? "#fcfaf1" : PAPER;
      map.setPaintProperty(id, "fill-color", color);
      map.setPaintProperty(id, "fill-outline-color", /building/.test(id) ? INK : "#d1d0c5");
    }
    if (type === "line") {
      const color = /water/.test(id) ? "#9aaead"
        : /railway/.test(id) ? "#77756e"
          : /-casing|boundary/.test(id) ? INK
            : /highway|bridge|tunnel/.test(id) ? PAPER : "#89877e";
      map.setPaintProperty(id, "line-color", color);
      if (/-casing/.test(id)) map.setPaintProperty(id, "line-width", 1.35);
    }
    if (type === "symbol") {
      if (/road_oneway|shield|poi_r|airport/.test(id)) {
        map.setLayoutProperty(id, "visibility", "none");
      } else {
        if (layer.layout?.["text-field"]) {
          map.setLayoutProperty(id, "text-field", ["coalesce",
            ["get", "name:nonlatin"], ["get", "name:zh-Hant"], ["get", "name:zh"], ""]);
        }
        map.setPaintProperty(id, "text-color", "#292b29");
        map.setPaintProperty(id, "text-halo-color", PAPER);
        map.setPaintProperty(id, "text-halo-width", 1.4);
        map.setPaintProperty(id, "icon-opacity", 0);
      }
    }
  }

  // A second, slightly displaced hairline makes a road look drawn with a pen.
  const minorRoad = layers.find((layer) => layer.id === "highway-minor");
  if (minorRoad && !map.getLayer("pen-sketch-road-stroke")) {
    map.addLayer({
      id: "pen-sketch-road-stroke", type: "line", source: minorRoad.source,
      "source-layer": minorRoad["source-layer"], filter: minorRoad.filter,
      paint: {
        "line-color": "#77766d", "line-width": 0.5,
        "line-translate": [1.5, 1.1], "line-opacity": 0.65,
      },
    }, layers.find((layer) => layer.type === "symbol")?.id);
  }
}

function drawBuildingHatch(ctx, map, offsetX, offsetY) {
  if (!map.getLayer("building")) return;
  const buildings = map.queryRenderedFeatures({ layers: ["building"] });
  for (const building of buildings.slice(0, 1500)) {
    if (building.geometry?.type !== "Polygon") continue;
    const outer = building.geometry.coordinates[0];
    if (!outer || outer.length < 3) continue;
    const points = outer.map(([lng, lat]) => map.project([lng, lat]));
    const left = Math.min(...points.map((point) => point.x));
    const right = Math.max(...points.map((point) => point.x));
    const top = Math.min(...points.map((point) => point.y));
    const bottom = Math.max(...points.map((point) => point.y));
    if (right - left < 5 || bottom - top < 5) continue;
    ctx.save();
    ctx.beginPath();
    points.forEach((point, index) => {
      const x = offsetX + point.x;
      const y = offsetY + point.y;
      if (index === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    });
    ctx.closePath();
    ctx.clip();
    ctx.strokeStyle = "rgba(46,48,44,.27)";
    ctx.lineWidth = 0.65;
    for (let x = left - (bottom - top); x < right + (bottom - top); x += 6) {
      ctx.beginPath();
      ctx.moveTo(offsetX + x, offsetY + bottom);
      ctx.lineTo(offsetX + x + bottom - top, offsetY + top);
      ctx.stroke();
    }
    ctx.restore();
  }
}

export function drawPenSketchDetails(ctx, map, section) {
  drawBuildingHatch(ctx, map, section.mapX, section.mapY);
  // Fine, low-contrast paper fibers. The pattern is fixed for repeatable exports.
  ctx.save();
  ctx.beginPath();
  ctx.rect(section.mapX, section.mapY, section.mapWidth, section.mapHeight);
  ctx.clip();
  ctx.fillStyle = "rgba(100,91,73,.08)";
  for (let y = 9; y < section.mapHeight; y += 19) {
    for (let x = 13 + (y * 7) % 23; x < section.mapWidth; x += 31) {
      ctx.fillRect(section.mapX + x, section.mapY + y, 1, 1);
    }
  }
  ctx.restore();
}
