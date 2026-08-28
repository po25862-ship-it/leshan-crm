import { analyzeLineConversation, analysisNotes, parseLineChat } from "./lineConversationAnalyzer";

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
