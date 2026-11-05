import test from "node:test";
import assert from "node:assert/strict";
import { propertyChoiceFields, propertyTagFields, sharedPropertyChoices, matchesPropertyTags, matchesPropertyFeature, uniqueChoices, filterPropertyChoices } from "./propertyChoices.js";
import { matchesPropertyKeyword } from "./propertyKeywordSearch.js";

test("共同選單去重、全半形一致，跨物件保留舊選項", () => {
  const saved = propertyChoiceFields({ tags: [" 邊間 ", "有裝潢", "邊間"], viewingMethod: "  鑰匙在樂善店  " });
  const removed = propertyChoiceFields({ ...saved, tags: [], viewingMethod: "提前一天預約" }, saved);
  const options = sharedPropertyChoices([removed, { tags: ["邊間", "Ａ７景觀"], viewingMethod: "提前一天預約" }]);
  assert.deepEqual(saved.tags, ["邊間", "有裝潢"]);
  assert.equal(saved.viewingMethod, "鑰匙在樂善店");
  assert.equal(options.tags.filter(x => x === "邊間").length, 1);
  assert.ok(options.tags.includes("有裝潢"));
  assert.deepEqual(new Set(options.viewingMethods), new Set(["提前一天預約", "鑰匙在樂善店"]));
  assert.deepEqual(uniqueChoices(["Ａ７", "a7", "", null, {}]), ["A7"]);
});
test("多標籤篩選需全部符合，不把共用選單當成案件特色", () => {
  const p = { tags: ["邊間", "有裝潢"], tagCatalog: ["雙陽台"] };
  assert.ok(matchesPropertyTags(p, []));
  assert.ok(matchesPropertyTags(p, ["邊間", "有裝潢"]));
  assert.equal(matchesPropertyTags(p, ["雙陽台"]), false);
  assert.equal(matchesPropertyKeyword(p, "雙陽台"), false);
  assert.ok(matchesPropertyKeyword({ ...p, area: "Ａ７重劃區" }, "a7 邊間"));
});
test("配對明確標籤並支援舊文字；移除的標籤不會因歷史或備註重複命中", () => {
  assert.ok(matchesPropertyFeature({ tags: ["邊間"] }, "邊間"));
  assert.equal(matchesPropertyFeature({ tags: ["非邊間"] }, "邊間"), false);
  assert.ok(matchesPropertyFeature({}, "衛浴開窗", "兩房 衛浴開窗"));
  assert.equal(matchesPropertyFeature({ tags: [], tagCatalog: ["邊間"] }, "邊間", "舊案名邊間兩房"), false);
});
test("編輯不變更帶看確認；記憶清單有上限且優先保留目前選擇", () => {
  const p = propertyChoiceFields({ viewingMethod: "隨時可看", tags: ["邊間"], tagCatalog: Array.from({length: 140}, (_, i) => `特色${i}`) });
  assert.equal(p.tagCatalog.length, 120);
  assert.equal(p.tagCatalog[0], "邊間");
  assert.equal("viewingStatus" in p, false);
  assert.equal("viewingConfirmedAt" in p, false);
});
test("輸入一字優先篩選既有標籤；精確、開頭、包含依序顯示", () => {
  assert.deepEqual(filterPropertyChoices(["邊間", "衛浴開窗", "窗", "窗景", "廁所開窗"], "窗"), ["窗", "窗景", "廁所開窗", "衛浴開窗"]);
  assert.deepEqual(filterPropertyChoices(["Ａ７", "a7", "邊間"], "a"), ["A7"]);
  assert.deepEqual(filterPropertyChoices(["邊間", "有裝潢"], "窗"), []);
});

test("清單快速儲存只修改標籤，保留歷史選項和其他案件資料", () => {
  const previous = { tags: ["邊間"], tagCatalog: ["有裝潢"], viewingMethod: "鑰匙在店裡", viewingStatus: "unknown", websitePublished: true, status: "active", totalPrice: 1500 };
  const before = structuredClone(previous);
  const patch = propertyTagFields([" 廁所開窗 ", "廁所開窗"], previous);
  assert.deepEqual(Object.keys(patch).sort(), ["tagCatalog", "tags"]);
  assert.deepEqual(patch.tags, ["廁所開窗"]);
  assert.deepEqual(patch.tagCatalog, ["廁所開窗", "邊間", "有裝潢"]);
  assert.deepEqual(previous, before);
  assert.equal(matchesPropertyFeature(patch, "邊間", "邊間兩房"), false);
  assert.deepEqual(propertyTagFields([], { ...previous, ...patch }).tags, []);
});
