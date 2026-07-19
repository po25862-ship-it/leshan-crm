// 把完整地址截斷到「路/街/大道」加上段數就好，去掉巷、弄、號、樓等細節
// 例如："桃園市龜山區華亞三路39巷23號6樓" -> "桃園市龜山區華亞三路"
export function truncateAddress(address) {
  if (!address) return "";
  const match = address.match(/^(.*?(?:路|街|大道))([一二三四五六七八九十\d]+段)?/);
  return match ? match[0] : address;
}
