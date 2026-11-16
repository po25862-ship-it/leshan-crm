import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { Simulate } from 'react-dom/test-utils';
import PropertyAudit from './PropertyAudit';
import { savePropertyAuditCheck, savePropertyAuditNote } from '../lib/propertyAuditRepository';

let mockRows = [], mockRefresh = jest.fn();
jest.mock('../AuthContext', () => ({ useAuth: () => ({ user: { uid: 'staff-a' } }) }));
jest.mock('../hooks/useDoc', () => ({ useDoc: () => ({ data: { name: '核對同事' } }) }));
jest.mock('../hooks/useCollection', () => ({ useCollection: () => ({ items: mockRows, refresh: mockRefresh, loading: false, loadedAt: 1794780000000 }) }));
jest.mock('../lib/propertyAuditRepository', () => ({ savePropertyAuditCheck: jest.fn(), savePropertyAuditNote: jest.fn() }));
jest.mock('react-router-dom', () => ({ Link: ({ to, children, ...props }) => require('react').createElement('a', { href: to, ...props }, children) }));
let root, container;
const row = (id, status='active') => ({ id, listingNo:id, title:'測試物件'+id, address:'桃園市龜山區樂善二路', totalPrice:1598, store:'捷運樂善直營店', status, websitePublished:true, websiteUrl:'https://www.twhg.com.tw/buy/'+id });
const render = async () => { await act(async () => root.render(<PropertyAudit/>)); };
const button = text => [...container.querySelectorAll('button')].find(e => e.textContent.includes(text));
beforeEach(() => {
  global.IS_REACT_ACT_ENVIRONMENT=true;
  mockRows=[row('DE1'), row('DE2','onHold'), {...row('XX1'),store:'其他分店'}];
  mockRefresh=jest.fn().mockResolvedValue([]); savePropertyAuditCheck.mockReset();savePropertyAuditNote.mockReset();
  container=document.createElement('div');document.body.appendChild(container);root=createRoot(container);
});
afterEach(() => { act(() => root.unmount());container.remove(); });

test('only branch active rows appear initially; status and search filter the printable rows', async () => {
  await render();
  expect(container.querySelectorAll('tbody tr')).toHaveLength(1);
  expect(container.querySelector('tbody').textContent).toContain('DE1');
  expect(container.querySelector('tbody').textContent).not.toContain('DE2');
  expect(container.querySelectorAll('tbody input[type=checkbox]')).toHaveLength(4);
  act(() => button('暫時不賣').click());
  expect(container.querySelector('tbody').textContent).toContain('DE2');
  act(() => Simulate.change(container.querySelector('[aria-label="搜尋核對物件"]'),{target:{value:'不存在'}}));
  expect(container.querySelectorAll('tbody tr')).toHaveLength(0);
  expect(button('列印目前清單').disabled).toBe(true);
});

test('draft keeps its starting note version when a colleague updates it; failed save preserves draft', async () => {
  mockRows=[{...row('DE1'),auditChecklist:{note:{text:'原備註',byName:'同事'}}}];
  await render();const input=container.querySelector('textarea');
  act(() => { Simulate.focus(input);Simulate.change(input,{target:{value:'我的補件說明'}}); });
  expect(button('更新清單').disabled).toBe(true);
  expect(button('列印目前清單').disabled).toBe(true);
  mockRows=[{...mockRows[0],auditChecklist:{note:{text:'同事的新備註',byName:'另一位同事'}}}];
  await render();savePropertyAuditNote.mockRejectedValue(new Error('同事剛剛更新過這筆備註'));
  await act(async () => button('儲存備註').click());
  expect(savePropertyAuditNote).toHaveBeenCalledWith(expect.objectContaining({text:'我的補件說明',expectedText:'原備註'}));
  expect(input.value).toBe('我的補件說明');
  expect(container.querySelector('[role=alert]').textContent).toContain('同事剛剛更新');
  act(() => button('取消').click());
  expect(input.value).toBe('同事的新備註');
  expect(button('更新清單').disabled).toBe(false);
});

test('failed cloud checkbox save cannot show a verified document', async () => {
  savePropertyAuditCheck.mockRejectedValue(new Error('連線失敗，請重試'));
  await render();const check=container.querySelector('[aria-label="DE1 委託書"]');
  await act(async () => Simulate.change(check,{target:{checked:true}}));
  expect(check.checked).toBe(false);
  expect(container.querySelector('[role=alert]').textContent).toContain('連線失敗');
});
