import { buildPropertyShareText, DEFAULT_PROPERTY_SHARE_INTRO } from "./propertyShareText";

const properties = [
  { title: "第一間", address: "桃園市龜山區文青路12號8樓", websiteUrl: "https://www.twhg.com.tw/buy/AAA", totalPrice: 1598 },
  { title: "第二間", address: "桃園市龜山區文化七路68號6樓", websiteUrl: "https://www.twhg.com.tw/buy/BBB", totalPrice: 1498 },
];

test("推薦文字依選取順序編號並附每間對應的路段地圖", () => {
  const result = buildPropertyShareText(properties, "推薦給您", "06459");
  expect(result).toContain("1. 第一間\n售價｜1,598 萬\n桃園市龜山區文青路");
  expect(result).toContain("2. 第二間\n售價｜1,498 萬\n桃園市龜山區文化七路");
  expect(result).toContain("📍位置（路段參考）：https://www.google.com/maps/search/?api=1&query=");
  expect(result).not.toContain("12號");
  expect(result).not.toContain("68號");
  expect(result.match(/📍位置（路段參考）/g)).toHaveLength(2);
  expect(result).toContain("agid=06459");
});

const flat = {
  ...properties[0], title: "皇翔花園捷運兩房車", communityName: "皇翔歡喜城", area: "A7站重劃區-體育大學",
  titlePing: 42.15, mainBuildingPing: 19.65, parkingPing: 11.01, parkingCount: 1,
  parkingDescription: "1個坡道式平面車位 編號B3-324", parkingPrice: "",
};

test("兩筆實際範例的面積、單價、售價與統一試算說明正確", () => {
  const second = { ...flat, title: "智匯學兩房平車", communityName: "智匯學", area: "A7站重劃區-文青國小", totalPrice: 1588, titlePing: 37.23, mainBuildingPing: 16.77, parkingPing: 8.55 };
  const result = buildPropertyShareText([flat, second], DEFAULT_PROPERTY_SHARE_INTRO, "06459", false);
  expect(result).toContain("售價｜1,598 萬（含平面車位）\n主建19.65坪｜扣車後31.14坪\n車位11.01坪｜扣車單價約45.54萬／坪");
  expect(result).toContain("售價｜1,588 萬（含平面車位）\n主建16.77坪｜扣車後28.68坪\n車位8.55坪｜扣車單價約49.09萬／坪");
  expect(result.match(/平面車位每個180萬/g)).toHaveLength(1);
  expect(result).toContain("非實際分列車價；扣車後面積仍包含附屬建物與公設");
  expect(result).toContain("有想了解的物件，回覆編號就可以。");
  expect(result).not.toContain("B3-324");
  expect(result).not.toContain("室內");
});

test("機械及多個車位依數量計算，車位坪數不重複乘上數量", () => {
  const result = buildPropertyShareText([
    { ...flat, totalPrice: 1600, titlePing: 50, parkingPing: 10, parkingCount: 2, parkingDescription: "機械" },
    { ...flat, totalPrice: 1800, titlePing: 50, parkingPing: 10, parkingCount: 2 },
  ], "", "12345", false);
  expect(result).toContain("售價｜1,600 萬（含2個機械車位）");
  expect(result).toContain("車位10坪｜扣車單價約32.50萬／坪");
  expect(result).toContain("售價｜1,800 萬（含2個平面車位）");
  expect(result).toContain("車位10坪｜扣車單價約36.00萬／坪");
  expect(result).toContain("機械車位每個150萬、平面車位每個180萬預設試算");
  expect(result).toContain("agid=12345");
  expect(result).not.toContain("agid=06459");
});

test("已填車位總價優先採用並註明，不能誤標成180萬預設或官方車價", () => {
  const result = buildPropertyShareText([{ ...flat, totalPrice: 1800, titlePing: 50, parkingPing: 10, parkingCount: 2, parkingPrice: 400 }], "", "06459", false);
  expect(result).toContain("扣車單價約35.00萬／坪（車位總價400萬試算）");
  expect(result).not.toContain("180萬");
  expect(result).not.toContain("官方");
});

test.each([
  { parkingDescription: "有" }, { parkingDescription: "平面及機械" },
  { parkingCount: "" }, { parkingCount: -1 }, { parkingCount: 1.5 },
  { parkingCount: 0 }, { parkingDescription: "無" },
  { parkingPrice: "bad" }, { parkingPrice: 0 }, { parkingPrice: 2000 },
  { parkingPing: "" }, { parkingPing: -1 }, { parkingPing: 50 }, { parkingPing: 42.15 },
  { mainBuildingPing: 40 },
  { titlePing: "" }, { titlePing: 0 }, { totalPrice: 0 }, { totalPrice: -1 },
])("資料不足或矛盾時保留已知資料、不猜測扣車單價 %j", (patch) => {
  const result = buildPropertyShareText([{ ...flat, ...patch }], "", "06459", false);
  expect(result).not.toContain("扣車單價");
  expect(result).not.toMatch(/NaN|Infinity|undefined|null/);
});

test("無車位物件不套車價；空白或未確認車位不被當成無車位", () => {
  const noParking = { title: "三房", totalPrice: "１,２００", mainBuildingPing: "２０", titlePing: 30, parkingDescription: "無" };
  const result = buildPropertyShareText([noParking], "", "", false);
  expect(result).toContain("售價｜1,200 萬（無車位）\n主建20坪｜權狀30坪\n單價約40.00萬／坪");
  expect(result).not.toContain("扣車");
  expect(buildPropertyShareText([{ ...noParking, parkingDescription: "" }], "", "", false)).not.toContain("單價");
});

test("不帶入內部客戶、業務與門牌；無路段地址只顯示行政區", () => {
  const result = buildPropertyShareText([{ ...flat, address: "桃園市龜山區某里12號8樓", notes: "屋主急售", agentInfo: "內部業務", sellerServiceFee: "4%" }], "自訂開頭", "", false);
  expect(result).toContain("自訂開頭");
  expect(result).toContain("桃園市龜山區");
  expect(result).not.toMatch(/某里|12號|8樓|屋主急售|內部業務|4%|agid=/);
  expect(buildPropertyShareText([], "自訂開頭", "06459")).toBe("自訂開頭");
});

test("可以關閉地圖，地址不夠完整時不產生誤導連結", () => {
  expect(buildPropertyShareText(properties, "推薦給您", "06459", false)).not.toContain("📍");
  expect(buildPropertyShareText([{ title: "待確認", address: "桃園市龜山區" }], "", "06459"))
    .toContain("📍位置：地址待確認");
});
