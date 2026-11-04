/** @jest-environment jsdom */
import {webcrypto} from "crypto";
import React, {act, useState} from "react";
import {createRoot} from "react-dom/client";
import RentalKeyPicker from "./RentalKeyPicker";
import {RENTAL_KEY_ORIGIN, RENTAL_KEY_MESSAGE, parseRentalKey} from "../lib/companyRentalKeys";
let root, container, popup, opener;
function Fixture(){const[key,setKey]=useState(""),[notes,setNotes]=useState("");return <><RentalKeyPicker keyInfo={key} notes={notes} onKeyChange={setKey} onNotesChange={setNotes}/><output>{parseRentalKey(key)?.id||""}</output></>;}
beforeEach(()=>{global.IS_REACT_ACT_ENVIRONMENT=true;Object.defineProperty(window,"crypto",{value:webcrypto,configurable:true});container=document.createElement("div");document.body.append(container);root=createRoot(container);popup={closed:false,focus:jest.fn()};opener=jest.spyOn(window,"open").mockReturnValue(popup);act(()=>root.render(<Fixture/>));});
afterEach(()=>{act(()=>root.unmount());container.remove();opener.mockRestore();});
function button(text){return [...container.querySelectorAll("button")].find(b=>b.textContent===text);}
test("staff can select a key, retain a single notes field and clear a reference",()=>{
  act(()=>{const select=container.querySelector("select");select.value="store";select.dispatchEvent(new Event("change",{bubbles:true}));});
  act(()=>button("從鑰匙管理選擇").click());
  const url=new URL(opener.mock.calls[0][0]);expect(url.origin).toBe(RENTAL_KEY_ORIGIN);expect(url.searchParams.get("nonce")).toHaveLength(48);
  const data={type:RENTAL_KEY_MESSAGE,nonce:url.searchParams.get("nonce"),key:{id:"12",name:"金捷市",slot:"A01",status:"out"}};
  act(()=>window.dispatchEvent(new MessageEvent("message",{origin:"https://evil.test",source:popup,data})));expect(container.querySelector("output").textContent).toBe("");
  act(()=>window.dispatchEvent(new MessageEvent("message",{origin:RENTAL_KEY_ORIGIN,source:popup,data})));
  expect(container.querySelector("output").textContent).toBe("12");expect(container.textContent).toContain("這把鑰匙目前已借出");expect(container.querySelectorAll("textarea")).toHaveLength(1);
  expect(container.querySelector("textarea").value).toContain("鑰匙在樂善店");
  act(()=>button("解除連結").click());expect(container.querySelector("output").textContent).toBe("");expect(container.querySelector("textarea").value).toContain("鑰匙在樂善店");
});
test("blocked popups offer a retry and leave form contents unchanged",()=>{opener.mockReturnValue(null);act(()=>{const s=container.querySelector("select");s.value="store";s.dispatchEvent(new Event("change",{bubbles:true}));});act(()=>button("從鑰匙管理選擇").click());expect(container.textContent).toContain("允許開啟彈出視窗");expect(container.querySelector("output").textContent).toBe("");});
