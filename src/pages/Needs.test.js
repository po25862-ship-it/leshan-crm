import React, {act} from 'react';
import {createRoot} from 'react-dom/client';
import {MemoryRouter} from 'react-router-dom';
import {Simulate} from 'react-dom/test-utils';
import Needs from './Needs';
global.IS_REACT_ACT_ENVIRONMENT=true;
const mockUid='owner';const mockAdd=jest.fn(async()=>({id:'new'}));const mockRefresh=jest.fn(async()=>[]);
const mockNeeds=[{id:'own',title:'我的私人名稱',contactName:'私人姓名',ownerUid:'owner',statusTag:'正在找',budgetMax:1800,areas:[{city:'桃園市',district:'龜山區',community:'A7'}],recommendedProperties:[]},{id:'shared',title:'林口兩房需求',ownerUid:'other',shared:true,statusTag:'正在找',areas:[{city:'新北市',district:'林口區'}],recommendedProperties:[]}];
jest.mock('../AuthContext',()=>({useAuth:()=>({user:{uid:mockUid}})}));
jest.mock('../hooks/useNeedsCollection',()=>({useNeedsCollection:()=>({items:mockNeeds,add:mockAdd,update:jest.fn(),remove:jest.fn(),refresh:mockRefresh,loadedAt:1,loading:false})}));
jest.mock('../hooks/useSharedCollection',()=>({useSharedCollection:()=>({items:[]})}));
jest.mock('../hooks/useCollection',()=>({useCollection:()=>({items:[{id:'owner',name:'業務甲'},{id:'other',name:'業務乙'}]})}));
jest.mock('../hooks/useIsMobile',()=>({useIsMobile:()=>true}));
jest.mock('./RecommendedProperties',()=>()=>null);
let root,host;const button=text=>[...host.querySelectorAll('button')].find(b=>b.textContent.trim()===text);
beforeEach(()=>{jest.clearAllMocks();host=document.createElement('div');document.body.appendChild(host);root=createRoot(host);act(()=>root.render(<MemoryRouter future={{v7_startTransition:true,v7_relativeSplatPath:true}}><Needs/></MemoryRouter>));});
afterEach(()=>{act(()=>root.unmount());host.remove();});
test('mine/shared/search filters show the right count and responsible colleague',()=>{
 expect(host.textContent).toContain('客需（2）');act(()=>button('我的').click());expect(host.textContent).toContain('客需（1）');expect(host.querySelector('.board').textContent).not.toContain('林口兩房需求');
 act(()=>button('同事共享').click());expect(host.querySelector('.board').textContent).toContain('業務乙');expect(host.querySelector('.board').textContent).not.toContain('私人姓名');
 const search=host.querySelector('input[placeholder^="搜尋代稱"]');act(()=>Simulate.change(search,{target:{value:'A7'}}));expect(host.textContent).toContain('客需（0）');
});
test('common conditions open first, private fields and detailed criteria stay folded, and sharing defaults off',()=>{
 act(()=>button('＋ 新增客需').click());expect(host.querySelector('.needs-form-actions')).toBeTruthy();expect(host.textContent).not.toContain('私人備註（僅本人及主要負責人可見）');
 const share=[...host.querySelectorAll('label')].find(l=>l.textContent.includes('分享找房條件給所有已登入同事')).querySelector('input');expect(share.checked).toBe(false);
 act(()=>button('更多條件／私人備註').click());expect(host.textContent).toContain('私人備註（僅本人及主要負責人可見）');expect(host.textContent).toContain('必要條件');
});
test('saving without a private name creates a useful public alias and leaves the shared switch off',async()=>{
 act(()=>button('＋ 新增客需').click());const max=host.querySelector('[aria-label="總價（萬）最高"]');act(()=>Simulate.change(max,{target:{value:'1800'}}));
 await act(async()=>Simulate.submit(host.querySelector('form')));
 expect(mockAdd).toHaveBeenCalledWith(expect.objectContaining({title:'找房需求',budgetMax:'1800',ownerUid:'owner',shared:false}));expect(host.textContent).toContain('客需已儲存');
});
