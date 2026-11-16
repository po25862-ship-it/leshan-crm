import React,{act} from 'react';
import {createRoot} from 'react-dom/client';
import {Simulate} from 'react-dom/test-utils';
import PropertySurvey from './PropertySurvey';
import {renderSurveyCanvas} from '../lib/propertySurveyRender';

jest.mock('../AuthContext',()=>{const user={uid:'staff-a',getIdToken:async()=>'test-token'};return {useAuth:()=>({user})};});
jest.mock('../hooks/useCollection',()=>{const items=[{id:'crm-1',title:'CRM 兩房',totalPrice:858,floor:'3/6'}];return {useCollection:()=>({items})};});
jest.mock('react-router-dom',()=>{const params=new URLSearchParams();return {useSearchParams:()=>[params]};});
jest.mock('../lib/propertySurveyRender',()=>({renderSurveyCanvas:jest.fn(async()=>({toDataURL:()=> 'data:image/png;base64,preview'})),prepareSurveyPhoto:jest.fn(),surveyPdf:jest.fn(),downloadSurvey:jest.fn()}));
jest.mock('../lib/propertySurveyWord',()=>({surveyWord:jest.fn()}));
let root,container,calls,failSave;
beforeEach(()=>{
 global.IS_REACT_ACT_ENVIRONMENT=true;localStorage.clear();calls=[];failSave=false;renderSurveyCanvas.mockReset().mockResolvedValue({toDataURL:()=> 'data:image/png;base64,preview'});
 global.fetch=jest.fn(async(url,options)=>{calls.push({url,options});if(options.method==='POST'){const body=JSON.parse(options.body);if(body.action==='save')return {ok:!failSave,json:async()=>failSave?{error:'儲存失敗測試'}:{ok:true,id:'a'.repeat(32),revision:1,updatedAt:1000}};}
 return {ok:true,json:async()=>({cases:[]})};});
 container=document.createElement('div');document.body.appendChild(container);root=createRoot(container);
});
afterEach(()=>{act(()=>root.unmount());container.remove();});
const button=text=>[...container.querySelectorAll('button')].find(e=>e.textContent===text);
const edit=(id,value)=>act(()=>Simulate.change(container.querySelector('#'+id),{target:{value}}));
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
 await act(async()=>root.render(<PropertySurvey/>));act(()=>Simulate.change(container.querySelector('[aria-label="選擇 CRM 物件"]'),{target:{value:'crm-1'}}));act(()=>button('帶入物件').click());
 expect(container.querySelector('#survey-case_name').value).toBe('CRM 兩房');expect(container.querySelector('#survey-sale_floor').value).toBe('3');expect(container.querySelector('#survey-total_floors').value).toBe('6');
});
