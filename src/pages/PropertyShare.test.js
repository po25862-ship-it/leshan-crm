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
