const test = require("node:test");
const assert = require("node:assert/strict");
const { rental591Url, readNuxt, inspectRentalHtml, checkRentalWebsite } = require("../api/_lib/rental-website");
const { createHandler } = require("../api/rental-website");
const url = "https://rent.591.com.tw/22258856";
const nuxt = (id = 22258856, status = "open", date = "2026-11-29") => `window.__NUXT__=(function(a,b,c){return {pinia:{"rent-detail-info":{ctx:{id:a,title:"測試租屋",status:b,endTime:c}}}}}(${id},${JSON.stringify(status)},${JSON.stringify(date)}));`;
const html = (...args) => `<title>測試租屋</title><script>${nuxt(...args)}</script>`;
test("only rental 591 URLs can be fetched, with tracking removed", () => {
  assert.equal(rental591Url(url + "?tracking=1"), url);
  assert.equal(rental591Url("https://www.591.com.tw/rent-detail-22258856.html"), url);
  for (const bad of ["https://127.0.0.1/22258856", "https://rent.591.com.tw.evil.test/22258856", "https://rent.591.com.tw:8877/22258856", "https://user:pass@rent.591.com.tw/22258856", "https://rent.591.com.tw/", "file:///22258856"]) assert.equal(rental591Url(bad), "");
});
test("reads the exact listing's status and explicit end date without confusing nearby listings", () => {
  assert.deepEqual(inspectRentalHtml(html(), url), { url, status: "live", expiresOn: "2026-11-29" });
  assert.equal(inspectRentalHtml(html(12345678), url).status, "unknown");
  assert.equal(inspectRentalHtml(html(22258856, "close"), url).status, "unlisted");
  assert.equal(inspectRentalHtml(html(22258856, "open", "2026-02-30"), url).expiresOn, "");
});
test("blocks, changed pages and ambiguous statuses never mean a website is unavailable", () => {
  assert.equal(inspectRentalHtml("<title>安全驗證</title>", url, 404).status, "unknown");
  assert.equal(inspectRentalHtml(html(), url, 403).status, "unknown");
  assert.equal(inspectRentalHtml("<title>請重試</title>", url, 200).status, "unknown");
  assert.equal(inspectRentalHtml("not found", url, 404).status, "unlisted");
  assert.equal(inspectRentalHtml(html(22258856, "unrecognized"), url).status, "unknown");
});
test("parses literals without ever executing website functions or getters", () => {
  const source = 'window.__NUXT__=(function(a){global.__rentalWebsiteExecuted=true;return {safe:a,get evil(){global.__rentalWebsiteExecuted=true;return 1},call:danger()}}("ok"));';
  const data = readNuxt(source);
  assert.equal(data.safe, "ok"); assert.equal(data.call, undefined); assert.equal(data.evil, undefined); assert.equal(global.__rentalWebsiteExecuted, undefined);
});
test("checks a bounded page but never follows an external redirect or treats a timeout as unlisted", async () => {
  let calls = 0;
  const live = await checkRentalWebsite(url, { fetcher: async (_, options) => { calls++; assert.equal(options.redirect, "manual"); return new Response(html()); } });
  assert.equal(live.status, "live"); assert.equal(live.expiresOn, "2026-11-29");
  const redirected = await checkRentalWebsite(url, { fetcher: async () => { calls++; return new Response(null, { status: 302, headers: { location: "http://127.0.0.1/private" } }); } });
  assert.equal(redirected.status, "unknown"); assert.equal(calls, 2);
  assert.equal((await checkRentalWebsite(url, { fetcher: async () => { throw new Error("timeout"); } })).status, "unknown");
  assert.equal((await checkRentalWebsite(url, { fetcher: async () => new Response("x", { headers: { "content-length": "2000000" } }) })).status, "unknown");
});
function response() { return { headers: {}, setHeader(k, v) { this.headers[k] = v; }, status(code) { this.statusCode = code; return this; }, json(body) { this.body = body; return this; } }; }
test("API authenticates every call and rejects unsupported URLs before fetching", async () => {
  let fetches = 0;
  const handler = createHandler({ verifyUser: async () => ({ uid: "staff" }), checkWebsite: async value => { fetches++; return { url: value, status: "live" }; } });
  const valid = response(); await handler({ method: "POST", headers: {}, body: { url } }, valid); assert.equal(valid.statusCode, 200); assert.equal(fetches, 1);
  const bad = response(); await handler({ method: "POST", headers: {}, body: { url: "http://127.0.0.1/secret" } }, bad); assert.equal(bad.statusCode, 400); assert.equal(fetches, 1);
  const rejected = response(); await createHandler({ verifyUser: async () => { throw new Error("unauthorized"); }, checkWebsite: async () => { fetches++; } })({ method: "POST", headers: {}, body: { url } }, rejected); assert.equal(rejected.statusCode, 401); assert.equal(fetches, 1);
});
