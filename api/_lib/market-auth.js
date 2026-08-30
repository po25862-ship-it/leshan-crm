const { applicationDefault, cert, getApps, initializeApp } = require("firebase-admin/app");
const { getAuth } = require("firebase-admin/auth");
const { getFirestore } = require("firebase-admin/firestore");

function firebaseCredential() {
  if (process.env.FIREBASE_SERVICE_ACCOUNT_JSON) {
    const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON);
    if (serviceAccount.private_key) {
      serviceAccount.private_key = serviceAccount.private_key.replace(/\\n/g, "\n");
    }
    return cert(serviceAccount);
  }
  return applicationDefault();
}

function ensureFirebaseAdmin() {
  if (getApps().length === 0) {
    initializeApp({ credential: firebaseCredential() });
  }
  return { auth: getAuth(), firestore: getFirestore() };
}

async function requireFirebaseUser(req) {
  const authorization = String(req.headers.authorization || "");
  if (!authorization.startsWith("Bearer ")) {
    const error = new Error("missing_bearer_token");
    error.statusCode = 401;
    throw error;
  }
  const { auth } = ensureFirebaseAdmin();
  try {
    return await auth.verifyIdToken(authorization.slice(7), true);
  } catch {
    const error = new Error("invalid_firebase_token");
    error.statusCode = 401;
    throw error;
  }
}

module.exports = { ensureFirebaseAdmin, requireFirebaseUser };
