export const MAP_BACKGROUND_STYLES = [
  { id: "standard", label: "標準彩色", filter: "none", swatch: "standard" },
  { id: "soft", label: "柔和淡彩", filter: "saturate(0.62) contrast(0.92) brightness(1.06)", swatch: "soft" },
  { id: "mono", label: "黑白街道", filter: "grayscale(1) contrast(0.88) brightness(1.1)", swatch: "mono" },
  { id: "warm", label: "暖色米白", filter: "sepia(0.35) saturate(0.85) brightness(1.04)", swatch: "warm" },
];

export function getMapBackgroundStyle(id) {
  return MAP_BACKGROUND_STYLES.find((style) => style.id === id) || MAP_BACKGROUND_STYLES[0];
}
