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


const listingHtml = fields => `<script>window.__NUXT__=(function(){return ${JSON.stringify({pinia:{"rent-detail-info":{ctx:{id:22258856,status:"open",title:"測試兩房",endTime:"2026-12-01",...fields}}}}).replaceAll("<", "\\u003c")};}());</script>`;
test("manual imports read exact-listing facts, explicit fees and active equipment without exposing source accounts", () => {
  const result = inspectRentalHtml(listingHtml({
    breadcrumb:[{query:"region",name:"桃園市"},{query:"section",name:"龜山區"},{query:"kind",name:"整層住家"}],
    title:"A7測試兩房",price:"29,000",deposit:"二個月",positionRound:{communityName:"示範社區",address:"龜山區牛角坡路123號6樓"},
    info:[{key:"layout",value:"2房2廳2衛"},{key:"area",name:"使用坪數",value:"20坪"},{key:"floor",value:"6F/15F"}],
    infoData:{data:[{key:"carInfo",value:"平面式"}]},rent_calculation_data:{manage_fee:0,manage_fee_text:"無數據",price_has_carport:true},
    service:{facility:[{key:"cold",name:"冷氣",active:1},{key:"fridge",name:"冰箱",active:0}],descData:[{label:"養寵物",value:"可養寵物"},{label:"開伙",value:"可開伙"}]},
    publish:{name:"網站刊登人",phone:"private"},remark:{content:"<h3>房屋介紹</h3><p>採光好</p><script>danger()</script>"}
  }),url,200,{includeListing:true});
  assert.equal(result.listing.rent,29000);assert.equal(result.listing.deposit,2);assert.equal(result.listing.rooms,2);
  assert.equal(result.listing.floor,"6/15");assert.equal(result.listing.street,"牛角坡路");assert.equal(result.listing.doorAddress,"桃園市龜山區牛角坡路123號6樓");
  assert.equal(result.listing.parking,"平面車位");assert.equal(result.listing.parkMode,"已含租金");assert.equal(result.listing.mgmtMode,undefined);
  assert.deepEqual(result.listing.furniture,["冷氣"]);assert.equal(result.listing.agentName,undefined);assert.equal(result.listing.publish,undefined);
  assert.ok(!result.listing.description.includes("danger"));assert.ok(result.listing.description.includes("房屋介紹\n採光好"));
});
test("street-only addresses, unknown fees, inactive parking and missing room counts stay unfilled", () => {
  const result=inspectRentalHtml(listingHtml({positionRound:{address:"龜山區牛角坡路"},breadcrumb:[{query:"section",name:"龜山區"}],deposit:"面議",rent_calculation_data:{manage_fee:0,manage_fee_text:"無數據"},service:{facility:[{key:"park",name:"平面車位",active:0}]}}),url,200,{includeListing:true});
  assert.equal(result.listing.street,"牛角坡路"); for(const key of ["doorAddress","deposit","parking","mgmtMode","rooms","rent"])assert.equal(result.listing[key],undefined);
  assert.equal(inspectRentalHtml(listingHtml({status:"close"}),url,200,{includeListing:true}).listing,undefined);
  assert.equal(inspectRentalHtml(listingHtml({id:12345678}),url,200,{includeListing:true}).listing,undefined);
});
test("listing data is opt-in so daily website checks remain small", async () => {
  assert.equal(inspectRentalHtml(listingHtml({price:"29,000"}),url).listing,undefined);
  const withListing=await checkRentalWebsite(url,{includeListing:true,fetcher:async()=>new Response(listingHtml({price:"29,000"}))});
  assert.equal(withListing.listing.rent,29000);
  const options=[];const handler=createHandler({verifyUser:async()=>({uid:"staff"}),checkWebsite:async(value,opts)=>{options.push(opts);return{url:value,status:"live"}}});
  await handler({method:"POST",headers:{},body:{url,includeListing:true}},response());
  await handler({method:"POST",headers:{},body:{url,includeListing:"true"}},response());
  assert.deepEqual(options,[{includeListing:true},{includeListing:false}]);
});
