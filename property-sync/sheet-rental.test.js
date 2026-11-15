const {test}=require('node:test');const assert=require('node:assert/strict');
const {extractRentalFields,readRent,readLease,rentalPatch,identityMatches,latestSheet}=require('./sheet-rental');const {safeSheetUrl}=require('./rental-backfill');
const line=(text,x=.4,y=.45,confidence=1)=>({text,x,y,width:.25,height:.018,confidence});
test('reads explicit monthly yuan/wan and fee notes; refuses room ranges, a particular floor and yearly values',()=>{
  assert.deepEqual(readRent('4.5萬元/月（未含管）'),{monthlyRent:45000,rentFeeNote:'未含管理費'});
  assert.deepEqual(readRent('46649 含稅含管'),{monthlyRent:46649,rentFeeNote:'含稅、含管理費'});
  for(const raw of ['6000-7000元/月','5F，7000/月','7000元/間','每間7000','5000+3000','12萬元/年'])assert.ok(readRent(raw).issue,raw);
  for(const raw of ['', '元/月','X','無'])assert.deepEqual(readRent(raw),{});
});
test('parses ROC/Gregorian ranges and explicit expiry only; never invents days from months or open-ended terms',()=>{
  assert.deepEqual(readLease('114/09/20-115/11/01'),{leaseStartDate:'2025-09-20',leaseEndDate:'2026-11-01'});
  assert.deepEqual(readLease('至118/10/22'),{leaseEndDate:'2029-10-22'});
  for(const raw of ['不定期租約','115/12','至116/02/--','一年(至116.5月)','116年3月30日'])assert.deepEqual(readLease(raw),{leaseTermNote:raw});
  assert.ok(readLease('115/2/30-117/1/1').issue);assert.ok(readLease('117/1/1-115/1/1').issue);
});
test('geometry joins only the same row, stops before lease, and excludes low-confidence numbers',()=>{
  assert.deepEqual(extractRentalFields([line('租金：',.4),line('30000元/月',.5),line('租期：至118/10/22',.7)]).proposed,{monthlyRent:30000,leaseEndDate:'2029-10-22'});
  const blank=extractRentalFields([line('租金：元/月',.4),line('租期：',.7),line('電話：033288283',.5,.8)]);assert.deepEqual(blank.proposed,{});
  const low=extractRentalFields([line('租金：',.4),line('30000元/月',.5,.45,.3),line('租期：至118/10/22',.7)]);assert.equal(low.proposed.monthlyRent,undefined);assert.equal(low.proposed.leaseEndDate,'2029-10-22');
});
test('does not mistake a title for rent, and can read explicitly monthly occupancy text',()=>{
  const value=extractRentalFields([line('案名：林口收租金雞母（專）',.1,.85),line('自住/空屋：出租73200/月')]);assert.deepEqual(value.proposed,{monthlyRent:73200});
  const mixed=extractRentalFields([line('租期：115/1/1~115/12/31租金13000')]);assert.deepEqual(mixed.proposed,{monthlyRent:13000,leaseStartDate:'2026-01-01',leaseEndDate:'2026-12-31'});
});
test('different figures and per-room notes require review instead of choosing a convenient number',()=>{
  const value=extractRentalFields([line('租金30000元/月'),line('租金33000元/月',.4,.3)]);assert.equal(value.proposed.monthlyRent,undefined);assert.ok(value.issues.length);
  const room=extractRentalFields([line('租金6000-7000元/月'),line('租金6000元/月',.4,.3)]);assert.equal(room.proposed.monthlyRent,undefined);
});
test('patches only missing fields and preserves manual prices, fees and lease semantics',()=>{
  assert.deepEqual(rentalPatch({monthlyRent:32000},{proposed:{monthlyRent:30000,rentFeeNote:'含管',leaseEndDate:'2027-01-01'}}),{patch:{leaseEndDate:'2027-01-01'},conflicts:['monthlyRent']});
  assert.deepEqual(rentalPatch({monthlyRent:30000},{proposed:{monthlyRent:30000,rentFeeNote:'含管'}}).patch,{rentFeeNote:'含管'});
  assert.equal(rentalPatch({leaseStartDate:'2030-01-01'},{proposed:{leaseEndDate:'2027-01-01'}}).patch.leaseEndDate,undefined);
  assert.equal(rentalPatch({leaseTermNote:'不定期租約'},{proposed:{leaseEndDate:'2027-01-01'}}).patch.leaseEndDate,undefined);
});
test('requires a unique code or exact title and full floor address; wrong cases/floors do not match',()=>{
  const p={id:'a',listingNo:'D502504619',title:'長庚中心商業區金店面',address:'桃園市龜山區文化二路34號三樓'};
  assert.equal(identityMatches([line('契約編號：2504619')],p,[p]),true);
  const doc=[line('案名：長庚中心商業區金店面'),line('地址：桃園市龜山區文化二路34號3樓')];assert.equal(identityMatches(doc,p,[p]),true);
  assert.equal(identityMatches(doc,{...p,address:'桃園市龜山區文化二路34號四樓'},[{...p,address:'桃園市龜山區文化二路34號四樓'}]),false);
  assert.equal(identityMatches([line('編號：2504618')],p,[p]),false);
});
test('chooses latest dated attachment rather than an older file appended later',()=>{
  assert.equal(latestSheet({sheetFiles:[{name:'LINE_261110_1.jpg',url:'new'},{name:'LINE_260822_1.jpg',url:'old'}]}).url,'new');
  assert.equal(latestSheet({sheetFiles:[{name:'IMG.jpg',url:'a',uploadedAt:'2026-10-01'},{name:'IMG.jpg',url:'b',uploadedAt:'2026-11-01'}]}).url,'b');
});
test('cloud reads stay within this property and CRM bucket',()=>{
 const root='https://firebasestorage.googleapis.com/v0/b/leshan-crm.firebasestorage.app/o/';
 assert.equal(safeSheetUrl(root+encodeURIComponent('properties/a/sheets/x.jpg')+'?alt=media&token=example','a'),true);
 for(const url of [root+encodeURIComponent('properties/b/sheets/x.jpg'),root+encodeURIComponent('properties/a/floorplans/x.jpg'),'http://127.0.0.1:8877','https://example.com/a.jpg'])assert.equal(safeSheetUrl(url,'a'),false);
});
test('reads an expiry printed just below its narrow label, without borrowing dates from another column',()=>{
  const value=extractRentalFields([line('租期：',.72,.44),line('-115/9/22',.72,.42),line('114/1/1',.1,.42)]);
  assert.equal(value.proposed.leaseEndDate,'2026-09-22');
});
