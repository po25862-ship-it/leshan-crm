import test from "node:test";
import assert from "node:assert/strict";
import { parseFloor, isTopFloor } from "./floor.js";

test("樓層取所在樓層，不取大樓總樓層；地下樓層為負數", () => {
  assert.equal(parseFloor("5/20"), 5);
  assert.equal(parseFloor("６／２０"), 6);
  assert.equal(parseFloor("B1/15"), -1);
  assert.equal(parseFloor("b 2/15"), -2);
  assert.equal(parseFloor("地下2樓"), -2);
  assert.equal(parseFloor("-1/15"), -1);
  assert.equal(parseFloor(0), 0);
  assert.equal(parseFloor(""), null);
  assert.equal(parseFloor(undefined), null);
  assert.equal(parseFloor("尚未確認"), null);
});

test("範圍搜尋仍可搭配頂樓判斷", () => {
  assert.equal(isTopFloor("5/20"), false);
  assert.equal(isTopFloor("20/20"), true);
  assert.equal(isTopFloor("B1/20"), false);
});
