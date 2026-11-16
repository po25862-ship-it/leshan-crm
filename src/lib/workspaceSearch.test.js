import { searchWorkspace } from "./workspaceSearch";

const find = (data, key) => searchWorkspace({ uid: "me", ...data }).find(group => group.key === key);

test("matches fullwidth case numbers, roads, business areas, tags and responsible agents", () => {
  const properties = [{ id: "p", listingNo: "DE02503251", title: "新潤翡麗三房車", address: "桃園市龜山區文化二路", area: "A7重劃區", agentInfo: "董韋伶 03-3288283", tags: ["邊間"], status: "onHold" }];
  for (const query of ["ＤＥ０２５０３２５１", "文化二路", "a7 董韋伶", "邊間"]) expect(find({ query, properties }, "properties").rows[0]).toMatchObject({ id: "p", status: "暫時不賣", to: "/properties?open=p" });
  expect(find({ query: "不存在", properties }, "properties").count).toBe(0);
});

test("shared needs cannot be found or exposed through private names, titles and notes", () => {
  const needs = [{ id: "n", ownerUid: "someone-else", shared: true, title: "隱私姓名的需求", privateTitle: "私密", contactName: "隱私姓名", notes: "特殊暗號", shareAlias: "A7三房", areas: [{ city: "桃園市", district: "龜山區" }] }];
  for (const query of ["隱私姓名", "私密", "特殊暗號"]) expect(find({ query, needs }, "needs").count).toBe(0);
  expect(find({ query: "A7", needs }, "needs").rows[0]).toMatchObject({ title: "A7三房", to: "/needs?open=n" });
  expect(find({ query: "隱私姓名", needs: [{ ...needs[0], ownerUid: "me" }] }, "needs").count).toBe(1);
});

test("finds only buyer-tagged contacts, normalizes phone punctuation, and builds safe links", () => {
  const buyers = [{ id: "a&b", name: "王先生", phone: "0912-345-678", source: "591", tags: ["買方"] }, { id: "s", name: "王先生賣方", tags: ["賣方"] }];
  expect(find({ query: "０９１２３４５６７８", buyers }, "buyers").rows[0]).toMatchObject({ title: "王先生", to: "/buyers?open=a%26b" });
  expect(find({ query: "王先生", buyers }, "buyers").count).toBe(1);
  expect(find({ query: "591", buyers }, "buyers").count).toBe(1);
});

test("keeps result groups separate, prioritizes exact matches and shows total before limiting", () => {
  const properties = Array.from({ length: 7 }, (_, i) => ({ id: `p${i}`, title: `金捷市${i}` }));
  properties.push({ id: "exact", title: "金捷市" });
  const rentals = [{ id: "r", title: "金捷市租屋", status: "paused", agentName: "業務甲" }];
  const groups = searchWorkspace({ query: "金捷市", properties, rentals, uid: "me" });
  expect(groups[0]).toMatchObject({ count: 8 });
  expect(groups[0].rows).toHaveLength(4);
  expect(groups[0].rows[0].id).toBe("exact");
  expect(groups[3].rows[0]).toMatchObject({ status: "暫時不租", to: "/company-rentals?rentalOpen=r" });
  expect(searchWorkspace({ query: "　 " })).toEqual([]);
});
