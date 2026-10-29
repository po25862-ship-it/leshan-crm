const test = require('node:test');
const assert = require('node:assert/strict');
const { referenceQuery } = require('../api/_lib/market-reference');
const handler = require('../api/market/reference');
const response = () => ({ code: 200, headers: {}, setHeader(k,v) { this.headers[k]=v; }, status(n) { this.code=n; return this; }, json(data) { this.body=data; return this; } });
const request = { method:'POST', headers:{authorization:'Bearer fixture'}, body:{communityName:'花園'} };
test('the API rejects anonymous and malformed identities before reading the cloud snapshot', async () => {
  const anonymous=response();
  await handler({method:'POST',headers:{},body:{}},anonymous);
  assert.equal(anonymous.code,401);
  const wrongMethod=response();
  await handler({method:'GET',headers:{}},wrongMethod);
  assert.equal(wrongMethod.code,405);
});
test('reference queries whitelist fields and never forward contacts or arbitrary destinations', () => {
  assert.deepEqual(referenceQuery({address:' 桃園市龜山區文青路222號 ',ownerName:'private',url:'file:///'}),{address:'桃園市龜山區文青路222號',communityName:'',district:''});
  assert.equal(referenceQuery({address:['bad']}),null);
  assert.equal(referenceQuery({}),null);
});
test('a warm cloud snapshot never bypasses per-request verification or revocation checks', async () => {
  let verified=0,reads=0,revoked=false;
  const api=handler.createHandler({verifyUser:async()=>{verified++;if(revoked)throw Error('revoked');return {uid:'fixture'};},readReference:async()=>{reads++;return {community:{name:'花園'},deals:[],sourceMode:'cloud-snapshot'};}});
  const first=response(); await api(request,first);
  assert.equal(first.code,200); assert.equal(first.body.sourceMode,'cloud-snapshot');
  assert.equal(first.headers['Cache-Control'],'private, no-store');
  revoked=true;
  const second=response(); await api(request,second);
  assert.equal(second.code,401);assert.equal(verified,2);assert.equal(reads,1);
});
test('authenticated requests validate their size and shape before accessing data', async () => {
  const api=handler.createHandler({verifyUser:async()=>({uid:'fixture'}),readReference:async()=>{throw Error('must not read');}});
  const malformed=response();await api({...request,body:{address:['bad']}},malformed);assert.equal(malformed.code,400);
  const large=response();await api({...request,headers:{'content-length':'5000'}},large);assert.equal(large.code,413);
});
test('unavailable cloud data fails closed without asking users to run the local source', async () => {
  const api=handler.createHandler({verifyUser:async()=>({uid:'fixture'}),readReference:async()=>{throw Error('bad snapshot');}});
  const res=response();await api(request,res);
  assert.equal(res.code,503);assert.match(res.body.message,/雲端/);assert.doesNotMatch(res.body.message,/Mac|本機/);
});
