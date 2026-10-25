import { getMapBackgroundStyle, MAP_BACKGROUND_STYLES } from "./shareMapStyles";

test("底圖提供四種不同風格，無效選項回到原色", () => {
  expect(MAP_BACKGROUND_STYLES).toHaveLength(4);
  expect(new Set(MAP_BACKGROUND_STYLES.map((style) => style.filter)).size).toBe(4);
  expect(getMapBackgroundStyle("soft").label).toBe("柔和淡彩");
  expect(getMapBackgroundStyle("unknown").id).toBe("standard");
});
