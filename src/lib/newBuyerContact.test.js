import { newBuyerContact } from "./newBuyerContact";

test("從物件頁快速新增的客戶歸目前使用者所有且有買方標籤", () => {
  const buyer = newBuyerContact({ name: " 王先生 ", phone: " 0912-345-678 ", notes: " 看 A7 " }, "current-user");
  expect(buyer).toEqual(expect.objectContaining({
    name: "王先生", phone: "0912-345-678", notes: "看 A7",
    tags: ["買方"], ownerUid: "current-user", lastModifiedByUid: "current-user", sharedWith: [],
  }));
  expect(buyer.lastContactDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
});
