const test = require("node:test");
const assert = require("node:assert/strict");
const browserHelper = require("../src/lib/floorplanAddress");
const { floorplanAddressKey, mergeFloorplanFiles, indexRememberedFloorplans } = require("./floorplan-address");

test("daily sync only matches the same complete doorplate, floor and unit", () => {
  const map = new Map([[floorplanAddressKey("桃園市龜山區牛角坡路49號八樓之2"), [{ url: "plan" }]]]);
  assert.equal(map.get(floorplanAddressKey("桃園市龜山區牛角坡路４９號八樓之２"))[0].url, "plan");
  assert.equal(map.get(floorplanAddressKey("桃園市龜山區牛角坡路49號九樓之2")), undefined);
  assert.equal(floorplanAddressKey("桃園市龜山區牛角坡路"), "");
  assert.deepEqual(mergeFloorplanFiles([{ url: "original" }], map.values().next().value), [{ url: "original" }, { url: "plan" }]);
});

test("Mac sync and website use the same address normalization", () => {
  for (const address of ["桃園市龜山區牛角坡路４９號八樓之２", "臺北市信義區松仁路100號", "文化二路"]) {
    assert.equal(floorplanAddressKey(address), browserHelper.floorplanAddressKey(address));
  }
});

test("Mac sync inherits a remembered image when the address matches", () => {
  const index = indexRememberedFloorplans([
    { address: "桃園市龜山區牛角坡路49號八樓", floorplanAddressFiles: [{ url: "plan" }] },
  ]);
  assert.deepEqual(index.get(floorplanAddressKey("桃園市龜山區牛角坡路４９號八樓")), [{ url: "plan" }]);
  assert.equal(index.get(floorplanAddressKey("桃園市龜山區牛角坡路49號九樓")), undefined);
});
