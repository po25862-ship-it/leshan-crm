const test = require("node:test");
const assert = require("node:assert/strict");
const {
  PUBLIC_PROPERTY_FIELDS, validFeedToken, officialPropertyUrl, publicPropertyAddress,
  toPublicMapProperty, createPublicPropertyMapHandler,
} = require("../api/_lib/public-property-map");

const TOKEN = "offline-test-only-feed-token";
const SECRET = "PRIVATE-MUST-NOT-LEAVE-CRM";
const fixture = {
  websitePublished: true, status: "active", websiteUrl: "https://www.twhg.com.tw/buy/DE12345678?agid=00000",
  title: "測試公開案名", address: "新北市林口區文化三路一段123號8樓之2", area: "新北市林口區",
  category: "電梯大樓", totalPrice: "1,680", titlePing: "32.5", mainBuildingPing: "20.5",
  auxiliaryBuildingPing: "2", commonAreaPing: 10, landPing: "4.1", layout: "4+1/2/4",
};

function configure(t, token = TOKEN) {
  const previous = process.env.PROPERTY_MAP_FEED_TOKEN;
  if (token === undefined) delete process.env.PROPERTY_MAP_FEED_TOKEN;
  else process.env.PROPERTY_MAP_FEED_TOKEN = token;
  t.after(() => {
    if (previous === undefined) delete process.env.PROPERTY_MAP_FEED_TOKEN;
    else process.env.PROPERTY_MAP_FEED_TOKEN = previous;
  });
}

async function request(handler, { token = TOKEN, method = "GET", query = {} } = {}) {
  const result = { headers: {} };
  await handler({ method, headers: { "x-property-map-token": token }, query }, {
    setHeader(key, value) { result.headers[key] = value; },
    status(status) {
      result.status = status;
      return { json(body) { result.body = body; } };
    },
  });
  assert.equal(result.headers["Cache-Control"], "no-store");
  return result;
}

function fakeFirebase(documents) {
  const calls = [];
  const query = {
    where(...args) { calls.push(["where", ...args]); return this; },
    select(...args) { calls.push(["select", ...args]); return this; },
    async get() { calls.push(["get"]); return { docs: documents.map(([id, data]) => ({ id, data: () => data })) }; },
  };
  return {
    calls,
    ensure() {
      calls.push(["initialize"]);
      return { firestore: { collection(name) { calls.push(["collection", name]); return query; } } };
    },
  };
}

test("只查已發布物件與必要欄位，輸出既有地圖 schema 並保持無座標", async (t) => {
  configure(t);
  const firebase = fakeFirebase([["property-1", fixture]]);
  const result = await request(createPublicPropertyMapHandler(firebase.ensure), {
    query: { collection: "contacts", fields: "notes", websitePublished: "false" },
  });
  assert.equal(result.status, 200);
  assert.deepEqual(firebase.calls, [
    ["initialize"], ["collection", "properties"], ["where", "websitePublished", "==", true],
    ["select", ...PUBLIC_PROPERTY_FIELDS], ["get"],
  ]);
  assert.deepEqual([...PUBLIC_PROPERTY_FIELDS].sort(), [
    "websitePublished", "status", "websiteUrl", "title", "address", "publicAddress", "area",
    "category", "propertyType", "totalPrice", "titlePing", "mainBuildingPing",
    "auxiliaryBuildingPing", "commonAreaPing", "landPing", "layout",
  ].sort());
  assert.deepEqual(result.body, { items: [{
    id: "crm-property-1", title: "測試公開案名", address: "新北市林口區文化三路一段",
    category: "電梯大樓", propertyType: "", status: "出售", price: 1680, size: 32.5,
    mainBuildingSize: 20.5, auxBuildingSize: 2, commonAreaSize: 10, landSize: 4.1,
    layout: "4+1/2/4", rooms: 4, link: "https://www.twhg.com.tw/buy/DE12345678",
    linkStatus: "valid", displayed: true, lat: null, lng: null,
  }] });
});

test("缺省狀態沿用 active；未發布、已售、暫停與外站都不出站", async (t) => {
  configure(t);
  const firebase = fakeFirebase([
    ["active", fixture],
    ["legacy", { ...fixture, status: undefined }],
    ["empty-status", { ...fixture, status: "" }],
    ["sold", { ...fixture, status: "sold" }],
    ["on-hold", { ...fixture, status: "onHold" }],
    ["unknown-status", { ...fixture, status: "pending" }],
    ["unpublished", { ...fixture, websitePublished: false }],
    ["unknown-published", { ...fixture, websitePublished: undefined }],
    ["string-published", { ...fixture, websitePublished: "true" }],
    ["external", { ...fixture, websiteUrl: "https://example.com/buy/DE12345678" }],
    ["no-url", { ...fixture, websiteUrl: "", listingNo: "DE12345678" }],
  ]);
  const result = await request(createPublicPropertyMapHandler(firebase.ensure));
  assert.deepEqual(result.body.items.map((item) => item.id), ["crm-active", "crm-legacy", "crm-empty-status"]);
});

test("官網網址只接受 HTTPS 精確主機與單一物件路徑，不猜網址或傳出 query/hash", () => {
  assert.equal(officialPropertyUrl("https://twhg.com.tw/buy/DE12345678?agid=00000&internal=secret#private"),
    "https://twhg.com.tw/buy/DE12345678");
  for (const url of [
    "http://www.twhg.com.tw/buy/DE12345678", "https://www.twhg.com.tw.evil.example/buy/DE12345678",
    "https://www.twhg.com.tw@evil.example/buy/DE12345678", "https://user:secret@www.twhg.com.tw/buy/DE12345678",
    "https://www.twhg.com.tw:444/buy/DE12345678", "https://www.twhg.com.tw/buy/",
    "https://www.twhg.com.tw/buy/DE12345678/details", "https://www.twhg.com.tw/rent/DE12345678",
    "https://www.twhg.com.tw/buy/DE123%2Fsecret", "/buy/DE12345678", { url: SECRET },
  ]) assert.equal(officialPropertyUrl(url), null);
});

test("公開地址保留道路與段，移除門牌樓層巷弄並正確處理路竹區", () => {
  const cases = [
    ["臺北市大安區忠孝東路四段123號5樓", "臺北市大安區忠孝東路四段"],
    ["新北市三峽區民權街55巷8弄12號之3", "新北市三峽區民權街"],
    ["臺北市松山區民生東路３段１２３號Ｂ１", "臺北市松山區民生東路3段"],
    ["高雄市路竹區中山路99號", "高雄市路竹區中山路"],
    ["臺中市西屯區臺灣大道三段99號", "臺中市西屯區臺灣大道三段"],
    ["244 新北市林口區文化一路80號", "新北市林口區文化一路"],
    ["新竹縣湖口鄉中正路一段123號", "新竹縣湖口鄉中正路一段"],
    ["新竹縣竹北市光明六路東二段123號", "新竹縣竹北市光明六路東二段"],
    ["文化三路一段123號8樓", "文化三路一段"],
  ];
  for (const [address, expected] of cases) {
    assert.equal(publicPropertyAddress({ address }), expected);
    assert.equal(publicPropertyAddress({ address: expected }), expected);
  }
  assert.equal(publicPropertyAddress({ publicAddress: "桃園市桃園區中正路100號8樓", address: fixture.address }),
    "桃園市桃園區中正路");
});

test("地段地號與無法辨識的地址只顯示行政區及位置待確認", () => {
  const cases = [
    [{ address: "高雄市路竹區大路段123地號" }, "高雄市路竹區｜位置待確認"],
    [{ address: "新北市林口區南勢段123地號" }, "新北市林口區｜位置待確認"],
    [{ address: "中山段123地號" }, "位置待確認"],
    [{ address: "南勢段123地號", area: "新北市林口區" }, "新北市林口區｜位置待確認"],
    [{ publicAddress: "林口區", address: fixture.address }, "林口區｜位置待確認"],
    [{ address: "私人門牌123號8樓", area: { secret: SECRET } }, "位置待確認"],
    [{ address: { privateAddress: SECRET }, publicAddress: [SECRET] }, "位置待確認"],
  ];
  for (const [property, expected] of cases) assert.equal(publicPropertyAddress(property), expected);
});

test("僅重建允許的純量欄位，私人資料、照片及巢狀值完全不出站", () => {
  const publicProperty = toPublicMapProperty("property-1", {
    ...fixture, notes: SECRET, owner: { phone: SECRET }, agents: [SECRET], listingNo: SECRET,
    sheetFiles: [{ url: SECRET }], photoUrl: SECRET, imageUrl: SECRET, floorplanFiles: [{ private: SECRET }],
    customFields: [{ label: SECRET }], id: SECRET, lat: 25.05, lng: 121.36,
    category: { nested: SECRET }, propertyType: [SECRET], title: { nested: SECRET },
    layout: { rooms: SECRET }, totalPrice: { value: SECRET },
  });
  assert.equal(JSON.stringify(publicProperty).includes(SECRET), false);
  assert.equal(publicProperty.id, "crm-property-1");
  assert.equal(publicProperty.title, "");
  assert.equal(publicProperty.category, "");
  assert.equal(publicProperty.propertyType, "");
  assert.equal(publicProperty.price, null);
  assert.equal(publicProperty.rooms, null);
  assert.equal(publicProperty.lat, null);
  assert.equal(publicProperty.lng, null);
  for (const value of [null, [], "invalid"]) assert.equal(toPublicMapProperty("id", value), null);
  assert.equal(toPublicMapProperty("bad/id", fixture), null);
  assert.equal(toPublicMapProperty("id", { ...fixture, totalPrice: Infinity }).price, null);
});

test("token 精確且固定長度摘要比較，無效、不同長度及陣列都拒絕", () => {
  assert.equal(validFeedToken(TOKEN, TOKEN), true);
  for (const value of ["", "short", `${TOKEN}-longer`, TOKEN.toUpperCase(), [TOKEN], undefined, null]) {
    assert.equal(validFeedToken(value, TOKEN), false);
  }
  assert.equal(validFeedToken("測試一", "測試二"), false);
});

test("未授權與缺少設定先於 Firebase 初始化；非 GET 也不查詢", async (t) => {
  configure(t);
  let initialized = 0;
  const handler = createPublicPropertyMapHandler(() => { initialized++; throw new Error(SECRET); });
  for (const token of ["", "wrong", [TOKEN], null]) {
    const result = await request(handler, { token });
    assert.equal(result.status, 401);
    assert.deepEqual(result.body, { error: "unauthorized" });
  }
  const post = await request(handler, { method: "POST" });
  assert.equal(post.status, 405);
  assert.equal(post.headers.Allow, "GET");
  delete process.env.PROPERTY_MAP_FEED_TOKEN;
  const missing = await request(handler);
  assert.equal(missing.status, 503);
  assert.deepEqual(missing.body, { error: "property_map_feed_unavailable" });
  assert.equal(initialized, 0);
});

test("真正 endpoint 未授權時不需要載入 Firebase 套件或憑證", async (t) => {
  configure(t);
  const endpoint = require("../api/public-property-map");
  assert.equal((await request(endpoint, { token: "wrong" })).status, 401);
});

test("資料查詢或結構錯誤一律回 502，不回傳來源資料與憑證細節", async (t) => {
  configure(t);
  const failures = [
    () => { throw new Error(`${SECRET} credentials`); },
    () => ({ firestore: { collection() { throw new Error(SECRET); } } }),
    () => ({ firestore: { collection() { return { where() { return this; }, select() { return this; }, get: async () => ({ docs: SECRET }) }; } } }),
  ];
  for (const ensure of failures) {
    const result = await request(createPublicPropertyMapHandler(ensure));
    assert.equal(result.status, 502);
    assert.deepEqual(result.body, { error: "property_map_feed_unavailable" });
    assert.equal(JSON.stringify(result.body).includes(SECRET), false);
  }
  const empty = fakeFirebase([]);
  assert.deepEqual((await request(createPublicPropertyMapHandler(empty.ensure))).body, { items: [] });
});
