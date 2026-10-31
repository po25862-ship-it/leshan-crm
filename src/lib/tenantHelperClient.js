import { getIdToken } from "firebase/auth";
export const TENANT_HELPER_API = "https://today-duty-line-bot.line-duty-bot-cloud.workers.dev/api/tenant-needs";
export async function tenantHelperRequest(user, action, code) {
  if (!["status","inspect","bind","unlink"].includes(action)) throw new Error("小幫手操作不正確。");
  const controller = new AbortController(), timer = setTimeout(()=>controller.abort(),25000);
  try {
    const token = await getIdToken(user);
    const response = await fetch(`${TENANT_HELPER_API}/${action}`, { method:action === "status" ? "GET" : "POST", headers:{ Authorization:`Bearer ${token}`, ...(action !== "status" ? {"Content-Type":"application/json"} : {}) }, ...(action !== "status" ? {body:JSON.stringify(action === "unlink" ? {} : {code})} : {}), signal:controller.signal });
    const data = await response.json();
    if (!response.ok) throw new Error(typeof data.message === "string" ? data.message : "暫時無法連接小幫手，請稍後再試。");
    return data;
  } finally { clearTimeout(timer); }
}
