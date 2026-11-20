const test=require('node:test'),assert=require('node:assert/strict');
const {reviewedMatch,reviewStillMatches}=require('./sheet-reviewed');
const hash='a'.repeat(64),property={id:'case-a',listingNo:'DE02501234',address:'桃園市龜山區測試路１２號三樓',title:'原圖確認的案件'};
const entry={sourceHash:hash,approved:true,method:'original-image-review',reviewedAt:'2026-11-20T01:00:00Z',propertyId:property.id,listingNo:property.listingNo,address:property.address};
test('an original-image review binds exact photo bytes to an existing case',()=>{
 const result=reviewedMatch(hash,{[hash]:entry},[property]);assert.equal(result.status,'matched');assert.equal(result.propertyId,property.id);
 assert.equal(reviewedMatch('b'.repeat(64),{[hash]:entry},[property]),null);
 assert.equal(reviewStillMatches({...property,address:'桃園市龜山區測試路12號三樓'},entry),true);
});
test('changed door/floor, listing number, deleted case or unapproved pin cannot fall back to a risky automatic match',()=>{
 for(const p of [{...property,address:'桃園市龜山區測試路１２號四樓'},{...property,listingNo:'DE02509999'},null]){
  const result=reviewedMatch(hash,{[hash]:entry},p?[p]:[]);assert.equal(result.status,'review');assert.equal(result.reviewConflict,true);
 }
 for(const change of [{approved:false},{sourceHash:'b'.repeat(64)},{method:'auto-score'},{reviewedAt:'invalid'}])assert.equal(reviewedMatch(hash,{[hash]:{...entry,...change}},[property]).status,'review');
});
