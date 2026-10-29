const REFERENCE_URL = "https://market.lkgsliu.com/crm-reference";
const CACHE_MS = 60_000;
const cache = new Map();

function referenceQuery(body) {
  if (!body || typeof body !== "object" || Array.isArray(body)) return null;
  const query = {};
  for (const key of ["address", "communityName", "district"]) {
    const value = body[key] ?? "";
    if (typeof value !== "string" || value.length > 240) return null;
    query[key] = value.trim();
  }
  return query.address || query.communityName ? query : null;
}

async function readMarketReference(query, token, { refresh = false, fetcher = fetch, now = Date.now() } = {}) {
  const key = JSON.stringify(query);
  const previous = cache.get(key);
  if (!refresh && previous && now - previous.at < CACHE_MS) return previous.data;
  const response = await fetcher(REFERENCE_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json", "User-Agent": "LeshanCRM-Reference/1.0 (+https://leshan-crm.vercel.app)", Authorization: `Bearer ${token}` },
    body: JSON.stringify(query),
    signal: AbortSignal.timeout(12_000),
    redirect: "error",
  });
  if (!response.ok) {
    const error = new Error("market_reference_unavailable");
    error.upstreamStatus = response.status;
    throw error;
  }
  const text = await response.text();
  if (text.length > 2_000_000) throw new Error("invalid_reference_response");
  const data = JSON.parse(text);
  if (!data || !Array.isArray(data.deals) || !(data.community === null || (typeof data.community?.id === "string" && typeof data.community?.name === "string"))) {
    throw new Error("invalid_reference_response");
  }
  if (cache.size >= 256) cache.clear();
  cache.set(key, { at: now, data });
  return data;
}

module.exports = { referenceQuery, readMarketReference };
