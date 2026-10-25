export const MAP_BACKGROUND_STYLES = [
  { id: "positron", label: "極簡淺色", styleUrl: "https://tiles.openfreemap.org/styles/positron", swatch: "positron" },
  { id: "bright", label: "清楚街道", styleUrl: "https://tiles.openfreemap.org/styles/bright", swatch: "bright" },
  { id: "liberty", label: "柔和城市", styleUrl: "https://tiles.openfreemap.org/styles/liberty", swatch: "liberty" },
  { id: "dark", label: "深色夜景", styleUrl: "https://tiles.openfreemap.org/styles/dark", swatch: "dark" },
  { id: "pen", label: "鋼筆手繪", styleUrl: "https://tiles.openfreemap.org/styles/bright", swatch: "pen" },
  { id: "classic", label: "原始街道", styleUrl: null, swatch: "classic" },
];

export function getMapBackgroundStyle(id) {
  const migrated = { standard: "positron", soft: "positron", mono: "positron", warm: "bright" }[id] || id;
  return MAP_BACKGROUND_STYLES.find((style) => style.id === migrated) || MAP_BACKGROUND_STYLES[0];
}
