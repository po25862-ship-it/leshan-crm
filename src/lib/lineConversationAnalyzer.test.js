import { analyzeLineConversation, analyzeSellerConversation, analyzeTeamConversation, analysisNotes, parseLineChat, sellerAnalysisNotes, teamAnalysisNotes } from "./lineConversationAnalyzer";

const SAMPLE = `[LINE] 與陳小姐的聊天記錄
儲存日期：2026/8/28 14:20

2026/8/27（四）
10:15\t劉昭佑\t想找哪一區與多少預算呢？
10:18\t陳小姐\t想找新竹市東區或竹北市，預算 1200-1600 萬，至少 3 房 2 衛
10:19\t陳小姐\t希望有平面車位、採光好，電梯大樓自住
10:25\t陳小姐\t這週六可以安排看屋嗎？也想了解貸款成數
`;

test("parses LINE txt export and multiline messages", () => {
  const parsed = parseLineChat(`${SAMPLE}10:30\t陳小姐\t第一行\n第二行`);
  expect(parsed.participants).toEqual(["劉昭佑", "陳小姐"]);
  expect(parsed.messages).toHaveLength(5);
  expect(parsed.messages[4].text).toBe("第一行\n第二行");
});

test("extracts CRM need fields and purchase signals", () => {
  const parsed = parseLineChat(SAMPLE);
  const result = analyzeLineConversation(parsed.messages, "陳小姐");
  expect(result.need.areas).toEqual(expect.arrayContaining([
    expect.objectContaining({ city: "新竹市", district: "東區" }),
    expect.objectContaining({ city: "新竹縣", district: "竹北市" }),
  ]));
  expect(result.need.budgetMin).toBe("1200");
  expect(result.need.budgetMax).toBe("1600");
  expect(result.need.roomsMin).toBe("3");
  expect(result.need.bathMin).toBe("2");
  expect(result.need.types).toContain("大樓");
  expect(result.need.parkingRequired).toBe(true);
  expect(result.signals).toContain("主動詢問看屋／約時間");
  expect(result.score).toBeGreaterThanOrEqual(75);
  expect(result.plainLanguageExplanation).toContain("這位買方");
  expect(result.evidence.length).toBeGreaterThan(0);
  expect(result.followUpMessage).toContain("您好");
  expect(analysisNotes(result)).toContain("建議下一步");
});

test("detects objections without forcing a high intent score", () => {
  const parsed = parseLineChat("2026/8/28\n09:00\t王先生\t這間太貴，頭期不夠，我再想想");
  const result = analyzeLineConversation(parsed.messages, "王先生");
  expect(result.objections).toEqual(expect.arrayContaining(["價格／預算疑慮", "貸款／頭期疑慮", "仍需與家人討論"]));
  expect(result.intentLevel).not.toBe("高");
});

test("does not map a shared district name to every Taiwan city", () => {
  const parsed = parseLineChat("2026/8/28\n09:00\t林小姐\t想找新竹市東區的三房");
  const result = analyzeLineConversation(parsed.messages, "林小姐");
  expect(result.need.areas).toEqual([expect.objectContaining({ city: "新竹市", district: "東區" })]);
});

test("analyzes seller motivation, pricing and listing signals", () => {
  const parsed = parseLineChat(`2026/8/28\n09:00\t林先生\t我換屋想賣新北市板橋區文化路一段100號的電梯大樓\n09:03\t林先生\t希望開價 2380 萬，底價 2200 萬，三個月內賣掉\n09:05\t林先生\t這週可以來現勘，我會準備權狀，也可以談專任委託`);
  const result = analyzeSellerConversation(parsed.messages, "林先生");
  expect(result.motivations).toContain("換屋");
  expect(result.listing.askingPrice).toBe("2380");
  expect(result.listing.floorPrice).toBe("2200");
  expect(result.listing.propertyAddress).toContain("文化路一段100號");
  expect(result.listing.agreementType).toBe("專任");
  expect(result.signals).toEqual(expect.arrayContaining(["願意安排到府估價／現勘", "提供地址、權狀或物件資料", "討論委託方式或期間"]));
  expect(result.score).toBeGreaterThanOrEqual(75);
  expect(result.plainLanguageExplanation).toContain("這位屋主");
  expect(result.evidence.length).toBeGreaterThan(0);
  expect(result.followUpMessage).toContain("現場");
  expect(sellerAnalysisNotes(result)).toContain("建議下一步");
});

test("detects seller commission and exclusive-listing objections", () => {
  const parsed = parseLineChat("2026/8/28\n09:00\t王先生\t我不急，仲介費太高，而且不要專任，多家仲介都可以賣");
  const result = analyzeSellerConversation(parsed.messages, "王先生");
  expect(result.objections).toEqual(expect.arrayContaining(["對仲介費／服務費有疑慮", "不願簽專任委託", "目前沒有急售壓力"]));
  expect(result.intentLevel).not.toBe("高");
});

test("extracts colleague requests, blockers, deadlines and priority", () => {
  const parsed = parseLineChat(`2026/8/28\n09:00\t小美\tCRM 沒有權限上傳物件照片，一直出現錯誤\n09:02\t小美\t麻煩今天下班前協助處理，明天要傳給屋主`);
  const result = analyzeTeamConversation(parsed.messages, "小美");
  expect(result.requestTypes).toEqual(expect.arrayContaining(["物件資料", "系統／權限"]));
  expect(result.blockers).toEqual(expect.arrayContaining(["權限或帳號受阻", "系統錯誤或操作受阻"]));
  expect(result.deadlines).toEqual(expect.arrayContaining(["今天", "明天"]));
  expect(result.requests[0]).toContain("麻煩");
  expect(result.score).toBeGreaterThanOrEqual(75);
  expect(result.plainLanguageExplanation).toContain("這項同事訴求");
  expect(result.evidence.length).toBeGreaterThan(0);
  expect(result.followUpMessage).toContain("收到");
  expect(teamAnalysisNotes(result)).toContain("建議下一步");
});
