import React,{act} from 'react';
import {createRoot} from 'react-dom/client';
import {Simulate} from 'react-dom/test-utils';
import {MemoryRouter,Routes,Route} from 'react-router-dom';
import MarketCases from './MarketCases';
import {useAuth} from '../AuthContext';
import {marketRequest,marketBlob,MARKET_PUBLISHER_UID} from '../lib/marketCases';
jest.mock('../lib/useMarketDrive',()=>({useMarketDrive:()=>({isConnected:false,gsiReady:true,connect:jest.fn()})}));
jest.mock('../AuthContext',()=>({useAuth:jest.fn()}));
jest.mock('../firebase',()=>({auth:{currentUser:{uid:'staff'}}}));
jest.mock('../lib/marketCases',()=>({...jest.requireActual('../lib/marketCases'),marketRequest:jest.fn(),marketBlob:jest.fn()}));
jest.mock('../lib/outreachCaseRepository',()=>({listOutreachCases:jest.fn(),saveIntegratedCase:jest.fn()}));
jest.mock('../lib/outreachRepository',()=>({listOutreach:jest.fn()}));
let el,root;
const data={id:'a'.repeat(64),title:'示範三房車',publisherUid:MARKET_PUBLISHER_UID,publisherName:'分享人',assigneeUid:'',photos:[],details:{propertyAddress:'桃園市龜山區華亞三路13號6樓',price:1800,totalArea:49.46},sourceUpdatedAt:3,status:'追蹤中',revision:1,owners:[],activities:[],priceHistory:[],canReadOwners:false};
beforeEach(()=>{global.IS_REACT_ACT_ENVIRONMENT=true;el=document.createElement('div');document.body.append(el);root=createRoot(el);useAuth.mockReturnValue({user:{uid:'staff'}});marketRequest.mockImplementation(async(action)=>action==='list'?{cases:[data],nextCursor:null}:data);marketBlob.mockResolvedValue(new Blob());});
afterEach(async()=>{await act(async()=>root.unmount());el.remove();jest.clearAllMocks();});
const render=async(path='/market-cases')=>act(async()=>root.render(<MemoryRouter initialEntries={[path]} future={{v7_startTransition:true,v7_relativeSplatPath:true}}><Routes><Route path="/market-cases" element={<MarketCases/>}/></Routes></MemoryRouter>));
const button=t=>[...el.querySelectorAll('button')].find(b=>b.textContent===t);
test('reads once, no repeated polling; list shows actual filtered count',async()=>{await render();expect(marketRequest).toHaveBeenCalledTimes(1);expect(el.textContent).toContain('示範三房車');const q=el.querySelector('input[type="search"]')||el.querySelector('.mc-filters input');await act(async()=>Simulate.change(q,{target:{value:'找不到'}}));expect(el.querySelectorAll('.mc-card')).toHaveLength(0);expect(marketRequest).toHaveBeenCalledTimes(1);});
test('detail opens and permits claim, but hides owner data before assignment',async()=>{await render('/market-cases?case='+data.id);expect(button('接手追蹤')).toBeTruthy();await act(async()=>button('屋主／電傳').click());expect(el.textContent).toContain('只提供分享人與目前承辦同仁');expect(button('加入我的開發信')).toBeUndefined();marketRequest.mockImplementation(async(action)=>action==='update'?{id:data.id}:{...data,assigneeUid:'staff',canReadOwners:true,revision:2});await act(async()=>button('接手追蹤').click());expect(marketRequest).toHaveBeenCalledWith('update',expect.objectContaining({op:'claim',expectedRevision:1}),'POST');});
test('publisher must choose colleague and confirm selection; owners and deed default private',async()=>{
 useAuth.mockReturnValue({user:{uid:MARKET_PUBLISHER_UID}});
 const source={sourceCaseId:'sourceA',sourceRevision:'b'.repeat(64),title:data.title,details:data.details,photos:[],owners:[{key:'owner',maskedName:'測試先生',address:'測試路1號'}]};
 marketRequest.mockImplementation(async(action)=>action==='source'?{snapshot:source,existing:null}:action==='directory'?{colleagues:[{id:'staff',name:'示範同仁'}],storage:{usedBytes:0,limit:1024}}:action==='publish'?{id:data.id}:data);
 await render('/market-cases?source=sourceA');const save=button('保存到雲端並分享');expect(save.disabled).toBe(false);await act(async()=>save.click());expect(el.querySelector('.mc-save [role="alert"]').textContent).toContain('尚未選擇分享同仁');expect(el.querySelector('.mc-save-people input')).not.toBeNull();expect(marketRequest.mock.calls.some(c=>c[0]==='publish')).toBe(false);
 expect(el.querySelector('.mc-owner-options input').checked).toBe(false);expect([...el.querySelectorAll('label')].find(x=>x.textContent.startsWith('分享電傳整理資料')).querySelector('input').checked).toBe(false);
 await act(async()=>Simulate.change(el.querySelector('.mc-save-people input'),{target:{checked:true}}));await act(async()=>save.click());expect(el.querySelector('.mc-save [role="alert"]').textContent).toContain('確認');expect(marketRequest.mock.calls.some(c=>c[0]==='publish')).toBe(false);
 await act(async()=>Simulate.change(el.querySelector('input[aria-label="我已核對物件、照片、屋主資料及本次分享名單"]'),{target:{checked:true}}));expect(save.disabled).toBe(false);
 await act(async()=>save.click());expect(marketRequest).toHaveBeenCalledWith('publish',expect.objectContaining({sharedWith:['staff'],ownerKeys:[],photoIds:[],includeDeed:false}),'POST','');
});
test('source failure is visible and does not trigger repeated reads or cloud writes',async()=>{useAuth.mockReturnValue({user:{uid:MARKET_PUBLISHER_UID}});marketRequest.mockRejectedValue(Error('本機離線'));await render('/market-cases?source=sourceA');expect(el.textContent).toContain('本機離線');expect(marketRequest.mock.calls.filter(c=>c[0]==='source')).toHaveLength(1);expect(marketRequest.mock.calls.some(c=>c[2]==='POST')).toBe(false);});

test('an expired Drive connection still shows source preview but prevents photo publication until connected',async()=>{
 useAuth.mockReturnValue({user:{uid:MARKET_PUBLISHER_UID}});
 const source={sourceCaseId:'sourceA',sourceRevision:'b'.repeat(64),title:data.title,details:data.details,photos:[{id:'p',name:'照片',kind:'photo'}],owners:[]};
 marketRequest.mockImplementation(async(action)=>action==='source'?{snapshot:source,existing:null}:{colleagues:[{id:'staff',name:'示範同仁'}],storage:{usedBytes:0,limit:1024},driveStorage:null,driveError:'請先連結 Google Drive'});
 await render('/market-cases?source=sourceA');expect(el.textContent).toContain(data.title);expect(button('連結 Google Drive')).toBeTruthy();
 await act(async()=>Simulate.change(el.querySelector('.mc-person-options input'),{target:{checked:true}}));await act(async()=>Simulate.change(el.querySelector('input[aria-label="我已核對物件、照片、屋主資料及本次分享名單"]'),{target:{checked:true}}));await act(async()=>button('保存到雲端並分享').click());expect(el.querySelector('.mc-save [role="alert"]').textContent).toContain('Google Drive');expect(button('在保存區連結 Google Drive')).toBeTruthy();expect(marketRequest.mock.calls.some(c=>c[0]==='publish')).toBe(false);
});
test('a failed photo can retry without discarding the chosen colleague or review confirmation',async()=>{
 useAuth.mockReturnValue({user:{uid:MARKET_PUBLISHER_UID}});
 const source={sourceCaseId:'sourceA',sourceRevision:'b'.repeat(64),title:data.title,details:data.details,photos:[{id:'photo',name:'重試測試照片',kind:'photo'}],owners:[]};
 marketRequest.mockImplementation(async action=>action==='source'?{snapshot:source,existing:null}:{colleagues:[{id:'staff',name:'示範同仁'}],storage:{usedBytes:0,limit:1024},driveStorage:{limit:'10000',usage:'1'}});
 const original=URL.createObjectURL;URL.createObjectURL=jest.fn(()=>'blob:retry-photo');URL.revokeObjectURL=jest.fn();marketBlob.mockRejectedValueOnce(Error('暫時離線')).mockResolvedValue(new Blob());
 try{await render('/market-cases?source=sourceA');await act(async()=>Simulate.change(el.querySelector('.mc-person-options input'),{target:{checked:true}}));await act(async()=>Simulate.change(el.querySelector('input[aria-label="我已核對物件、照片、屋主資料及本次分享名單"]'),{target:{checked:true}}));await act(async()=>button('重試照片').click());expect(el.querySelector('.mc-person-options input').checked).toBe(true);expect(el.querySelector('input[aria-label="我已核對物件、照片、屋主資料及本次分享名單"]').checked).toBe(true);expect(el.querySelector('.mc-photo img').getAttribute('src')).toBe('blob:retry-photo');}finally{URL.createObjectURL=original;}
});
