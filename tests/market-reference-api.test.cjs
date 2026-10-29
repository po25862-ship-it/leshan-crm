const test = require("node:test");
const assert = require("node:assert/strict");
const { referenceQuery, readMarketReference } = require("../api/_lib/market-reference");
const handler = require("../api/market/reference");

test("the API rejects anonymous and malformed requests before any source request", async () => {
  const response = () => ({ code: 200, setHeader() {}, status(n) { this.code = n; return this; }, json(data) { this.body = data; return this; } });
  const anonymous = response();
  await handler({ method: "POST", headers: {}, body: {} }, anonymous);
  assert.equal(anonymous.code, 401);
  const wrongMethod = response();
  await handler({ method: "GET", headers: {} }, wrongMethod);
  assert.equal(wrongMethod.code, 405);
  const malformed = response();
  await handler({ method: "POST", headers: { authorization: "Bearer long-enough-but-not-real-token" }, body: { address: ["bad"] } }, malformed);
  assert.equal(malformed.code, 401);
});

test("reference queries whitelist fields and never forward contacts or arbitrary destinations", () => {
  assert.deepEqual(referenceQuery({ address: " 桃園市龜山區文青路222號 ", ownerName: "private", url: "file:///" }), { address: "桃園市龜山區文青路222號", communityName: "", district: "" });
  assert.equal(referenceQuery({ address: ["bad"] }), null);
  assert.equal(referenceQuery({}), null);
});
test("reference transport is fixed-origin and verifies identity at the source for every request", async () => {
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
  assert.equal(requests, 2);
  await readMarketReference(query, "test-token", { fetcher, refresh: true, now: 1002 });
  assert.equal(requests, 3);
});
test("an earlier successful read cannot let another invalid identity reuse its data", async () => {
  const query = referenceQuery({ communityName: "identity-isolation" });
  await readMarketReference(query, "valid", { fetcher: async () => ({ ok: true, text: async () => JSON.stringify({ community: null, deals: [] }) }) });
  await assert.rejects(readMarketReference(query, "invalid", { fetcher: async () => ({ ok: false, status: 401 }) }), (error) => error.upstreamStatus === 401);
});
test("offline or malformed responses are not presented as successful market data", async () => {
  await assert.rejects(readMarketReference({ communityName: "bad-test" }, "t", { fetcher: async () => ({ ok: false }) }));
  await assert.rejects(readMarketReference({ communityName: "html-test" }, "t", { fetcher: async () => ({ ok: true, text: async () => "<html>login</html>" }) }));
});
