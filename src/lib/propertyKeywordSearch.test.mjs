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
