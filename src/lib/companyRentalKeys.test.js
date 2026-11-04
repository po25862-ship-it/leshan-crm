import { RENTAL_FORM_DEFAULTS, companyRentalForm, rentalSavePayload, buildCompanyRentalShare } from "./companyRental";
import { RENTAL_KEY_ORIGIN, RENTAL_KEY_MESSAGE, parseRentalKey, encodeRentalKey, rentalKeyUrl, rentalViewingNotes, rentalKeySelection } from "./companyRentalKeys";
const key = { id: "123", name: "金捷市兩房", slot: "A18", status: "out", borrowerPhone: "secret" };
test("legacy key notes merge without loss and do not duplicate on reopening", () => {
  const form = companyRentalForm({}, { viewingInstructions: "提前一天預約", keyInfo: "鑰匙樂善店，門禁用感應扣" }, {uid:"staff"});
  expect(form.viewingInstructions).toBe("提前一天預約\n鑰匙／門禁：鑰匙樂善店，門禁用感應扣"); expect(form.keyInfo).toBe("");
  expect(companyRentalForm({}, form, {uid:"staff"}).viewingInstructions).toBe(form.viewingInstructions);
});
test("a selected reference remains private and customer shares contain neither key nor door notes", () => {
  const keyInfo = encodeRentalKey(key), form = {...RENTAL_FORM_DEFAULTS, title:"測試租屋", keyInfo, viewingInstructions:"內部取鑰匙說明", rent:28000};
  expect(parseRentalKey(keyInfo)).toEqual({id:"123",name:"金捷市兩房",slot:"A18",status:"out"});
  const payload=rentalSavePayload(form,"draft");
  expect(payload.internal.keyInfo).toBe(keyInfo); expect(payload.listing.keyInfo).toBeUndefined();
  expect(buildCompanyRentalShare({...payload.listing,...payload.internal})).not.toMatch(/A18|取鑰匙|leshan-key/);
  expect(rentalViewingNotes({keyInfo,viewingInstructions:"提前預約"})).toBe("提前預約");
  expect(rentalKeyUrl(key)).toBe(`${RENTAL_KEY_ORIGIN}/full?key=123`);
});
test("messages must match the trusted origin, popup, nonce and strictly bounded key shape", () => {
  const popup={},base={origin:RENTAL_KEY_ORIGIN,source:popup,data:{type:RENTAL_KEY_MESSAGE,nonce:"random",key}};
  expect(rentalKeySelection(base,popup,"random")?.id).toBe("123");
  for(const event of [{...base,origin:"https://evil.test"},{...base,source:{}},{...base,data:{...base.data,nonce:"other"}},{...base,data:{...base.data,key:{...key,id:"../unsafe"}}}])expect(rentalKeySelection(event,popup,"random")).toBeNull();
  expect(parseRentalKey("leshan-key:v1:{bad")).toBeNull(); expect(rentalKeyUrl({...key,id:"javascript:alert(1)"})).toBe("");
});
