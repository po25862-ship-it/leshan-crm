import React,{act,useState} from 'react';
import {createRoot} from 'react-dom/client';
import {Simulate} from 'react-dom/test-utils';
import PropertySelectionOrder from './PropertySelectionOrder';

const properties=[{id:'a',title:'文化兩房'},{id:'b',title:'長庚三房'},{id:'c',title:'林口公寓'}];
let root,container,onChange;
function Harness({disabled=false}){
  const [items,setItems]=useState(properties);
  return <PropertySelectionOrder properties={items} disabled={disabled} show onChange={ids=>{onChange(ids);setItems(ids.map(id=>properties.find(p=>p.id===id)));}}/>;
}
const button=label=>container.querySelector(`[aria-label="${label}"]`);
const titles=()=>[...container.querySelectorAll('li .property-order-copy>strong')].map(el=>el.textContent);
beforeEach(()=>{
  global.IS_REACT_ACT_ENVIRONMENT=true;onChange=jest.fn();
  container=document.createElement('div');document.body.append(container);root=createRoot(container);
  act(()=>root.render(<Harness/>));
});
afterEach(()=>{act(()=>root.unmount());container.remove();});
test('arrow controls reorder the shared selection and keep valid boundaries',()=>{
  expect(button('上移 文化兩房').disabled).toBe(true);
  expect(button('下移 林口公寓').disabled).toBe(true);
  act(()=>button('上移 林口公寓').click());
  expect(onChange).toHaveBeenLastCalledWith(['a','c','b']);
  expect(titles()).toEqual(['文化兩房','林口公寓','長庚三房']);
  act(()=>button('下移 文化兩房').click());
  expect(onChange).toHaveBeenLastCalledWith(['c','a','b']);
  expect(container.querySelector('[role="status"]').textContent).toContain('地圖與 PDF');
});
function gesture(cancel=false){
  [...container.querySelectorAll('li')].forEach((li,index)=>{li.getBoundingClientRect=()=>({top:index*70,height:60});});
  const handle=button('拖曳調整 文化兩房 的順序');
  handle.setPointerCapture=jest.fn();handle.hasPointerCapture=()=>true;handle.releasePointerCapture=jest.fn();
  act(()=>Simulate.pointerDown(handle,{button:0,pointerId:7,clientY:30}));
  act(()=>Simulate.pointerMove(handle,{pointerId:7,clientY:180,preventDefault:jest.fn()}));
  expect(onChange).not.toHaveBeenCalled();
  expect(titles()).toEqual(['長庚三房','林口公寓','文化兩房']);
  act(()=>Simulate[cancel?'pointerCancel':'pointerUp'](handle,{pointerId:7}));
}
test('pointer drag previews locally and commits exactly once on release',()=>{
  gesture();expect(onChange).toHaveBeenCalledTimes(1);expect(onChange).toHaveBeenCalledWith(['b','c','a']);
  expect(titles()).toEqual(['長庚三房','林口公寓','文化兩房']);
});
test('cancelled drags restore the original order without changing sharing or PDFs',()=>{
  gesture(true);expect(onChange).not.toHaveBeenCalled();expect(titles()).toEqual(properties.map(p=>p.title));
});
test('generation locks reordering until the PDF is ready',()=>{
  act(()=>root.render(<Harness disabled/>));
  expect([...container.querySelectorAll('button')].every(el=>el.disabled)).toBe(true);
  expect(container.textContent).toContain('正在製作資料表');
  act(()=>root.render(<Harness/>));expect(button('下移 文化兩房').disabled).toBe(false);
});
