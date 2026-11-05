const test = require("node:test");
const assert = require("node:assert/strict");
const { parseOfficialStatusRows, officialStatusFields } = require("./official-status");
const report = cell => `<table><tr><td>銷售表</td><td>案名</td><td>官網點閱</td></tr><tr><td><a href="print">123</a></td><td>DE02505030 遠雄夏沐</td><td>${cell}</td></tr></table>`;
test("只看官網點閱欄的正確物件連結，不看其他欄數字", () => {
  assert.equal(parseOfficialStatusRows(report('<a href="https://www.twhg.com.tw/buy/DE02505030">0</a>')).get("DE02505030").websitePublished, true);
  assert.equal(parseOfficialStatusRows(report('78')).get("DE02505030").websitePublished, false);
  assert.equal(parseOfficialStatusRows(report('')).get("DE02505030").websitePublished, false);
  assert.equal(parseOfficialStatusRows(report('<a href="https://example.com/buy/DE02505030">1</a>')).size, 0);
  assert.equal(parseOfficialStatusRows(report('<a href="https://www.twhg.com.tw/buy/DD02505030">1</a>')).size, 0);
});
test("同步同編號的其他紀錄只帶官網欄位，不影響售屋狀態或手填標籤", () => {
  const fields = officialStatusFields({listingNo:'DE02505030',websitePublished:true,officialStatusCheckedAt:'2026-11-05T00:00:00Z',status:'onHold',tags:['邊間']});
  assert.equal(fields.websitePublished,true);
  assert.equal(fields.websiteUrl,'https://www.twhg.com.tw/buy/DE02505030');
  assert.equal('status' in fields,false);
  assert.equal('tags' in fields,false);
  assert.equal(officialStatusFields({listingNo:'DE02505030'}),null);
});
test("沒有官網欄的版面無法判斷，不清空既有狀態；支援字母混合委託號", () => {
  assert.equal(parseOfficialStatusRows('<tr><td>123</td><td>DE02505030</td><td>4</td></tr>').size, 0);
  assert.equal(parseOfficialStatusRows(report('<a href="https://www.twhg.com.tw/buy/DE02505030">1</a>').replaceAll('DE02505030', 'D5C2609002')).get('D5C2609002').websitePublished, true);
});
