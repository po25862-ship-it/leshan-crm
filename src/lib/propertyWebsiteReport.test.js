import { analyzeWebsiteReport } from "./propertyWebsiteReport";
const now = Date.parse("2026-11-05T06:00:00Z");
const row = { listingNo: "DE02505030", websitePublished: true, websiteUrl: "https://www.twhg.com.tw/buy/DE02505030", officialStatusCheckedAt: "2026-11-05T01:00:00Z", officialStatusSource: "backendReport" };
const report = records => ({ schema: "leshan-official-status-v1", records });
const property = { id: "p1", listingNo: row.listingNo, title: "遠雄夏沐", websiteUrl: row.websiteUrl };
test("只修正缺少或不一致的狀態，既有相同資料不重寫", () => {
  const result = analyzeWebsiteReport(report([row]), [property], now);
  expect(result.updates[0]).toMatchObject({ id: "p1", patch: { websitePublished: true, officialStatusSource: "backendReport" } });
  expect(Object.keys(result.updates[0].patch).sort()).toEqual(["officialStatusCheckedAt", "officialStatusSource", "websitePublished", "websiteUrl"]);
  expect(analyzeWebsiteReport(report([row]), [{...property,websitePublished:true}], now)).toMatchObject({unchanged:1,updates:[]});
});
test("較新紀錄、找不到及重複委託的案件不覆寫", () => {
  expect(analyzeWebsiteReport(report([row]), [{...property,officialStatusCheckedAt:"2026-11-05T02:00:00Z"}], now)).toMatchObject({skipped:1,updates:[]});
  expect(analyzeWebsiteReport(report([row]), [], now)).toMatchObject({skipped:1,updates:[]});
  expect(analyzeWebsiteReport(report([row]), [property,{...property,id:'p2'}], now)).toMatchObject({skipped:1,updates:[]});
});
test("不接受不完整、重複、未確認、異常網址或未來時間的核對資料", () => {
  expect(()=>analyzeWebsiteReport({records:[row]},[property],now)).toThrow();
  expect(()=>analyzeWebsiteReport(report([row,row]),[property],now)).toThrow();
  for(const override of [{websitePublished:undefined},{websitePublished:'false'},{officialStatusSource:'unknown'},{websiteUrl:'https://evil.test'},{officialStatusCheckedAt:'2026-11-06T00:00:00Z'}]) {
    expect(()=>analyzeWebsiteReport(report([{...row,...override}]),[property],now)).toThrow();
  }
});
