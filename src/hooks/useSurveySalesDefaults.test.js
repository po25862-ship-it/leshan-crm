import React,{act} from 'react';
import {createRoot} from 'react-dom/client';
import useSurveySalesDefaults,{readSalesDefaults} from './useSurveySalesDefaults';

const user={uid:'staff-a'},team=name=>({sales_rep_count:'3',sales_rep:name,sales_rep_phone:'0900000001',sales_rep_2:'乙',sales_rep_phone_2:'0900000002',sales_rep_3:'丙',sales_rep_phone_3:'0900000003'});
let root,container,current,request;
function Harness(){current=useSurveySalesDefaults(user,request);return <span>{current.status}</span>;}
beforeEach(()=>{global.IS_REACT_ACT_ENVIRONMENT=true;jest.useFakeTimers();localStorage.clear();request=jest.fn(async()=>({ok:true}));container=document.createElement('div');document.body.append(container);root=createRoot(container);});
afterEach(()=>{act(()=>root.unmount());container.remove();jest.useRealTimers();});
const tick=()=>act(async()=>{jest.advanceTimersByTime(600);});
test('edits are remembered immediately per account, coalesced into one private save and restored on reopening',async()=>{
 await act(async()=>root.render(<Harness/>));
 act(()=>{current.remember({...team('甲'),case_name:'不該存進預設',rawText:'不該存進預設'});current.remember(team('新版甲'));});
 expect(readSalesDefaults(user.uid).salesData.sales_rep).toBe('新版甲');expect(readSalesDefaults('other')).toBeNull();expect(request).not.toHaveBeenCalled();
 await tick();expect(request).toHaveBeenCalledTimes(1);expect(request).toHaveBeenCalledWith(user,{action:'sales-defaults',salesData:expect.objectContaining({sales_rep:'新版甲',sales_rep_count:'3'})});
 expect(request.mock.calls[0][1].salesData).not.toHaveProperty('case_name');expect(current.status).toBe('saved');
 act(()=>root.unmount());root=createRoot(container);await act(async()=>root.render(<Harness/>));expect(current.data.sales_rep).toBe('新版甲');expect(readSalesDefaults(user.uid).pending).toBe(false);
});
test('an old in-flight save cannot overwrite a newer selection and writes are serialized',async()=>{
 const finish=[];request.mockImplementation(()=>new Promise(resolve=>finish.push(resolve)));await act(async()=>root.render(<Harness/>));
 act(()=>current.remember(team('第一版')));await tick();act(()=>current.remember(team('最新版')));await tick();expect(request).toHaveBeenCalledTimes(1);
 await act(async()=>finish[0]({ok:true}));expect(readSalesDefaults(user.uid).salesData.sales_rep).toBe('最新版');expect(current.status).toBe('pending');
 await act(async()=>jest.runOnlyPendingTimers());expect(request).toHaveBeenCalledTimes(2);await act(async()=>finish[1]({ok:true}));expect(current.status).toBe('saved');expect(readSalesDefaults(user.uid).salesData.sales_rep).toBe('最新版');
});
test('failed sync stays locally pending, does not loop, and can be retried',async()=>{
 request.mockRejectedValueOnce(new Error('offline')).mockResolvedValue({ok:true});await act(async()=>root.render(<Harness/>));
 act(()=>current.remember(team('離線名單')));await tick();expect(current.status).toBe('error');expect(readSalesDefaults(user.uid).pending).toBe(true);
 await act(async()=>jest.advanceTimersByTime(60000));expect(request).toHaveBeenCalledTimes(1);await act(async()=>current.retry());expect(current.status).toBe('saved');expect(request).toHaveBeenCalledTimes(2);
});
test('a delayed cloud default cannot replace a choice already made on this device',async()=>{
 await act(async()=>root.render(<Harness/>));act(()=>current.remember(team('我剛選的')));let accepted;
 act(()=>{accepted=current.acceptRemote(team('雲端舊版'));});expect(accepted).toBeNull();expect(current.data.sales_rep).toBe('我剛選的');
});
test('unsynced cached choices resume once on reopening; blank saved choices can intentionally clear the team',async()=>{
 localStorage.setItem('leshan-survey-sales-defaults-staff-a',JSON.stringify({salesData:team('尚未同步'),pending:true}));
 // Initialize the hook after the cached record exists.
 await act(async()=>root.render(<Harness/>));expect(current.data.sales_rep).toBe('尚未同步');await tick();expect(request).toHaveBeenCalledTimes(1);
 act(()=>current.remember({sales_rep_count:'1'}));await tick();expect(current.data.sales_rep).toBe('');expect(readSalesDefaults(user.uid).salesData.sales_rep_3).toBe('');
});
