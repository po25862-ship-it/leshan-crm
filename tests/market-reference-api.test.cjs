const test = require("node:test");
const assert = require("node:assert/strict");
const { referenceQuery, readMarketReference } = require("../api/_lib/market-reference");

test("reference queries whitelist fields and never forward contacts or arbitrary destinations", () => {
  assert.deepEqual(referenceQuery({ address: " 桃園市龜山區文青路222號 ", ownerName: "private", url: "file:///" }), { address: "桃園市龜山區文青路222號", communityName: "", district: "" });
  assert.equal(referenceQuery({ address: ["bad"] }), null);
  assert.equal(referenceQuery({}), null);
});
test("reference transport is authenticated, fixed-origin and shared for repeated reads", async () => {
  let requests = 0;
  const query = referenceQuery({ communityName: "transport-test" });
  const fetcher = async (url, opts) => {
    requests++;
    assert.equal(url, "https://market.lkgsliu.com/crm-reference");
    assert.equal(opts.headers.Authorization, "Bearer test-token");
    assert.equal(opts.redirect, "error");
    return { ok: true, text: async () => JSON.stringify({ community: { id: "test", name: "test" }, deals: [] }) };
  };
  await readMarketReference(query, "test-token", { fetcher, now: 1000 });
  await readMarketReference(query, "test-token", { fetcher, now: 1001 });
  assert.equal(requests, 1);
  await readMarketReference(query, "test-token", { fetcher, refresh: true, now: 1002 });
  assert.equal(requests, 2);
});
test("offline or malformed responses are not presented as successful market data", async () => {
  await assert.rejects(readMarketReference({ communityName: "bad-test" }, "t", { fetcher: async () => ({ ok: false }) }));
  await assert.rejects(readMarketReference({ communityName: "html-test" }, "t", { fetcher: async () => ({ ok: true, text: async () => "<html>login</html>" }) }));
});
