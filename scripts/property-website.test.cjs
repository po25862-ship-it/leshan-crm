const test = require("node:test");
const assert = require("node:assert/strict");
const { inspectOfficialHtml, checkOfficialWebsite } = require("../api/_lib/property-website");
const { createHandler } = require("../api/property-website");
const id = "DE02505030";
const live = `<title>遠雄夏沐景觀三房車｜桃園市桃園區 住宅出售｜台灣房屋</title><link rel="canonical" href="https://www.twhg.com.tw/buy/${id}"><h2>詳細資料</h2><span>建坪</span>`;
test("有正確委託號與完整售屋資料才算上架", () => {
  assert.equal(inspectOfficialHtml(live, id), "live");
  assert.equal(inspectOfficialHtml(live.replaceAll(id, "DD02505030"), id), "unknown");
  assert.equal(inspectOfficialHtml('<title>台灣房屋</title><a href="/buy/DE02505030">推薦物件</a>', id), "unknown");
  assert.equal(inspectOfficialHtml(live, id, 403), "unknown");
  assert.equal(inspectOfficialHtml('<title>請完成人機驗證</title>', id), "unknown");
  assert.equal(inspectOfficialHtml('', id, 404), "unlisted");
});
test("固定官方網址，不跟隨重新導向；來源異常保持待確認", async () => {
  let request;
  const result = await checkOfficialWebsite(id, { fetcher: async (url, options) => { request = { url, options }; return new Response(live, { headers: { 'content-type': 'text/html' } }); } });
  assert.equal(result.status, "live");
  assert.equal(request.url, `https://www.twhg.com.tw/buy/${id}`);
  assert.equal(request.options.redirect, "manual");
  assert.equal((await checkOfficialWebsite(id, { fetcher: async () => new Response('', { status: 302, headers: {location:'http://127.0.0.1/'} }) })).status, "unknown");
  assert.equal((await checkOfficialWebsite(id, { fetcher: async () => new Response('', { status: 302, headers: {location:'https://www.twhg.com.tw/buy/list'} }) })).status, "unlisted");
  await assert.rejects(checkOfficialWebsite('http://127.0.0.1/'));
});
const call = async (handler, body, method = 'POST') => {
  const res = { setHeader(){}, status(code){this.code = code;return this;}, json(data){return {code:this.code,data};} };
  return handler({ method, body, headers:{} }, res);
};
test("需要登入，只接受委託號，驗證先於連外", async () => {
  let calls = 0;
  const h = createHandler({ verifyUser: async()=>({uid:'member'}), checkWebsite: async()=>{calls++;return {status:'live'};} });
  assert.equal((await call(h, {listingNo:id})).code, 200);
  assert.equal((await call(h, {listingNo:'https://evil.test'})).code, 400);
  assert.equal((await call(h, {listingNo:id}, 'GET')).code, 405);
  const unauthorized = createHandler({verifyUser: async()=>{throw Error('no');}, checkWebsite:async()=>{calls++;}});
  assert.equal((await call(unauthorized, {listingNo:id})).code, 401);
  assert.equal(calls, 1);
});
