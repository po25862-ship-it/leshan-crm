const { floorplanAddressKey, mergeFloorplanFiles, indexRememberedFloorplans } = require("./floorplanAddress");

test("normalizes full-width digits and 台/臺, retaining floor and unit", () => {
  const first = "桃園市龜山區牛角坡路４９號 八樓";
  expect(floorplanAddressKey(first)).toBe("桃園市龜山區牛角坡路49號八樓");
  expect(floorplanAddressKey("桃園市龜山區牛角坡路49號九樓")).not.toBe(floorplanAddressKey(first));
  expect(floorplanAddressKey("台北市信義區松仁路100號")).toBe("臺北市信義區松仁路100號");
});

test("does not remember incomplete addresses", () => {
  expect(floorplanAddressKey("文化二路")).toBe("");
  expect(floorplanAddressKey("桃園市龜山區文化二路")).toBe("");
  expect(floorplanAddressKey("文化二路49號")).toBe("");
});

test("merges linked files by URL without overwriting existing images", () => {
  const old = { url: "old", name: "舊圖" };
  const next = { url: "new", name: "新圖" };
  expect(mergeFloorplanFiles([old], [old, next], null)).toEqual([old, next]);
});

test("a newly scanned case inherits only the same complete address", () => {
  const source = { address: "桃園市龜山區牛角坡路49號八樓", floorplanAddressFiles: [{ url: "plan" }] };
  const index = indexRememberedFloorplans([source]);
  expect(index.get(floorplanAddressKey("桃園市龜山區牛角坡路４９號八樓"))).toEqual([{ url: "plan" }]);
  expect(index.get(floorplanAddressKey("桃園市龜山區牛角坡路49號九樓"))).toBeUndefined();
});
