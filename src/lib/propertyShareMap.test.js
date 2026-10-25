import { publicRoadParts, chooseRoadPosition, locateSharedProperties, mercatorPoint,
  getManualSharePoint, saveManualSharePoint, clearManualSharePoint } from "./propertyShareMap";
import { getShareMapLayout, panShareMapViewport, pointFromShareMapClick,
  shareMapSectionAt, zoomShareMapViewport } from "./shareMapLayout";

test("分享地圖只使用公開路段，不把門牌傳給定位服務", () => {
  expect(publicRoadParts("桃園市龜山區文青路12號8樓")).toEqual({
    city: "桃園市", district: "龜山區", road: "文青路", publicAddress: "桃園市龜山區文青路",
  });
  expect(publicRoadParts("桃園市龜山區")).toBeNull();
});

test("僅採用同縣市同路名的台灣定位結果", () => {
  const parts = publicRoadParts("桃園市龜山區文化二路49號");
  const feature = (name, city, lng, lat) => ({
    properties: { name, city, countrycode: "TW" }, geometry: { coordinates: [lng, lat] },
  });
  expect(chooseRoadPosition([
    feature("文化二路", "新北市", 121.4, 25.1),
    feature("文化二路", "桃園市", 121.36, 25.06),
  ], parts)).toEqual({ lat: 25.06, lng: 121.36 });
  expect(chooseRoadPosition([feature("文化三路", "桃園市", 121.36, 25.06)], parts)).toBeNull();
});

test("地圖投影的座標在台灣範圍內", () => {
  const point = mercatorPoint(25.04, 121.39, 14);
  expect(point.x).toBeGreaterThan(0);
  expect(point.y).toBeGreaterThan(0);
});

test("同一路段只查一次，定位查詢不包含客戶不需看到的門牌", async () => {
  localStorage.clear();
  const previousFetch = global.fetch;
  global.fetch = jest.fn().mockResolvedValue({
    ok: true,
    json: async () => ({ features: [{
      properties: { name: "文興路", city: "桃園市", countrycode: "TW" },
      geometry: { coordinates: [121.39, 25.04] },
    }] }),
  });
  try {
    const result = await locateSharedProperties([
      { title: "第一間", address: "桃園市龜山區文興路12號8樓" },
      { title: "第二間", address: "桃園市龜山區文興路50號4樓" },
    ]);
    expect(global.fetch).toHaveBeenCalledTimes(1);
    expect(global.fetch.mock.calls[0][0]).not.toContain("12%E8%99%9F");
    expect(result.map((item) => item.number)).toEqual([1, 2]);
    expect(result.every((item) => item.point?.lat === 25.04)).toBe(true);
  } finally {
    global.fetch = previousFetch;
  }
});

test("截圖中的龜山兩條路在定位服務故障或舊的空快取時仍能製作位置圖", async () => {
  localStorage.clear();
  localStorage.setItem("leshan-property-share-road-positions-v1", JSON.stringify({
    "桃園市龜山區文化二路": { point: null, expiresAt: Date.now() + 60_000 },
    "桃園市龜山區文三三街": { point: null, expiresAt: Date.now() + 60_000 },
  }));
  const previousFetch = global.fetch;
  global.fetch = jest.fn().mockRejectedValue(new Error("network unavailable"));
  try {
    const result = await locateSharedProperties([
      { title: "九揚天下", address: "桃園市龜山區文化二路" },
      { title: "四季花鄉", address: "桃園市龜山區文三三街" },
    ]);
    expect(result.map((item) => item.point)).toEqual([
      { lat: 25.0605444, lng: 121.364725 },
      { lat: 25.0566579, lng: 121.3591297 },
    ]);
    expect(global.fetch).not.toHaveBeenCalled();
  } finally {
    global.fetch = previousFetch;
  }
});

test("只選 A7 常用路段的物件也能離線產生參考位置", async () => {
  localStorage.clear();
  const previousFetch = global.fetch;
  global.fetch = jest.fn().mockRejectedValue(new Error("network unavailable"));
  try {
    const result = await locateSharedProperties([
      { title: "A7 物件", address: "桃園市龜山區文青路200號" },
      { title: "A7 物件二", address: "桃園市龜山區樂善二路100號" },
    ]);
    expect(result.every((item) => item.point)).toBe(true);
    expect(global.fetch).not.toHaveBeenCalled();
  } finally {
    global.fetch = previousFetch;
  }
});

test("定位服務故障不再被誤認為地址缺漏，也不快取失敗結果", async () => {
  localStorage.clear();
  const previousFetch = global.fetch;
  global.fetch = jest.fn().mockRejectedValue(new Error("network unavailable"));
  try {
    await expect(locateSharedProperties([
      { title: "測試", address: "桃園市龜山區文興路" },
    ])).rejects.toThrow("定位服務暫時無法連線");
    expect(localStorage.getItem("leshan-property-share-road-positions-v1")).toBeNull();
  } finally {
    global.fetch = previousFetch;
  }
});

test("物件價格會交給圖片製作，手動位置在同一瀏覽器記住但地址變更時失效", async () => {
  localStorage.clear();
  const property = { id: "test-property", title: "九揚天下", totalPrice: 1368, address: "桃園市龜山區文化二路" };
  const adjusted = { lat: 25.058, lng: 121.362 };
  expect(saveManualSharePoint(property, adjusted)).toBe(true);
  expect(getManualSharePoint(property)).toEqual(adjusted);
  const result = await locateSharedProperties([property]);
  expect(result[0]).toMatchObject({ price: 1368, point: adjusted, manual: true });
  expect(getManualSharePoint({ ...property, address: "桃園市龜山區文三三街" })).toBeNull();
  clearManualSharePoint(property);
  expect(getManualSharePoint(property)).toBeNull();
});

test("點擊地圖時能把圖片座標換回地理位置，點到案名欄不移動標記", () => {
  const location = { number: 1, point: { lat: 25.0605444, lng: 121.364725 } };
  const layout = getShareMapLayout([location]);
  const section = layout.sections[0];
  const projected = mercatorPoint(location.point.lat, location.point.lng, section.viewport.zoom);
  const x = section.mapX + projected.x - section.viewport.left;
  const y = section.mapY + projected.y - section.viewport.top;
  const clicked = pointFromShareMapClick(layout, x, y);
  expect(clicked.lat).toBeCloseTo(location.point.lat, 6);
  expect(clicked.lng).toBeCloseTo(location.point.lng, 6);
  expect(pointFromShareMapClick(layout, x, section.listY + 20)).toBeNull();
});

test("拖曳地圖會平移範圍，放大縮小保持畫面中心位置", () => {
  const location = { number: 1, point: { lat: 25.0605444, lng: 121.364725 } };
  const layout = getShareMapLayout([location]);
  const section = layout.sections[0];
  const panned = panShareMapViewport(layout, section.key, 100, -50);
  expect(panned.left).toBeCloseTo(section.viewport.left - 100);
  expect(panned.top).toBeCloseTo(section.viewport.top + 50);
  const centerX = section.mapX + section.mapWidth / 2;
  const centerY = section.mapY + section.mapHeight / 2;
  const before = pointFromShareMapClick(layout, centerX, centerY);
  const zoomed = zoomShareMapViewport(layout, section.key, -1);
  const after = pointFromShareMapClick(getShareMapLayout([location], { [section.key]: zoomed }), centerX, centerY);
  expect(after.lat).toBeCloseTo(before.lat, 6);
  expect(after.lng).toBeCloseTo(before.lng, 6);
});

test("A8 與 A7 物件各用放大的地圖，維持原本編號並合成直式圖片", () => {
  const items = [
    { number: 1, area: "A8長庚生活圈", point: { lat: 25.0605444, lng: 121.364725 } },
    { number: 2, area: "A7重劃區", point: { lat: 25.0474222, lng: 121.3910019 } },
    { number: 3, area: "A7重劃區", point: { lat: 25.0393629, lng: 121.3920594 } },
  ];
  const layout = getShareMapLayout(items);
  expect(layout.sections.map((section) => section.label)).toEqual(["A8 長庚生活圈", "A7 重劃區"]);
  expect(layout.sections.map((section) => section.items.map((item) => item.number))).toEqual([[1], [2, 3]]);
  expect(layout.height).toBeGreaterThan(layout.width);
  const lower = layout.sections[1];
  expect(shareMapSectionAt(layout, lower.mapX + 30, lower.mapY + 30)?.key).toBe(lower.key);
});

test("相近的同區物件仍共用一塊地圖", () => {
  const items = [
    { number: 1, area: "A7重劃區", point: { lat: 25.0474222, lng: 121.3910019 } },
    { number: 2, area: "A7重劃區", point: { lat: 25.0393629, lng: 121.3920594 } },
  ];
  expect(getShareMapLayout(items).sections).toHaveLength(1);
});
