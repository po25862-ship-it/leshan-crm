import React,{act} from 'react';
import {createRoot} from 'react-dom/client';
import {Simulate} from 'react-dom/test-utils';
import PropertySurvey from './PropertySurvey';
import {prepareSurveyPhoto,renderSurveyCanvas} from '../lib/propertySurveyRender';

jest.mock('../AuthContext',()=>{const user={uid:'staff-a',getIdToken:async()=>'test-token'};return {useAuth:()=>({user})};});
let mockProperties=[];
jest.mock('../hooks/useCollection',()=>({useCollection:()=>({items:mockProperties})}));
jest.mock('react-router-dom',()=>{const params=new URLSearchParams();return {useSearchParams:()=>[params]};});
jest.mock('../lib/propertySurveyRender',()=>({renderSurveyCanvas:jest.fn(async()=>({toDataURL:()=> 'data:image/png;base64,preview'})),prepareSurveyPhoto:jest.fn(),surveyPdf:jest.fn(),downloadSurvey:jest.fn()}));
jest.mock('../lib/propertySurveyWord',()=>({surveyWord:jest.fn()}));
let root,container,calls,failSave;
beforeEach(()=>{
 global.IS_REACT_ACT_ENVIRONMENT=true;localStorage.clear();calls=[];failSave=false;renderSurveyCanvas.mockReset().mockResolvedValue({toDataURL:()=> 'data:image/png;base64,preview'});
 prepareSurveyPhoto.mockReset();
 mockProperties=[{id:'crm-1',title:'CRM 兩房',listingNo:'DE02601414',communityName:'金捷市',area:'A7重劃區',address:'桃園市龜山區樂善二路１９３號',agentInfo:'董 韋 伶 03-3288283',totalPrice:858,floor:'3/6'},{id:'crm-2',title:'智匯學兩房',listingNo:'DD02404966',address:'桃園市龜山區牛角坡路',totalPrice:1588,floor:'8/15'}];
 global.fetch=jest.fn(async(url,options)=>{calls.push({url,options});if(options.method==='POST'){const body=JSON.parse(options.body);if(body.action==='save')return {ok:!failSave,json:async()=>failSave?{error:'儲存失敗測試'}:{ok:true,id:'a'.repeat(32),revision:1,updatedAt:1000}};}
 return {ok:true,json:async()=>({cases:[]})};});
 container=document.createElement('div');document.body.appendChild(container);root=createRoot(container);
});
afterEach(()=>{act(()=>root.unmount());container.remove();});
const button=text=>[...container.querySelectorAll('button')].find(e=>e.textContent===text);
const edit=(id,value)=>act(()=>Simulate.change(container.querySelector('#'+id),{target:{value}}));
const search=value=>act(()=>{const input=container.querySelector('[aria-label="選擇 CRM 物件"]');Simulate.focus(input);Simulate.change(input,{target:{value}});});
const choose=id=>act(()=>[...container.querySelectorAll('[role="option"]')].find(el=>el.textContent.includes(id)).click());
test('preview saves the complete case before rendering and editing removes obsolete images',async()=>{
 await act(async()=>root.render(<PropertySurvey/>));edit('survey-case_name','雲端測試');edit('survey-sale_floor','3');edit('survey-points','1. 生活機能方便');
 await act(async()=>button('產生／更新預覽').click());
 const post=calls.find(c=>c.options.method==='POST'),body=JSON.parse(post.options.body);
 expect(post.options.headers.Authorization).toBe('Bearer test-token');expect(body.action).toBe('save');expect(body.record.salesData.case_name).toBe('雲端測試');
 expect(body.record.sellingPointsText).toBe('1. 生活機能方便');expect(renderSurveyCanvas).toHaveBeenCalledWith(expect.objectContaining({id:'a'.repeat(32),revision:1}));
 expect(container.querySelector('.survey-preview img')).not.toBeNull();
 act(()=>button('物調資料').click());edit('survey-sale_floor','4');act(()=>button('預覽圖').click());expect(container.querySelector('.survey-preview img')).toBeNull();
});
test('failed cloud save stops preview and reports the failure',async()=>{
 failSave=true;await act(async()=>root.render(<PropertySurvey/>));edit('survey-case_name','失敗案');await act(async()=>button('產生／更新預覽').click());
 expect(renderSurveyCanvas).not.toHaveBeenCalled();expect(container.querySelector('[role="alert"]').textContent).toContain('儲存失敗測試');expect(button('產生／更新預覽').disabled).toBe(false);
});
test('CRM import brings in values and separates floor/total floors',async()=>{
 await act(async()=>root.render(<PropertySurvey/>));search('CRM');choose('CRM 兩房');act(()=>button('帶入物件').click());
 expect(container.querySelector('#survey-case_name').value).toBe('CRM 兩房');expect(container.querySelector('#survey-sale_floor').value).toBe('3');expect(container.querySelector('#survey-total_floors').value).toBe('6');
});
test('CRM picker searches normalized IDs, communities, addresses, agents and multiple keywords locally',async()=>{
 await act(async()=>root.render(<PropertySurvey/>));const initialCalls=calls.length;
 for(const keyword of ['ｄｅ０２６０１４１４','金捷市 193','董韋伶','a7']){
  search(keyword);const options=[...container.querySelectorAll('[role="option"]')];
  expect(options).toHaveLength(1);expect(options[0].textContent).toContain('DE02601414');
 }
 search('牛角坡路');expect(container.querySelector('[role="option"]').textContent).toContain('智匯學');
 expect(calls).toHaveLength(initialCalls);
 expect(container.querySelector('#survey-case_name').value).toBe('');
});
test('typing another keyword clears the previous selection and cannot import the old property',async()=>{
 await act(async()=>root.render(<PropertySurvey/>));search('DE02601414');choose('DE02601414');expect(button('帶入物件').disabled).toBe(false);
 edit('survey-case_name','保留我手動填寫的物調');search('不存在的案件');
 expect(container.querySelectorAll('[role="option"]')).toHaveLength(0);expect(container.textContent).toContain('沒有相符選項');
 expect(button('帶入物件').disabled).toBe(true);act(()=>button('帶入物件').click());
 expect(container.querySelector('#survey-case_name').value).toBe('保留我手動填寫的物調');
});
test('search finds a property beyond the initially visible choices and Enter selects it',async()=>{
 mockProperties=[...Array.from({length:100},(_,i)=>({id:'other-'+i,title:'其他案件'+i})),...mockProperties];
 await act(async()=>root.render(<PropertySurvey/>));search('');expect(container.querySelectorAll('[role="option"]')).toHaveLength(80);
 search('DD02404966');expect(container.querySelectorAll('[role="option"]')).toHaveLength(1);
 act(()=>Simulate.keyDown(container.querySelector('[aria-label="選擇 CRM 物件"]'),{key:'Enter'}));
 expect(button('帶入物件').disabled).toBe(false);act(()=>button('帶入物件').click());
 expect(container.querySelector('#survey-case_name').value).toBe('智匯學兩房');
});
const innerPhoto='data:image/jpeg;base64,bmV3cGhvdG8=';
const jpg=()=>new File(['photo'],'photo.jpg',{type:'image/jpeg'});
const drop=file=>Simulate.drop(container.querySelector('.survey-photo-drop'),{dataTransfer:{files:[file]}});
test('photo processing shows local progress, allows text edits, and preserves those edits when the image finishes',async()=>{
 let finish;prepareSurveyPhoto.mockImplementation((file,{onStage})=>{onStage('正在縮小照片…');return new Promise(resolve=>{finish=resolve;});});
 await act(async()=>root.render(<PropertySurvey/>));await act(async()=>drop(jpg()));
 expect(container.querySelector('.survey-photo-progress').textContent).toContain('正在縮小照片');
 expect(container.querySelector('.survey-edit').disabled).toBe(false);expect(button('儲存案件').disabled).toBe(true);
 edit('survey-case_name','照片處理時補上的案名');await act(async()=>finish(innerPhoto));
 expect(container.querySelector('.survey-photo-drop img').getAttribute('src')).toBe(innerPhoto);
 expect(container.querySelector('#survey-case_name').value).toBe('照片處理時補上的案名');expect(button('儲存案件').disabled).toBe(false);
 expect(calls.some(c=>c.options.method==='POST')).toBe(false);
});
test('photo failure preserves the previous image and allows retrying the same file',async()=>{
 const original='data:image/jpeg;base64,b2xkcGhvdG8=';
 localStorage.setItem('leshan-survey-draft-staff-a',JSON.stringify({salesData:{case_name:'原有案件'},floorplanBase64:original}));
 prepareSurveyPhoto.mockRejectedValueOnce(new Error('照片處理逾時')).mockResolvedValueOnce(innerPhoto);
 await act(async()=>root.render(<PropertySurvey/>));await act(async()=>drop(jpg()));
 expect(container.querySelector('.survey-photo-drop [role=alert]').textContent).toContain('逾時');expect(container.querySelector('.survey-photo-drop img').getAttribute('src')).toBe(original);
 expect(button('儲存案件').disabled).toBe(false);await act(async()=>button('重試這張照片').click());
 expect(container.querySelector('.survey-photo-drop img').getAttribute('src')).toBe(innerPhoto);expect(container.querySelector('#survey-case_name').value).toBe('原有案件');
});
test('cancel unlocks the editor immediately and a late cancelled result cannot replace a newer photo or unlock its job',async()=>{
 const finish=[];prepareSurveyPhoto.mockImplementation(()=>new Promise(resolve=>finish.push(resolve)));
 await act(async()=>root.render(<PropertySurvey/>));await act(async()=>drop(jpg()));
 act(()=>container.querySelector('[aria-label="取消內頁照片處理"]').click());expect(button('儲存案件').disabled).toBe(false);
 await act(async()=>drop(jpg()));await act(async()=>finish[0]('data:image/jpeg;base64,Y2FuY2VsbGVk'));
 expect(container.querySelector('.survey-photo-drop img')).toBeNull();expect(button('儲存案件').disabled).toBe(true);
 await act(async()=>finish[1](innerPhoto));expect(container.querySelector('.survey-photo-drop img').getAttribute('src')).toBe(innerPhoto);expect(button('儲存案件').disabled).toBe(false);
});
test('the file picker accepts HEIC and dropped links cannot start an image job',async()=>{
 prepareSurveyPhoto.mockResolvedValue(innerPhoto);await act(async()=>root.render(<PropertySurvey/>));
 const input=container.querySelector('[aria-label="選擇內頁照片"]'),heic=new File(['heic'],'IMG.HEIC',{type:'image/heic'});
 expect(input.accept).toContain('.heic');await act(async()=>Simulate.change(input,{target:{files:[heic],value:''}}));
 expect(prepareSurveyPhoto).toHaveBeenCalledWith(heic,expect.objectContaining({signal:expect.anything(),onStage:expect.any(Function)}));
 prepareSurveyPhoto.mockClear();act(()=>Simulate.drop(container.querySelector('.survey-photo-drop'),{dataTransfer:{files:[]}}));
 expect(prepareSurveyPhoto).not.toHaveBeenCalled();expect(container.querySelector('.survey-photo-drop [role=alert]').textContent).toContain('網頁連結');
});
test('starting a new case clears a failed photo retry so the old photo cannot be attached to the new case',async()=>{
 prepareSurveyPhoto.mockRejectedValue(new Error('照片處理逾時'));await act(async()=>root.render(<PropertySurvey/>));await act(async()=>drop(jpg()));
 expect(button('重試這張照片')).toBeDefined();act(()=>button('新案件').click());
 expect(button('重試這張照片')).toBeUndefined();expect(container.querySelector('.survey-photo-drop [role=alert]')).toBeNull();
});
test('dragged file items work even when the browser supplies no FileList; folders are rejected',async()=>{
 prepareSurveyPhoto.mockResolvedValue(innerPhoto);await act(async()=>root.render(<PropertySurvey/>));const file=jpg();
 await act(async()=>Simulate.drop(container.querySelector('.survey-photo-drop'),{dataTransfer:{files:[],items:[{kind:'file',getAsFile:()=>file}]}}));
 expect(prepareSurveyPhoto).toHaveBeenCalledWith(file,expect.anything());prepareSurveyPhoto.mockClear();
 act(()=>Simulate.drop(container.querySelector('.survey-photo-drop'),{dataTransfer:{files:[],items:[{kind:'file',webkitGetAsEntry:()=>({isDirectory:true})}]}}));
 expect(prepareSurveyPhoto).not.toHaveBeenCalled();expect(container.querySelector('.survey-photo-drop [role=alert]').textContent).toContain('資料夾');
});
const chooseReps=count=>act(()=>Simulate.change(container.querySelector(`input[name="survey-sales-rep-count"][value="${count}"]`)));
test('rep count shows up to three editable contacts, keeps hidden entries and saves only the selected display count',async()=>{
 await act(async()=>root.render(<PropertySurvey/>));edit('survey-case_name','三人共同服務');
 expect(container.querySelector('input[name="survey-sales-rep-count"]:checked').value).toBe('1');expect(container.querySelector('#survey-sales_rep_2')).toBeNull();
 edit('survey-sales_rep','第一位');edit('survey-sales_rep_phone','0900000001');chooseReps(3);
 edit('survey-sales_rep_2','第二位');edit('survey-sales_rep_phone_2','0900000002');edit('survey-sales_rep_3','第三位');edit('survey-sales_rep_phone_3','0900000003');
 expect(container.querySelectorAll('.survey-sales-contacts>fieldset')).toHaveLength(3);
 chooseReps(1);expect(container.querySelector('#survey-sales_rep_3')).toBeNull();chooseReps(3);expect(container.querySelector('#survey-sales_rep_3').value).toBe('第三位');
 chooseReps(2);await act(async()=>button('產生／更新預覽').click());
 const body=JSON.parse(calls.find(c=>c.options.method==='POST').options.body);expect(body.record.salesData).toMatchObject({sales_rep_count:'2',sales_rep:'第一位',sales_rep_2:'第二位',sales_rep_3:'第三位'});
 expect(renderSurveyCanvas).toHaveBeenCalledWith(expect.objectContaining({salesData:expect.objectContaining({sales_rep_count:'2',sales_rep_phone_2:'0900000002'})}));
});
test('new cases and CRM imports retain the chosen team while old drafts remain editable with one contact',async()=>{
 const confirm=jest.spyOn(window,'confirm').mockReturnValue(true);
 localStorage.setItem('leshan-survey-draft-staff-a',JSON.stringify({salesData:{case_name:'舊案件',sales_rep:'原有業務'}}));
 await act(async()=>root.render(<PropertySurvey/>));expect(container.querySelector('#survey-sales_rep').value).toBe('原有業務');
 chooseReps(3);edit('survey-sales_rep_2','第二位');edit('survey-sales_rep_3','第三位');act(()=>button('新案件').click());
 expect(container.querySelector('#survey-case_name').value).toBe('');expect(container.querySelector('#survey-sales_rep_3').value).toBe('第三位');
 search('CRM');choose('CRM 兩房');act(()=>button('帶入物件').click());
 expect(container.querySelector('input[name="survey-sales-rep-count"]:checked').value).toBe('3');expect(container.querySelector('#survey-sales_rep_2').value).toBe('第二位');
 confirm.mockRestore();
});
