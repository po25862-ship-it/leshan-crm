import { getMapBackgroundStyle, MAP_BACKGROUND_STYLES } from "./shareMapStyles";

test("底圖提供真正不同的地圖樣式，舊的調色選項移至新版淺色圖", () => {
  expect(MAP_BACKGROUND_STYLES).toHaveLength(6);
  expect(new Set(MAP_BACKGROUND_STYLES.filter((style) => style.styleUrl).map((style) => style.styleUrl)).size).toBe(4);
  expect(getMapBackgroundStyle("bright").label).toBe("清楚街道");
  expect(getMapBackgroundStyle("pen").label).toBe("鋼筆手繪");
  expect(getMapBackgroundStyle("soft").id).toBe("positron");
  expect(getMapBackgroundStyle("unknown").id).toBe("positron");
});
