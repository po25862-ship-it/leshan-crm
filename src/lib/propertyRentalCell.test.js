import { detectBlankRentalCell } from './propertyRentalCell';
function sheet({occupied = false, redPrice = true} = {}) {
  const width=400,height=566,data=new Uint8ClampedArray(width*height*4);data.fill(255);
  const rect=(x,y,w,h,color)=>{for(let r=y;r<y+h;r++)for(let c=x;c<x+w;c++)data.set([...color,255],(r*width+c)*4);};
  [70,90,130].forEach(y=>rect(18,y,374,2,[20,20,20]));
  [20,48,180,290,390].forEach(x=>rect(x,90,2,42,[20,20,20]));
  if(redPrice)rect(65,99,70,15,[200,30,40]);
  if(occupied)rect(200,100,50,12,[30,30,30]);
  return {width,height,data};
}
test('detects only the empty cell beside a red quote and refuses occupied or uncertain layouts',()=>{
  const r=detectBlankRentalCell(sheet());expect(r).toMatchObject({x:expect.any(Number),y:expect.any(Number)});expect(r.x).toBeGreaterThan(.45);expect(r.width).toBeGreaterThan(.2);
  expect(detectBlankRentalCell(sheet({occupied:true}))).toBeNull();expect(detectBlankRentalCell(sheet({redPrice:false}))).toBeNull();
  expect(detectBlankRentalCell({width:400,height:200,data:new Uint8ClampedArray(400*200*4)})).toBeNull();
});
