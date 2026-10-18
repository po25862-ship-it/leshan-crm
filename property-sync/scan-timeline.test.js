const test = require("node:test");
const assert = require("node:assert/strict");
const { firstSeenFields, firstMissingFields, firstOnHoldFields } = require("./scan-timeline");

const first = "2026-10-18T00:00:00.000Z";
const later = "2026-10-19T00:00:00.000Z";

test("a new case keeps its first-seen time on later scans", () => {
  const added = firstSeenFields(null, first);
  assert.deepEqual(added, { firstSeenAt: first, firstSeenAtSource: "new" });
  assert.deepEqual(firstSeenFields(added, later), {});
});

test("an existing case is clearly marked as starting tracking now", () => {
  assert.deepEqual(firstSeenFields({ lastSeenAt: first }, later), {
    firstSeenAt: later, firstSeenAtSource: "tracking-start",
  });
});

test("first missing scan remains stable across repeated absences and relisting", () => {
  const missing = firstMissingFields({ missingSyncCount: 0 }, first);
  assert.equal(missing.firstMissingAt, first);
  assert.deepEqual(firstMissingFields({ ...missing, missingSyncCount: 1 }, later), {});
  assert.deepEqual(firstMissingFields({ ...missing, missingSyncCount: 0 }, later), {});
});

test("a previously recorded first absence is recovered when possible", () => {
  assert.deepEqual(firstMissingFields({ missingSyncCount: 1, lastMissingAt: first }, later), {
    firstMissingAt: first, firstMissingAtSource: "previous-scan",
  });
});

test("first temporary closure is not overwritten", () => {
  assert.deepEqual(firstOnHoldFields({}, first), { firstOnHoldAt: first });
  assert.deepEqual(firstOnHoldFields({ firstOnHoldAt: first }, later), {});
});
