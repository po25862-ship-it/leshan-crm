import { buildPropertyShareText } from "./propertyShareText";

const properties = [
  { title: "第一間", address: "桃園市龜山區文青路12號8樓", websiteUrl: "https://www.twhg.com.tw/buy/AAA", totalPrice: 1598 },
  { title: "第二間", address: "桃園市龜山區文化七路68號6樓", websiteUrl: "https://www.twhg.com.tw/buy/BBB", totalPrice: 1498 },
];

test("推薦文字依選取順序編號並附每間對應的路段地圖", () => {
  const result = buildPropertyShareText(properties, "推薦給您", "06459");
  expect(result).toContain("1. 第一間・桃園市龜山區文青路・1598萬");
  expect(result).toContain("2. 第二間・桃園市龜山區文化七路・1498萬");
  expect(result).toContain("📍位置（路段參考）：https://www.google.com/maps/search/?api=1&query=");
  expect(result).not.toContain("12號");
  expect(result).not.toContain("68號");
  expect(result.match(/📍位置（路段參考）/g)).toHaveLength(2);
  expect(result).toContain("agid=06459");
});

test("可以關閉地圖，地址不夠完整時不產生誤導連結", () => {
  expect(buildPropertyShareText(properties, "推薦給您", "06459", false)).not.toContain("📍");
  expect(buildPropertyShareText([{ title: "待確認", address: "桃園市龜山區" }], "", "06459"))
    .toContain("📍位置：地址待確認");
});
