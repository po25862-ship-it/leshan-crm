const test = require("node:test");
const assert = require("node:assert/strict");
const { communities, inferCommunity } = require("./community-matcher");

test("the rental index community list is complete", () => {
  assert.equal(communities.length, 34);
  assert.equal(communities.reduce((sum, community) => sum + Object.values(community.streets).flat().length, 0), 521);
});

test("matches an exact doorplate despite full-width numbers and floor text", () => {
  assert.deepEqual(inferCommunity({ title: "皇翔兩房車", address: "桃園市龜山區文青二路３９號十六樓之７" }), {
    name: "皇翔歡喜城", method: "exact-address",
  });
});

test("keeps the three similarly named New Future buildings separate", () => {
  assert.equal(inferCommunity({ title: "遠雄新未來3高樓", address: "樂善二路513號" }).name, "遠雄新未來3");
  assert.equal(inferCommunity({ title: "遠雄新未來2", address: "樂善二路477號" }).name, "遠雄新未來2");
});

test("does not guess if title and doorplate conflict", () => {
  assert.equal(inferCommunity({ title: "華悅城三房", address: "文青路343號" }), null);
});

test("recognizes the owner's 智匯學 example but not the address alone", () => {
  assert.equal(inferCommunity({ title: "智匯學兩房平車", address: "牛角坡路４９號八樓" }).name, "智匯學");
  assert.equal(inferCommunity({ title: "一般兩房", address: "牛角坡路４９號八樓" }), null);
});
