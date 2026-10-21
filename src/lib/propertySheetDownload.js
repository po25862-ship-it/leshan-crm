import { getIdToken } from "firebase/auth";

const FIREBASE_SHEET_PREFIX = "https://firebasestorage.googleapis.com/v0/b/leshan-crm.firebasestorage.app/o/";

export async function downloadPropertySheet(url, user) {
  const isFirebaseSheet = url.startsWith(FIREBASE_SHEET_PREFIX);
  if (isFirebaseSheet && !user) throw new Error("請先登入再製作 PDF");
  const response = isFirebaseSheet
    ? await fetch("/api/property-sheet", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${await getIdToken(user)}`,
      },
      body: JSON.stringify({ url }),
    })
    : await fetch(url, { credentials: "omit" });
  if (!response.ok) {
    if (response.status === 401) throw new Error("登入已過期，請重新整理後再試");
    if (response.status === 413) throw new Error("檔案過大，無法透過網站讀取");
    throw new Error(`檔案下載失敗（${response.status}）`);
  }
  return {
    bytes: new Uint8Array(await response.arrayBuffer()),
    contentType: response.headers.get("content-type") || "",
  };
}
