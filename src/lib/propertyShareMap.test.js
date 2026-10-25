import { publicRoadParts, chooseRoadPosition, locateSharedProperties, mercatorPoint } from "./propertyShareMap";

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
      properties: { name: "文青路", city: "桃園市", countrycode: "TW" },
      geometry: { coordinates: [121.39, 25.04] },
    }] }),
  });
  try {
    const result = await locateSharedProperties([
      { title: "第一間", address: "桃園市龜山區文青路12號8樓" },
      { title: "第二間", address: "桃園市龜山區文青路50號4樓" },
    ]);
    expect(global.fetch).toHaveBeenCalledTimes(1);
    expect(global.fetch.mock.calls[0][0]).not.toContain("12%E8%99%9F");
    expect(result.map((item) => item.number)).toEqual([1, 2]);
    expect(result.every((item) => item.point?.lat === 25.04)).toBe(true);
  } finally {
    global.fetch = previousFetch;
  }
});
