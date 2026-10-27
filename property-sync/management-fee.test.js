const test = require("node:test");
const assert = require("node:assert/strict");
const iconv = require("iconv-lite");
const { parseDetail, crmRecord } = require("./sync");
const { managementFeeFromLines } = require("./management-fee");

test("detail reports preserve the original annual, monthly and per-area billing units", () => {
  for (const fee of ["2000元/年", "2600元/月", "60元/坪/月", "6000元/季", "0元/月", "無"]) {
    const html = iconv.encode(`<html><div>No:DE02305483</div><div>管理費：${fee}</div></html>`, "big5");
    assert.equal(parseDetail(html, "DE02305483").managementFee, fee);
  }
});
test("an absent or blank fee never becomes zero or an unrelated next field", () => {
  for (const lines of [["管理費：元/月"], ["管理費：--元/月"], ["管理費：", "有無車位：無"], ["管理費：", "有無車位", "無"], ["管理費：不詳"]]) assert.equal(managementFeeFromLines(lines), "");
  assert.equal(managementFeeFromLines(["管理費：", "2000元/年"]), "2000元/年");
});
test("fees require the report's exact listing number", () => {
  const wrong = iconv.encode("<div>No:DE00000000</div><div>管理費：2000元/年</div>", "big5");
  assert.throws(() => parseDetail(wrong, "DE02305483"), /編號不一致/);
  assert.equal(parseDetail(iconv.encode("<div>管理費：2000元/年</div>", "big5"), "DE02305483").managementFee, "");
});
test("daily merge retains known fees when a later detail report has no fee", () => {
  assert.equal(crmRecord({ managementFee: "2000元/年" }, { detailEnriched: true, managementFee: "" }).managementFee, "2000元/年");
  assert.equal(crmRecord({ managementFee: "1800元/年" }, { detailEnriched: true, managementFee: "2000元/年" }).managementFee, "2000元/年");
  assert.equal(crmRecord({ managementFee: 0 }, {}).managementFee, 0);
});
