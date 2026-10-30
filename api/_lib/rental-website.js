const { parse } = require("acorn");
const MAX_BYTES = 1500000;

function rental591Url(value) {
  try {
    const url = new URL(value);
    if (!["http:", "https:"].includes(url.protocol) || url.username || url.password || url.port) return "";
    const id = url.hostname === "rent.591.com.tw" ? url.pathname.match(/^\/(\d{5,12})\/?$/)?.[1]
      : ["www.591.com.tw", "591.com.tw"].includes(url.hostname) ? url.pathname.match(/^\/rent-detail-(\d{5,12})\.html$/)?.[1] : "";
    return id ? `https://rent.591.com.tw/${id}` : "";
  } catch { return ""; }
}
function validDay(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value || "")) return false;
  const date = new Date(value + "T00:00:00Z");
  return Number.isFinite(+date) && date.toISOString().slice(0, 10) === value;
}
function readNuxt(code) {
  if (code.length > 350000) return null;
  const ast = parse(code, { ecmaVersion: "latest" });
  const assignment = ast.body.find(node => node.type === "ExpressionStatement" && node.expression.type === "AssignmentExpression" &&
    node.expression.left.type === "MemberExpression" && node.expression.left.object.name === "window" && node.expression.left.property.name === "__NUXT__")?.expression;
  const call = assignment?.right;
  if (call?.type !== "CallExpression" || call.callee.type !== "FunctionExpression") return null;
  const env = new Map(); let nodes = 0;
  // Read data literals only. Website JavaScript is never executed, including calls/getters.
  function literal(node, depth = 0) {
    if (!node || depth > 40 || ++nodes > 60000) return undefined;
    if (node.type === "Literal") return ["string", "number", "boolean"].includes(typeof node.value) || node.value === null ? node.value : undefined;
    if (node.type === "Identifier") return env.get(node.name);
    if (node.type === "UnaryExpression" && node.operator === "-") { const n = literal(node.argument, depth + 1); return typeof n === "number" ? -n : undefined; }
    if (node.type === "ArrayExpression") return node.elements.map(item => literal(item, depth + 1));
    if (node.type === "ObjectExpression") {
      const result = Object.create(null);
      for (const prop of node.properties) {
        if (prop.type !== "Property" || prop.kind !== "init" || prop.method || prop.computed) continue;
        const key = prop.key.name ?? prop.key.value;
        if (typeof key === "string" && !["__proto__", "constructor", "prototype"].includes(key)) result[key] = literal(prop.value, depth + 1);
      }
      return result;
    }
    return undefined;
  }
  call.callee.params.forEach((param, i) => { if (param.type === "Identifier") env.set(param.name, literal(call.arguments[i])); });
  return literal(call.callee.body.body.find(node => node.type === "ReturnStatement")?.argument);
}
function inspectRentalHtml(html, url, httpStatus = 200) {
  const result = { url, status: "unknown", expiresOn: "" };
  const title = html.match(/<title[^>]*>([^<]*)<\/title>/i)?.[1] || "";
  if (/captcha|access denied|安全驗證|人機驗證|just a moment/i.test(title) || [401, 403, 429].includes(httpStatus)) return result;
  if ([404, 410].includes(httpStatus)) return { ...result, status: "unlisted" };
  if (httpStatus < 200 || httpStatus >= 300) return result;
  const id = new URL(url).pathname.slice(1);
  for (const match of html.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/gi)) {
    if (!/^\s*window\.__NUXT__\s*=/.test(match[1])) continue;
    try {
      const data = readNuxt(match[1]);
      const listing = data?.pinia?.["rent-detail-info"]?.ctx;
      if (String(listing?.id) !== id) continue;
      const status = listing.status === "open" && typeof listing.title === "string" && listing.title.trim() ? "live" : ["close", "closed", "deal", "expired", "off", "offline", "rented"].includes(listing.status) ? "unlisted" : "unknown";
      return { ...result, status, expiresOn: validDay(listing.endTime) ? listing.endTime : "" };
    } catch { /* A changed layout is unknown, never proof that a website has expired. */ }
  }
  return result;
}
async function readBounded(response) {
  if (Number(response.headers.get("content-length")) > MAX_BYTES) throw new Error("response_too_large");
  const reader = response.body.getReader(), chunks = []; let bytes = 0;
  try {
    for (;;) { const { value, done } = await reader.read(); if (done) break; bytes += value.byteLength; if (bytes > MAX_BYTES) throw new Error("response_too_large"); chunks.push(Buffer.from(value)); }
    return Buffer.concat(chunks).toString("utf8");
  } finally { await reader.cancel().catch(() => {}); }
}
async function checkRentalWebsite(value, { fetcher = fetch, now = () => new Date() } = {}) {
  const url = rental591Url(value);
  if (!url) throw new Error("unsupported_url");
  const checkedAt = now().toISOString();
  try {
    const response = await fetcher(url, { redirect: "manual", signal: AbortSignal.timeout(12000), headers: { Accept: "text/html", "Accept-Language": "zh-TW" } });
    // Never follow a redirect to another host, private IP, login page or unrelated listing.
    if (response.status >= 300 && response.status < 400) return { url, status: "unknown", expiresOn: "", checkedAt };
    return { ...inspectRentalHtml(await readBounded(response), url, response.status), checkedAt };
  } catch { return { url, status: "unknown", expiresOn: "", checkedAt }; }
}
module.exports = { rental591Url, readNuxt, inspectRentalHtml, checkRentalWebsite };
