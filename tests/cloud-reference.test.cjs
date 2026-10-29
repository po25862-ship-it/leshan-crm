const test = require('node:test');
const assert = require('node:assert/strict');
const { randomBytes, createCipheriv } = require('node:crypto');
const { gzipSync } = require('node:zlib');
const { decryptSnapshot, lookupSnapshot, addressParts } = require('../api/_lib/cloud-reference');
const regions = { cities: [['桃園市','桃園市'], ['新北市','新北市']], districts: [['龜山區','龜山區','桃園市'], ['林口區','林口區','新北市']], oldCities: { 桃園縣: '桃園市' } };
const snapshot = { schema: 1, snapshotAt: 1000, version: 'fixture', regions,
  doors: { '龜山區|文化2路38之3號': 'a', '龜山區|文青路222號': 'a' },
  uniqueDoors: { '文青路222號': 'a' }, names: { '花園': ['a'], '同名社區': ['a','b'] },
  communities: { a: { community: { id: 'a', name: '花園', zone: 'A7' }, district: '龜山區', years: [2026,2025], deals: [{ id: 'official' }] }, b: { community: { id: 'b', name: '同名社區', zone: 'A9' }, district: '林口區', years: [], deals: [] } }
};
function encrypt(data, key) {
  const iv = randomBytes(12), cipher = createCipheriv('aes-256-gcm', key, iv);
  const content = Buffer.concat([cipher.update(gzipSync(JSON.stringify(data))), cipher.final()]);
  return { schema: 1, iv: iv.toString('base64'), tag: cipher.getAuthTag().toString('base64'), data: content.toString('base64') };
}
test('cloud data decrypts only with the server key and rejects tampering or incomplete snapshots', () => {
  const key = randomBytes(32), envelope = encrypt(snapshot,key);
  assert.deepEqual(decryptSnapshot(envelope,key.toString('base64url')),snapshot);
  assert.ok(!JSON.stringify(envelope).includes('花園'));
  assert.throws(() => decryptSnapshot(envelope,randomBytes(32).toString('base64url')));
  assert.throws(() => decryptSnapshot({...envelope,tag:randomBytes(16).toString('base64')},key.toString('base64url')));
  assert.throws(() => decryptSnapshot(encrypt({...snapshot,uniqueDoors:null},key),key.toString('base64url')));
  assert.throws(() => decryptSnapshot(envelope,''));
});
test('full-width, old districts and Chinese road numerals match exact doorplates without a Mac request', () => {
  for (const address of ['桃園市龜山區文化二路３８之３號八樓', '桃園縣龜山鄉文化二路38-3號八樓', '333桃園市龜山區文化二路38號之3']) {
    const data = lookupSnapshot({address},snapshot,2000);
    assert.equal(data.community.id,'a');
    assert.equal(data.matchMethod,'exact-doorplate');
    assert.equal(data.sourceMode,'cloud-snapshot');
    assert.equal(data.snapshotAt,1000);
    assert.equal(data.fetchedAt,2000);
  }
  assert.equal(lookupSnapshot({address:'文青路222號三樓'},snapshot).community.id,'a');
  assert.equal(lookupSnapshot({address:'桃園市龜山區文青路223號'},snapshot).community,null);
  assert.equal(lookupSnapshot({address:'新北市林口區文青路222號'},snapshot).community,null);
  assert.equal(addressParts('龜山區文化二路38號之10 8樓',regions).base,'文化2路38之10號');
});
test('community aliases require a unique match or the specified district', () => {
  assert.equal(lookupSnapshot({communityName:'花園'},snapshot).matchMethod,'exact-community-name');
  assert.equal(lookupSnapshot({communityName:'同名社區'},snapshot).reason,'ambiguous_community');
  assert.equal(lookupSnapshot({communityName:'同名社區',district:'林口區'},snapshot).community.id,'b');
});
