const { decryptSnapshot, lookupSnapshot } = require("./cloud-reference");
const envelope = require("../_data/crm-reference-snapshot.json");
let snapshot;

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

async function readMarketReference(query) {
  // Only called after per-request identity verification in the API route.
  // The encrypted bundle is server-only; queries never contact the Mac or Firestore.
  if (!snapshot) snapshot = decryptSnapshot(envelope, process.env.CRM_REFERENCE_SNAPSHOT_KEY);
  return lookupSnapshot(query, snapshot);
}

module.exports = { referenceQuery, readMarketReference };
