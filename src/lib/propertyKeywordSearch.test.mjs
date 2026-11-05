import test from "node:test";
import assert from "node:assert/strict";
import { matchesPropertyKeyword } from "./propertyKeywordSearch.js";

test("lowercase a7 finds uppercase A7 in title or area", () => {
  assert.equal(matchesPropertyKeyword({ title: "A7景觀兩房", area: "" }, "a7"), true);
  assert.equal(matchesPropertyKeyword({ title: "景觀兩房", area: "A7站重劃區-文青國小" }, "a7"), true);
  assert.equal(matchesPropertyKeyword({ title: "林口三房", area: "A9林口生活圈" }, "a7"), false);
});

test("multiple words may match across title and business area", () => {
  assert.equal(matchesPropertyKeyword({ title: "兩房平車", area: "A7站重劃區" }, "a7 兩房"), true);
  assert.equal(matchesPropertyKeyword({ title: "三房平車", area: "A7站重劃區" }, "a7 兩房"), false);
});

test("normalizes full-width text and keeps other searchable fields", () => {
  assert.equal(matchesPropertyKeyword({ title: "高樓美屋", area: "Ａ７站重劃區" }, "a7"), true);
  assert.equal(matchesPropertyKeyword({ address: "臺北市中山區" }, "台北"), true);
  assert.equal(matchesPropertyKeyword({ listingNo: "DE02502017" }, "de025"), true);
  assert.equal(matchesPropertyKeyword({ store: "文青捷運直營店" }, "捷運"), true);
  assert.equal(matchesPropertyKeyword({ title: "任意物件" }, "  "), true);
});

test("agent name finds all of that agent's listings, including jointly assigned listings and partial names", () => {
  const rows = [
    { title: "甲物件", status: "active", agentInfo: "董韋伶 03-3288283" },
    { title: "乙物件", status: "onHold", agentInfo: "劉昭佑 03-3288283、董韋伶 03-3288283" },
    { title: "丙物件", status: "sold", agentInfo: "董韋伶 03-3288283" },
    { title: "其他業務物件", agentInfo: "吳宜穎 03-3288283" },
  ];
  assert.deepEqual(rows.filter(row => matchesPropertyKeyword(row, "董韋伶")).map(row => row.title), ["甲物件", "乙物件", "丙物件"]);
  assert.equal(matchesPropertyKeyword(rows[0], "韋伶"), true);
  assert.equal(matchesPropertyKeyword({agentInfo:"  "}, "尚未填寫"), false);
});

test("agent names match displayed legacy entities and can be combined with a community or area", () => {
  assert.equal(matchesPropertyKeyword({agentInfo:"阮&#23032;臻 03-3281000"}, "阮姸臻"), true);
  assert.equal(matchesPropertyKeyword({agentInfo:"董 韋 伶 03-3288283"}, "董韋伶"), true);
  assert.equal(matchesPropertyKeyword({agentInfo:"董韋伶", communityName:"金捷市", area:"A7站重劃區"}, "a7 董韋伶 金捷市"), true);
  assert.equal(matchesPropertyKeyword({agentInfo:"吳宜穎", communityName:"金捷市", area:"A7站重劃區"}, "a7 董韋伶"), false);
});
