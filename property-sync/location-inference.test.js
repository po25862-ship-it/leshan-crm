const test = require("node:test");
const assert = require("node:assert/strict");
const { inferPropertyLocation } = require("./location-inference");

test("A7 road and title infer community and market area", () => {
  assert.deepEqual(inferPropertyLocation({ title: "A7富御捷境兩房車", address: "桃園市龜山區牛角坡路" }), {
    communityName: "富御捷境", area: "A7站重劃區-文青國小",
  });
});

test("A7 follows Leju five-zone community classification", () => {
  const cases = [
    ["皇翔歡喜城", "桃園市龜山區文青路222號", "A7站重劃區-體育大學"],
    ["新潤翡麗", "桃園市龜山區華亞三路39巷17號", "A7站重劃區-中心商業區"],
    ["富宇哈佛苑", "桃園市龜山區樂善二路447號", "A7站重劃區-文青國小"],
    ["禾悅花園", "桃園市龜山區樂學路142號", "A7站重劃區-郵政物流"],
    ["皇普MVP", "桃園市龜山區文達路290號", "A7站重劃區-樂善國小"],
  ];
  cases.forEach(([communityName, address, area]) => {
    assert.equal(inferPropertyLocation({ title: communityName, communityName, address }).area, area);
  });
});

test("generic A7 area is refined but custom area remains untouched", () => {
  assert.equal(inferPropertyLocation({ title: "皇翔歡喜城", address: "文青路222號", area: "A7重劃區" }).area, "A7站重劃區-體育大學");
  assert.equal(inferPropertyLocation({ title: "皇翔歡喜城", address: "文青路222號", area: "業務自訂商圈" }).area, "業務自訂商圈");
});

test("longer community name wins when a developer has projects in different A7 zones", () => {
  assert.equal(inferPropertyLocation({ title: "頤昌璞岳三房", address: "文桃路476巷" }).area, "A7站重劃區-郵政物流");
  assert.equal(inferPropertyLocation({ title: "頤昌澄岳三房", address: "樂學路" }).area, "A7站重劃區-樂善國小");
});

test("confirmed A7 community names are extracted from marketing titles", () => {
  assert.equal(inferPropertyLocation({ title: "A7皇翔歡喜城三房車", address: "桃園市龜山區文青路222號" }).communityName, "皇翔歡喜城");
  assert.equal(inferPropertyLocation({ title: "根津苑中庭楓景兩房車", address: "桃園市龜山區樂善三路106號" }).communityName, "根津苑");
  assert.deepEqual(inferPropertyLocation({ title: "鴻廣新A7捷運兩房車", address: "桃園市龜山區樂善二路556號" }), {
    communityName: "鴻廣新A7", area: "A7站重劃區-文青國小",
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
