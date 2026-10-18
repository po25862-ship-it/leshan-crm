const test = require("node:test");
const assert = require("node:assert/strict");
const iconv = require("iconv-lite");
const { targets, parseReport, classifyAddress, detailMetadata, formEncodeBig5 } = require("./road-keyword");

test("完整路段清單不重複，含林口及跨里道路", () => {
  assert.equal(targets.length, 244);
  assert(targets.some((item) => item.district === "林口區" && item.road === "文化二路"));
  assert(targets.some((item) => item.district === "龜山區" && item.road === "忠義路"));
  assert.equal(new Set(targets.map((item) => `${item.districtCode}:${item.road}`)).size, 244);
});

test("後台報表只接受有效頁面，保留官網連結資訊", () => {
  const target = targets.find((item) => item.district === "林口區" && item.road === "文化二路");
  const cells = ["1", "DE02505015<br>A9三房", "文化二路", "4.89", "30.76", "8/11", "", "30年", "3/2/2", "1", "1448", "空屋", "--", "經紀人", "<a href='https://www.twhg.com.tw/buy/DE02505015'>10</a>", "<textarea>近A9</textarea>"];
  const html = `<h1>物件查詢表</h1><table class='obj_table'><tr>${cells.map((cell) => `<td>${cell}</td>`).join("")}</tr></table>`;
  const rows = parseReport(iconv.encode(html, "big5"), target);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].listingNo, "DE02505015");
  assert.equal(rows[0].websitePublished, true);
  assert.equal(rows[0].totalPrice, 1448);
  assert.throws(() => parseReport(iconv.encode("<form name='user_pass1'>", "big5"), target));
  assert(formEncodeBig5("文化二路").includes("%"));
});

test("跨里道路只接受政府門牌明確落在上龜山者", () => {
  assert.equal(classifyAddress("桃園市龜山區忠義路三段１之１號八樓").village, "公西里");
  assert.equal(classifyAddress("桃園市龜山區忠義路二段２號").accepted, false);
  assert.equal(classifyAddress("桃園市龜山區華美街１２號").accepted, false);
  assert.equal(classifyAddress("新北市林口區文化二路一段１５號").accepted, true);
});

test("詳細頁擷取店別與類別", () => {
  const html = "<div>房屋型式：<br>電梯大樓</div><div>桃園南平直營店<br>店長：</div>";
  assert.deepEqual(detailMetadata(iconv.encode(html, "big5")), { category: "電梯大樓", store: "桃園南平直營店" });
});
