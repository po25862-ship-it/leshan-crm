const { createPublicPropertyMapHandler } = require("./_lib/public-property-map");

// Reuse the CRM deployment's existing Firebase Admin setup. Only initialize it
// after the server-to-server feed token has been checked.
module.exports = createPublicPropertyMapHandler(() => {
  const { ensureFirebaseAdmin } = require("./_lib/market-auth");
  return ensureFirebaseAdmin();
});
