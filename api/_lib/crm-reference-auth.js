const { initializeApp, getApps } = require("firebase-admin/app");
const { getAuth } = require("firebase-admin/auth");

const PROJECT_ID = "leshan-crm";
// This is the same public Firebase Web API key already shipped in src/firebase.js,
// not a service-account credential. accounts:lookup is Google's documented API.
const WEB_API_KEY = "AIzaSyDiGtIemWS0C4Pb-fNFBjDnoa2Z6ETwics";
const APP_NAME = "crm-reference-public-verifier";

function localVerifier() {
  const app = getApps().find((a) => a.name === APP_NAME) || initializeApp({ projectId: PROJECT_ID }, APP_NAME);
  return (token) => getAuth(app).verifyIdToken(token);
}

function rejected() {
  return Object.assign(new Error("authentication_required"), { statusCode: 401 });
}

async function verifyCrmReferenceUser(req, { verifyToken, fetcher = fetch } = {}) {
  const authorization = String(req.headers.authorization || "");
  if (!authorization.startsWith("Bearer ") || authorization.length < 20 || authorization.length > 9000) throw rejected();
  const token = authorization.slice(7);
  try {
    // Firebase Admin SDK verifies Google's signature, expiration, aud and issuer
    // here in the main API. No trust is delegated to the market data source.
    const claims = await (verifyToken || localVerifier())(token);
    if (claims.aud !== PROJECT_ID || claims.iss !== `https://securetoken.google.com/${PROJECT_ID}` || !claims.uid) throw rejected();
    // Preserve disabled-account and token-revocation checks without an admin key.
    // No profile data or tokens are returned, logged, cached or persisted.
    const response = await fetcher(`https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${WEB_API_KEY}`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ idToken: token }), redirect: "error", signal: AbortSignal.timeout(8000),
    });
    if (!response.ok) throw rejected();
    const payload = await response.json();
    const account = payload.users?.find((u) => u.localId === claims.uid);
    const validSince = Number(account?.validSince);
    const authTime = Number(claims.auth_time);
    if (!account || account.disabled === true || account.validSince == null || !Number.isFinite(validSince) || !Number.isFinite(authTime) || authTime < validSince) throw rejected();
    return { uid: claims.uid };
  } catch { throw rejected(); }
}

module.exports = { verifyCrmReferenceUser };
