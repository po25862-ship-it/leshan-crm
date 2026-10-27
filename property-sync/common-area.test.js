const test = require("node:test");
const assert = require("node:assert/strict");
const iconv = require("iconv-lite");
const { parseDetail, crmRecord } = require("./sync");
const { correction } = require("./backfill-common-areas");

const report = iconv.encode("<div>No:DD02404972</div><div>3.公設：24.05</div><div>(含車位 11.01 坪)</div><div>◎總坪 54.59</div>", "big5");

test("parser separates the parking area without changing registered total", () => {
  const result = parseDetail(report, "DD02404972");
  assert.equal(result.commonAreaPing, 13.04);
  assert.equal(result.commonAreaGrossPing, 24.05);
  assert.equal(result.parkingPing, 11.01);
  assert.equal(result.registeredTotalPing, 54.59);
});

test("daily merge retains normalized areas on failed detail scans and accepts fresh reports", () => {
  const source = parseDetail(report, "DD02404972");
  const saved = crmRecord({ commonAreaPing: 24.05 }, { ...source, detailEnriched: true });
  assert.equal(saved.commonAreaPing, 13.04);
  assert.equal(crmRecord(saved, { detailEnriched: false }).commonAreaGrossPing, 24.05);
  assert.equal(crmRecord(saved, { detailEnriched: false }).commonAreaPing, 13.04);
});

test("backfill only changes raw matching figures and cannot deduct a second time", () => {
  const source = parseDetail(report, "DD02404972");
  const existing = { commonAreaPing: 24.05, parkingPing: 11.01 };
  assert.equal(correction(existing, source).commonAreaPing, 13.04);
  assert.equal(correction({ ...existing, ...correction(existing, source) }, source), null);
  assert.equal(correction({ ...existing, commonAreaPing: 13 }, source), null);
  assert.equal(correction({ ...existing, parkingPing: 10 }, source), null);
});
