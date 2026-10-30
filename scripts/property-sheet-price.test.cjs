const test = require('node:test');
const assert = require('node:assert/strict');
const { unlabeledPriceCandidates, gridRect, bitmap } = require('./property-sheet-price.cjs');
const line = (text,x,top,width=.15,height=.02) => ({text,x,y:1-top-height,width,height,confidence:1});
const amount = line('1150',.13,.17,.20,.04);
const context = [line('台灣房屋物件銷售資料表',.15,.02,.7,.04),amount,
  line('專任約',.45,.16,.23,.05),line('所有權登記日：',.71,.15),line('主建物：16.855坪',.17,.24,.25)];
const map = {width:1000,height:1200,red:()=>true,dark:()=>false};

test('standard top-down RGBA bitfields are decoded and unsupported masks are refused',()=>{
  const bytes=Buffer.alloc(138+8);bytes.write('BM');bytes.writeUInt32LE(138,10);
  bytes.writeUInt32LE(124,14);bytes.writeInt32LE(2,18);bytes.writeInt32LE(-1,22);
  bytes.writeUInt16LE(32,28);bytes.writeUInt32LE(3,30);
  bytes.writeUInt32LE(0xff0000,54);bytes.writeUInt32LE(0xff00,58);bytes.writeUInt32LE(0xff,62);
  bytes.set([20,20,200,255,0,0,0,255],138);
  const decoded=bitmap(bytes);assert.equal(decoded.red(0,0),true);assert.equal(decoded.dark(1,0),true);
  bytes.writeUInt32LE(0xff,54);assert.equal(bitmap(bytes),null);
  assert.equal(bitmap(Buffer.from('BM')),null);
});

test('old company form can recover red sale digits when OCR misses vertical label and currency',()=>{
  const candidates=unlabeledPriceCandidates(map,context);
  assert.equal(candidates.length,1);assert.equal(candidates[0].oldPrice,1150);
});
test('a blank middle price-row cell is allowed only with an aligned currency and company-form anchors',()=>{
  const noExclusive=context.filter(l=>l.text!=='專任約');
  const currency=line('萬',.34,.19,.025,.02);
  const recovered=unlabeledPriceCandidates(map,[...noExclusive,currency]);
  assert.equal(recovered.length,1);assert.equal(recovered[0].currency.text,'萬');
  assert.equal(unlabeledPriceCandidates(map,[...noExclusive,{...currency,text:'萭'}])[0].currency.text,'萭');
  assert.equal(unlabeledPriceCandidates(map,noExclusive).length,0);
  assert.equal(unlabeledPriceCandidates(map,[...noExclusive,line('萬',.7,.19)]).length,0);
});
test('the company header can be split across two OCR observations on the same line',()=>{
  const lines=[line('台灣房屋',.12,.02,.25,.04),line('物件銷售資料表',.5,.02,.4,.04),...context.slice(1)];
  assert.equal(unlabeledPriceCandidates(map,lines).length,1);
  assert.equal(unlabeledPriceCandidates(map,[lines[0],{...lines[1],y:.3},...lines.slice(2)]).length,0);
});
test('currency may be part of the red amount and the building label may be split',()=>{
  const lines=context.filter(l=>l!==amount&&l.text!=='專任約'&&!l.text.startsWith('主建物'));
  lines.push(line('1958萬元',.13,.17,.23,.04),line('◎主',.13,.24,.03),line('建：24.02坪',.17,.24,.2));
  assert.equal(unlabeledPriceCandidates(map,lines)[0].oldPrice,1958);
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
  const lowerNote={...line('建坪 30 坪',.14,.22,.25,.01),top:.22,bottom:.23};
  const tighter=gridRect(grid,{...candidate,items:[...candidate.items,lowerNote]});
  assert.ok(tighter); assert.ok(tighter.y+tighter.height <= lowerNote.top);
});
