import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { Simulate } from "react-dom/test-utils";
import { addDoc, collection, serverTimestamp } from "firebase/firestore";
import PropertyShare from "./PropertyShare";

global.IS_REACT_ACT_ENVIRONMENT = true;
jest.mock("../firebase", () => ({ db: {} }));
jest.mock("../AuthContext", () => ({ useAuth: () => ({ user: { uid: "fixture-user" } }) }));
jest.mock("../hooks/usePersonalAgid", () => ({ usePersonalAgid: () => ({ agid: "12345" }) }));
jest.mock("../hooks/useSharedCollection", () => ({ useSharedCollection: () => ({ items: [{ id: "buyer1", name: "客人", tags: ["買方"] }] }) }));
jest.mock("../lib/linePersonal", () => ({ openLinePersonalTool: jest.fn() }));
jest.mock("./BuyerRecipientPicker", () => () => null);
jest.mock("./PropertyShareMap", () => ({ properties }) => <div data-testid="map-order">{properties.map((property, index) => `${index + 1}. ${property.title}`).join("／")}</div>);
jest.mock("firebase/firestore", () => ({
  addDoc: jest.fn(async () => ({ id: "fixture-log" })),
  collection: jest.fn((_, path) => path),
  serverTimestamp: jest.fn(() => "fixture-time"),
}));

const properties = [{ id: "p1", title: "兩房車", totalPrice: 1598, titlePing: 42.15, mainBuildingPing: 19.65, parkingPing: 11.01, parkingCount: 1, parkingDescription: "坡道平面", address: "桃園市龜山區文青路12號8樓", websiteUrl: "https://www.twhg.com.tw/buy/AAA?agid=06459" }];
let host, root;
const button = (text) => [...host.querySelectorAll("button")].find((element) => element.textContent.trim() === text);
beforeEach(() => {
  jest.useFakeTimers();
  jest.clearAllMocks();
  collection.mockImplementation((_, path) => path);
  addDoc.mockResolvedValue({ id: "fixture-log" });
  serverTimestamp.mockReturnValue("fixture-time");
  Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText: jest.fn(async () => {}) } });
  window.alert = jest.fn();
  host = document.createElement("div"); document.body.appendChild(host); root = createRoot(host);
  act(() => root.render(<PropertyShare properties={properties} selectedBuyerId="buyer1" onClose={jest.fn()} />));
});
afterEach(() => { act(() => root.unmount()); host.remove(); jest.useRealTimers(); });

test("選取物件產生面積與試算單價，複製和互動紀錄採用使用者最後編輯的文字", async () => {
  const [intro, preview] = host.querySelectorAll("textarea");
  expect(preview.value).toContain("扣車後31.14坪");
  expect(preview.value).toContain("扣車單價約45.54萬／坪");
  expect(preview.value).toContain("agid=12345");
  expect(preview.value).not.toContain("agid=06459");
  expect(host.querySelector('[data-testid="map-order"]').textContent).toBe("1. 兩房車");
  expect(addDoc).not.toHaveBeenCalled();
  act(() => Simulate.change(intro, { target: { value: "專屬推薦" } }));
  expect(preview.value).toMatch(/^專屬推薦/);
  act(() => Simulate.change(preview, { target: { value: `${preview.value}\n客製補充` } }));
  const finalText = preview.value;
  await act(async () => button("複製文字").click());
  expect(navigator.clipboard.writeText).toHaveBeenCalledWith(finalText);
  await act(async () => button("記錄到互動紀錄").click());
  expect(addDoc).toHaveBeenCalledWith("contacts/buyer1/interactions", expect.objectContaining({ communication: finalText, properties: [{ label: "兩房車", propertyId: "p1" }] }));
});

test('copying does not mark an introduction; explicit confirmation records the final preview once',async()=>{
 const onIntroduced=jest.fn(async()=>{});
 act(()=>root.render(<PropertyShare properties={properties} defaultBuyerId="buyer1" onIntroduced={onIntroduced} onClose={jest.fn()}/>));
 await act(async()=>button('複製文字').click());expect(onIntroduced).not.toHaveBeenCalled();
 const preview=host.querySelectorAll('textarea')[1];act(()=>Simulate.change(preview,{target:{value:'確認實際傳送的文字'}}));
 await act(async()=>button('已實際傳送，記錄本次介紹').click());
 expect(onIntroduced).toHaveBeenCalledWith(expect.objectContaining({recipientId:'buyer1',communication:'確認實際傳送的文字'}));
 expect(addDoc).not.toHaveBeenCalled();expect(button('已記錄本次介紹').disabled).toBe(true);
});

test("降價通知的文字、地圖與買方紀錄只使用相同的降價物件，保留手動編輯內容", async () => {
  const discounted = [
    { ...properties[0], id: "drop1", title: "降價第一間", lastPriceChange: { oldPrice: 1698, newPrice: 1598 } },
    { ...properties[0], id: "drop2", title: "降價第二間", lastPriceChange: { oldPrice: 1798, newPrice: 1598 } },
  ];
  act(() => root.render(<PropertyShare properties={[properties[0], ...discounted]} selectedBuyerId="buyer1" onClose={jest.fn()} />));
  await act(async () => button("降價通知").click());
  const [intro, preview] = host.querySelectorAll("textarea");
  expect(preview.value).toContain("1. 降價第一間");
  expect(preview.value).toContain("2. 降價第二間");
  expect(preview.value).toContain("本次調降 100 萬");
  expect(preview.value).not.toContain("3. ");
  expect(host.textContent).toContain("以下 1 筆缺少可確認的降價紀錄");
  expect(host.querySelector('[data-testid="map-order"]').textContent).toBe("1. 降價第一間／2. 降價第二間");
  act(() => Simulate.change(intro, { target: { value: "這次降價的物件，請參考" } }));
  expect(preview.value).toMatch(/^這次降價的物件，請參考/);
  act(() => Simulate.change(preview, { target: { value: preview.value + "\n我補充的資訊" } }));
  const finalText = preview.value;
  await act(async () => button("複製文字").click());
  expect(navigator.clipboard.writeText).toHaveBeenCalledWith(finalText);
  await act(async () => button("記錄到互動紀錄").click());
  expect(addDoc).toHaveBeenCalledWith("contacts/buyer1/interactions", expect.objectContaining({
    communication: finalText,
    properties: [{ label: "降價第一間", propertyId: "drop1" }, { label: "降價第二間", propertyId: "drop2" }],
  }));
  await act(async () => button("一般推薦").click());
  expect(preview.value).toContain("1. 兩房車");
  await act(async () => button("降價通知").click());
  expect(intro.value).toBe("這次降價的物件，請參考");
});

test("沒有可靠降價資料時清空通知並停用複製與記錄，改回推薦可繼續分享", async () => {
  await act(async () => button("降價通知").click());
  expect(host.querySelectorAll("textarea")[1].value).toBe("");
  expect(button("複製文字").disabled).toBe(true);
  expect(button("複製並開啟個人 LINE").disabled).toBe(true);
  expect(button("記錄到互動紀錄").disabled).toBe(true);
  expect(host.querySelector('[data-testid="map-order"]')).toBeNull();
  expect(addDoc).not.toHaveBeenCalled();
  await act(async () => button("一般推薦").click());
  expect(button("複製文字").disabled).toBe(false);
});

test("先記錄推薦後仍可另記錄降價通知，使用不同事件並傳入實際通知的物件", async () => {
  const onIntroduced = jest.fn(async () => {});
  const discounted = { ...properties[0], lastPriceChange: { oldPrice: 1698, newPrice: 1598 } };
  act(() => root.render(<PropertyShare properties={[discounted]} defaultBuyerId="buyer1" onIntroduced={onIntroduced} onClose={jest.fn()} />));
  await act(async () => button("已實際傳送，記錄本次介紹").click());
  const firstEvent = onIntroduced.mock.calls[0][0].eventId;
  await act(async () => button("降價通知").click());
  expect(button("已實際傳送，記錄本次介紹").disabled).toBe(false);
  await act(async () => button("已實際傳送，記錄本次介紹").click());
  expect(onIntroduced).toHaveBeenCalledTimes(2);
  const notification = onIntroduced.mock.calls[1][0];
  expect(notification.eventId).not.toBe(firstEvent);
  expect(notification.communication).toContain("最新售價｜1,598 萬");
  expect(notification.properties).toEqual([discounted]);
});
