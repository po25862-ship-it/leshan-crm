export const MAIN_OWNER_UID = "KiYlsnWcChW5muRkG167r7Mi1132";
export const MAIN_OWNER_AGID = "06459";

// 將網址中的 agid 換成目前登入者自己的代碼。
// 傳入空字串時會移除既有 agid，避免同事尚未設定時誤用別人的代碼。
export function withAgid(url, agid = MAIN_OWNER_AGID) {
  if (!url) return url;
  const cleanAgid = String(agid || "").trim();
  try {
    const parsed = new URL(url);
    if (cleanAgid) parsed.searchParams.set("agid", cleanAgid);
    else parsed.searchParams.delete("agid");
    return parsed.toString();
  } catch {
    const [withoutHash, hash = ""] = String(url).split("#", 2);
    const questionAt = withoutHash.indexOf("?");
    const pathname = questionAt >= 0 ? withoutHash.slice(0, questionAt) : withoutHash;
    const query = questionAt >= 0 ? withoutHash.slice(questionAt + 1) : "";
    const params = new URLSearchParams(query);
    if (cleanAgid) params.set("agid", cleanAgid);
    else params.delete("agid");
    const nextQuery = params.toString();
    return `${pathname}${nextQuery ? `?${nextQuery}` : ""}${hash ? `#${hash}` : ""}`;
  }
}

// 資料庫只保存不綁定任何業務員的乾淨網址；顯示或分享時才套用個人 agid。
export function withoutAgid(url) {
  return withAgid(url, "");
}
