const test = require("node:test");
const assert = require("node:assert/strict");
const { inferPropertyLocation } = require("./location-inference");

test("A7 road and title infer community and market area", () => {
  assert.deepEqual(inferPropertyLocation({ title: "A7富御捷境兩房車", address: "桃園市龜山區牛角坡路" }), {
    communityName: "富御捷境", area: "A7重劃區",
  });
});

test("full address falls back to city district", () => {
  assert.deepEqual(inferPropertyLocation({ title: "採光三房", address: "桃園市桃園區中正路1209號" }), {
    communityName: "", area: "桃園市桃園區",
  });
});

test("Lin-Kou full address stays A9 even on Culture 2nd Road", () => {
  assert.equal(inferPropertyLocation({ title: "東森新世界店面", address: "新北市林口區文化二路一段26號" }).area, "A9林口生活圈");
});

test("community-like address is accepted without guessing a street", () => {
  assert.deepEqual(inferPropertyLocation({ title: "高樓兩房", address: "晴空大地" }), {
    communityName: "晴空大地", area: "",
  });
});

test("existing values are preserved", () => {
  assert.deepEqual(inferPropertyLocation({ title: "其他", address: "台北市士林區", communityName: "人工社區", area: "自訂商圈" }), {
    communityName: "人工社區", area: "自訂商圈",
  });
});
