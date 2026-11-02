import React, { act } from 'react';
import {createRoot} from 'react-dom/client';
import RecommendedProperties from './RecommendedProperties';
global.IS_REACT_ACT_ENVIRONMENT=true;
let mockLoading=false,mockError=null;
const mockProperties=[{id:'p1',title:'測試物件',status:'active',totalPrice:1000,mainBuildingPing:16,titlePing:30}];
jest.mock('../hooks/useCollection',()=>({useCollection:()=>({items:mockLoading?[]:mockProperties,loading:mockLoading,error:mockError,refresh:jest.fn()})}));
jest.mock('./PropertyShare',()=>({properties})=><div data-testid="share">{properties.map(p=>p.title).join(',')}</div>);
let host,root;const button=text=>[...host.querySelectorAll('button')].find(b=>b.textContent.trim()===text);
beforeEach(()=>{mockLoading=false;mockError=null;host=document.createElement('div');document.body.appendChild(host);root=createRoot(host);});
afterEach(()=>{act(()=>root.unmount());host.remove();});
const mount=(need,value)=>act(()=>root.render(<RecommendedProperties need={need} value={value} onChange={jest.fn()}/>));
test('switching needs resets previous selections, picker and share view',()=>{
 mount({id:'a',budgetMax:1500},[{propertyId:'p1'}]);
 act(()=>button('勾選傳送').click());act(()=>host.querySelector('input[type="checkbox"]').click());
 expect(host.textContent).toContain('已選 1 筆');act(()=>button('分享給客人').click());expect(host.querySelector('[data-testid="share"]')).toBeTruthy();
 mount({id:'b',budgetMax:900},[]);expect(host.textContent).not.toContain('已選 1 筆');expect(host.querySelector('[data-testid="share"]')).toBeNull();
});
test('pending reads do not claim referenced properties are missing',()=>{
 mockLoading=true;mount({id:'a'},[{propertyId:'p1'}]);expect(host.textContent).toContain('物件資料載入中…');expect(host.textContent).not.toContain('目前清單找不到此物件');
});
test('read failures offer retry instead of suggesting deletion',()=>{
 mockError=Error('network');mount({id:'a'},[{propertyId:'absent'}]);expect(host.textContent).toContain('物件暫時無法讀取，請重試。');expect(host.textContent).not.toContain('目前清單找不到此物件');
});
