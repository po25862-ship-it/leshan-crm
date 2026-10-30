const test = require('node:test');
const assert = require('node:assert/strict');
const { unlabeledPriceCandidates, gridRect } = require('./property-sheet-price.cjs');
const line = (text,x,top,width=.15,height=.02) => ({text,x,y:1-top-height,width,height,confidence:1});
const amount = line('1150',.13,.17,.20,.04);
const context = [line('台灣房屋物件銷售資料表',.15,.02,.7,.04),amount,
  line('專任約',.45,.16,.23,.05),line('所有權登記日：',.71,.15),line('主建物：16.855坪',.17,.24,.25)];
const map = {width:1000,height:1200,red:()=>true,dark:()=>false};

test('old company form can recover red sale digits when OCR misses vertical label and currency',()=>{
  const candidates=unlabeledPriceCandidates(map,context);
  assert.equal(candidates.length,1);assert.equal(candidates[0].oldPrice,1150);
});
test('plain numbers cannot become a sale price without all surrounding company-form anchors',()=>{
  for(const required of ['台灣房屋','專任約','所有權登記日','主建物'])
    assert.equal(unlabeledPriceCandidates(map,context.filter(l=>!l.text.includes(required))).length,0);
  assert.equal(unlabeledPriceCandidates(map,[line('貸款',.06,.17),amount]).length,0);
});
test('black amounts, small text, right-hand amounts and multiple red amounts stay conservative',()=>{
  assert.equal(unlabeledPriceCandidates({...map,red:()=>false,dark:()=>true},context).length,0);
  for(const changed of [line('1150',.13,.17,.20,.015),line('1150',.7,.17,.20,.04),line('1150',.13,.5,.2,.04)])
    assert.equal(unlabeledPriceCandidates(map,context.map(l=>l===amount?changed:l)).length,0);
  assert.equal(unlabeledPriceCandidates(map,[...context,line('1050',.14,.17,.19,.04)]).length,2);
});
test('recovered amounts still require a bounded table cell and refuse to cover other information',()=>{
  const candidate=unlabeledPriceCandidates(map,context)[0];
  const grid={...map,dark:(x,y)=>((Math.abs(y-184)<2||Math.abs(y-280)<2)&&x>=120&&x<=440)||((Math.abs(x-120)<2||Math.abs(x-440)<2)&&y>=184&&y<=280)};
  assert.ok(gridRect(grid,candidate));
  assert.equal(gridRect(grid,{...candidate,items:[...candidate.items,{...line('其他資料',.32,.20,.1),top:.20,bottom:.22}]}),null);
  assert.equal(gridRect(map,candidate),null);
});
