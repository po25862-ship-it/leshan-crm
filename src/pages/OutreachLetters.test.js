import { saveOutreach } from "../lib/outreachRepository";
import { lookupOutreachPostal } from "../lib/outreachPostal";
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { Simulate } from 'react-dom/test-utils';
import { MemoryRouter } from 'react-router-dom';
import OutreachLetters from './OutreachLetters';
import { useAuth } from '../AuthContext';
import { auth } from '../firebase';
import { listOutreach } from '../lib/outreachRepository';
jest.mock('./OutreachCases',()=>({onSaved})=>require('react').createElement('button',{onClick:()=>onSaved(['two'])},'測試加入收件人'));
jest.mock('../AuthContext',()=>({useAuth:jest.fn()}));
jest.mock('../firebase',()=>({auth:{currentUser:{uid:'a'}},db:{}}));
jest.mock('../lib/outreachRepository',()=>({listOutreach:jest.fn(),saveOutreach:jest.fn(),saveOutreachSettings:jest.fn(),outreachHistory:jest.fn(),logOutreachBatch:jest.fn(),saveOutreachSelection:jest.fn(),uploadOutreachLetter:jest.fn(),readOutreachLetter:jest.fn(),archiveOutreachLetter:jest.fn(),saveOutreachTextLetter:jest.fn()}));
jest.mock('../lib/outreachPostal',()=>({lookupOutreachPostal:jest.fn(async()=>({zip:'',matched:false}))}));
const base={letters:[],batches:[],settings:{},records:[{id:'one',title:'甲帳號私人案件',recipient:'林先生',address:'桃園市龜山區樂善一路6號',zip:'333001',zipVerifiedAddress:'桃園市龜山區樂善一路6號',status:'待寄出',sentCount:0,followOn:'',letterId:'',notes:'',revision:1},{id:'two',title:'另一件',recipient:'王小姐',address:'復興街5號',zip:'',zipVerifiedAddress:'',status:'待寄出',sentCount:0,followOn:'',letterId:'',notes:'',revision:1}]};
let container,root;
beforeEach(()=>{Element.prototype.scrollIntoView=jest.fn();global.IS_REACT_ACT_ENVIRONMENT=true;useAuth.mockReturnValue({user:{uid:'a'}});auth.currentUser={uid:'a'};listOutreach.mockResolvedValue(base);container=document.createElement('div');document.body.append(container);root=createRoot(container);URL.revokeObjectURL=jest.fn();});
afterEach(async()=>{await act(async()=>root.unmount());container.remove();jest.clearAllMocks();});
async function render(){await act(async()=>root.render(<MemoryRouter future={{v7_startTransition:true,v7_relativeSplatPath:true}}><OutreachLetters/></MemoryRouter>));}
const findButton=text=>Array.from(container.querySelectorAll('button')).find(b=>b.textContent===text);
test('private work area starts without selecting anyone or registering sent mail',async()=>{await render();expect(container.textContent).toContain('其他同事無法讀取');expect(container.textContent).toContain('本次名單 0 筆');expect(findButton('製作整批 PDF').disabled).toBe(true);});
test('hidden selections remain visible in batch review rather than silently omitted',async()=>{await render();const checkbox=container.querySelector('.ol-record-choice input');await act(async()=>Simulate.change(checkbox,{target:{checked:true}}));const search=container.querySelector('.ol-filters input');await act(async()=>Simulate.change(search,{target:{value:'另一件'}}));expect(container.textContent).toContain('其中 1 筆不在目前篩選畫面');expect(container.querySelector('.ol-selected-list').textContent).toContain('甲帳號私人案件');});
test('missing files or sender details cannot produce incomplete print job',async()=>{await render();await act(async()=>findButton('全選篩選結果 2 筆').click());expect(container.textContent).toContain('2 筆需要確認');expect(findButton('製作整批 PDF').disabled).toBe(true);});
test('changing signed-in account clears old private data while new data loads',async()=>{await render();useAuth.mockReturnValue({user:{uid:'b'}});auth.currentUser={uid:'b'};listOutreach.mockReturnValue(new Promise(()=>{}));await act(async()=>root.render(<MemoryRouter future={{v7_startTransition:true,v7_relativeSplatPath:true}}><OutreachLetters/></MemoryRouter>));expect(container.textContent).not.toContain('甲帳號私人案件');expect(container.textContent).toContain('載入你的私人開發信資料');});

test('adding another case retains existing batch selections and deduplicates repeated additions',async()=>{await render();await act(async()=>Simulate.change(container.querySelector('.ol-record-choice input'),{target:{checked:true}}));await act(async()=>findButton('測試加入收件人').click());expect(container.textContent).toContain('本次名單 2 筆');await act(async()=>findButton('測試加入收件人').click());expect(container.textContent).toContain('本次名單 2 筆');});

const draftField = label => [...container.querySelectorAll('.ol-editor label')].find(node=>node.firstChild?.textContent === label)?.querySelector('input');
const fillDraft = async (label, value) => act(async()=>Simulate.change(draftField(label), {target:{value}}));
const advanceDraft = async () => act(async()=>Simulate.submit(container.querySelector('.ol-editor form')));
test('the three-step letter form preserves fields and finishes postal lookup after moving forward',async()=>{
  jest.useFakeTimers();
  try {
    lookupOutreachPostal.mockResolvedValue({zip:'333001',matched:true}); saveOutreach.mockResolvedValue('new-case');
    await render(); await act(async()=>findButton('＋ 新增紀錄').click());
    await fillDraft('案件名稱','測試新案件'); await fillDraft('案件網址','https://example.test/house');
    await advanceDraft();
    expect(container.querySelector('[aria-current="step"]').getAttribute('aria-label')).toBe('2. 收件資料');
    await fillDraft('收件人','王先生'); await fillDraft('實際收件地址','桃園市龜山區樂善二路100號');
    await advanceDraft(); await act(async()=>jest.advanceTimersByTime(1000));
    expect(container.querySelector('[aria-current="step"]').getAttribute('aria-label')).toBe('3. 信件與追蹤');
    expect(container.querySelector('.workflow-review').textContent).toContain('333001');
    await act(async()=>findButton('上一步').click());
    expect(draftField('收件人').value).toBe('王先生'); expect(draftField('案件名稱').value).toBe('測試新案件');
    await advanceDraft(); await advanceDraft();
    expect(saveOutreach).toHaveBeenCalledWith('a',expect.objectContaining({title:'測試新案件',recipient:'王先生',zip:'333001',address:'桃園市龜山區樂善二路100號'}));
  } finally { jest.useRealTimers(); }
});
test('jumping straight to save returns to missing fields without writing a partial record',async()=>{
  await render(); await act(async()=>findButton('＋ 新增紀錄').click());
  await act(async()=>container.querySelector('.workflow-steps button[aria-label="3. 信件與追蹤"]').click());
  await advanceDraft();
  expect(saveOutreach).not.toHaveBeenCalled();
  expect(container.querySelector('[aria-current="step"]').getAttribute('aria-label')).toBe('1. 案件資料');
  expect(container.textContent).toContain('請填案件名稱、收件人與完整收件地址');
});
