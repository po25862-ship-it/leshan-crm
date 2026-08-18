const ALLOWED_HOSTS = new Set(["twhg.com.tw", "www.twhg.com.tw"]);
const NOT_FOUND_MARKERS = [
  "找不到該物件",
  "<title>找不到此頁面</title>",
  '"statusCode",404',
];

module.exports = async function handler(req, res) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ status: "unknown", reason: "method_not_allowed" });
  }

  let target;
  try {
    target = new URL(String(req.query.url || ""));
  } catch {
    return res.status(400).json({ status: "unknown", reason: "invalid_url" });
  }

  if (
    target.protocol !== "https:" ||
    !ALLOWED_HOSTS.has(target.hostname.toLowerCase()) ||
    !target.pathname.startsWith("/buy/")
  ) {
    return res.status(400).json({ status: "unknown", reason: "unsupported_url" });
  }

  // AGID 不影響物件是否上架，移除後可共用 Vercel 快取，也避免把個人代碼傳到檢查紀錄。
  target.searchParams.delete("agid");

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10000);

  try {
    const response = await fetch(target.toString(), {
      redirect: "follow",
      signal: controller.signal,
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; LeshanCRM-LinkChecker/1.0)",
        Accept: "text/html,application/xhtml+xml",
      },
    });

    const html = await response.text();
    const isUnlisted = response.status === 404 || NOT_FOUND_MARKERS.some((marker) => html.includes(marker));
    const status = isUnlisted ? "unlisted" : response.ok ? "live" : "unknown";

    res.setHeader("Cache-Control", "s-maxage=21600, stale-while-revalidate=43200");
    return res.status(200).json({
      status,
      checkedAt: new Date().toISOString(),
      httpStatus: response.status,
    });
  } catch (error) {
    return res.status(200).json({
      status: "unknown",
      reason: error?.name === "AbortError" ? "timeout" : "request_failed",
      checkedAt: new Date().toISOString(),
    });
  } finally {
    clearTimeout(timeout);
  }
};
