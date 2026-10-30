import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { Simulate } from 'react-dom/test-utils';
import BuyerActivityLog from './BuyerActivityLog';

global.IS_REACT_ACT_ENVIRONMENT = true;
const mockProperties = [
  ...Array.from({ length: 24 }, (_, index) => ({ id: `sold-${index}`, title: `金捷已售${index}`, status: 'sold' })),
  { id: 'hold', title: '金捷暫停', status: 'onHold' },
  { id: 'active', title: '金捷在售', address: '樂善二路', status: 'active' },
  { id: 'legacy', title: '金捷舊資料' },
];
const mockAddAppt = jest.fn(async () => ({ id: 'new-appointment' }));
const mockUpdateAppt = jest.fn(async () => {});
const mockAppointments = [{ id: 'old-appointment', propertyId: 'sold-0', propertyLabel: '金捷已售0', date: '2026-10-20', time: '14:00' }];
jest.mock('../AuthContext', () => ({ useAuth: () => ({ user: { uid: 'fixture-user' } }) }));
jest.mock('../GoogleAuthContext', () => ({ useGoogleAuth: () => ({ isConnected: false }) }));
jest.mock('../hooks/useCollection', () => ({ useCollection: (path) => ({
  items: path === 'properties' ? mockProperties : path.endsWith('/appointments') ? mockAppointments : [],
  add: mockAddAppt, update: mockUpdateAppt, remove: jest.fn(),
}) }));
let host, root;
const button = (text) => [...host.querySelectorAll('button')].find((element) => element.textContent.trim() === text);
const input = () => host.querySelector('input[placeholder="搜尋在售物件案名或地址（可選填）"]');
beforeEach(() => {
  jest.clearAllMocks();
  host = document.createElement('div'); document.body.appendChild(host); root = createRoot(host);
  act(() => root.render(<BuyerActivityLog contactId="buyer" contactName="測試買方" />));
});
afterEach(() => { act(() => root.unmount()); host.remove(); });

test('new viewing searches exclude sold/held listings before the twenty-result limit and save the chosen active property', async () => {
  const field = input();
  act(() => Simulate.focus(field));
  const picker = field.parentElement;
  expect(picker.textContent).toContain('金捷在售');
  expect(picker.textContent).toContain('金捷舊資料');
  expect(picker.textContent).not.toContain('金捷已售');
  expect(picker.textContent).not.toContain('金捷暫停');
  act(() => Simulate.change(field, { target: { value: '樂善二路' } }));
  expect(picker.textContent).toContain('金捷在售');
  expect(picker.textContent).not.toContain('金捷舊資料');
  const option = [...picker.querySelectorAll('div')].find((element) => element.textContent === '金捷在售');
  act(() => option.click());
  await act(async () => Simulate.submit(host.querySelector('form')));
  expect(mockAddAppt).toHaveBeenCalledWith(expect.objectContaining({ propertyLabel: '金捷在售', propertyId: 'active' }));
});

test('editing an old sold-property viewing preserves its link while only offering active replacements', async () => {
  expect(host.textContent).toContain('金捷已售0');
  act(() => button('編輯').click());
  const fields = host.querySelectorAll('input[placeholder="搜尋在售物件案名或地址（可選填）"]');
  const field = fields[fields.length - 1];
  expect(field.value).toBe('金捷已售0');
  act(() => Simulate.change(field, { target: { value: '金捷' } }));
  expect(field.parentElement.textContent).toContain('金捷在售');
  expect(field.parentElement.textContent).not.toContain('金捷已售');
  expect(field.parentElement.textContent).not.toContain('金捷暫停');
  act(() => Simulate.change(field, { target: { value: '金捷已售0' } }));
  await act(async () => button('儲存').click());
  expect(mockUpdateAppt).toHaveBeenCalledWith('old-appointment', expect.objectContaining({ propertyLabel: '金捷已售0', propertyId: 'sold-0' }));
});

test('recording a past interaction can still reference a sold listing', () => {
  act(() => button('💬 互動紀錄').click());
  const field = host.querySelector('input[placeholder="例如：A7 重劃區 OO 社區 3F"]');
  act(() => Simulate.focus(field));
  expect(field.parentElement.textContent).toContain('金捷已售0');
});
