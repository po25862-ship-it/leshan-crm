// Keep the first observed events stable even when a property is scanned again.
function firstSeenFields(existing, nowIso) {
  if (existing?.firstSeenAt) return {};
  return {
    firstSeenAt: nowIso,
    firstSeenAtSource: existing ? "tracking-start" : "new",
  };
}

function firstMissingFields(existing, nowIso) {
  if (existing?.firstMissingAt) return {};
  const priorMissingAt = Number(existing?.missingSyncCount || 0) === 1 && existing?.lastMissingAt;
  return {
    firstMissingAt: priorMissingAt || nowIso,
    firstMissingAtSource: priorMissingAt ? "previous-scan" : Number(existing?.missingSyncCount || 0) > 0 ? "tracking-start" : "new",
  };
}

function firstOnHoldFields(existing, nowIso) {
  return existing?.firstOnHoldAt ? {} : { firstOnHoldAt: nowIso };
}

// A four-store report cannot prove that a property found through a company-wide
// road search has disappeared. Only the source that covers it may do that.
function shouldMarkFourStoreMissing(existing, incomingByNo) {
  return Boolean(existing?.listingNo)
    && existing.syncCoverage !== "roadKeyword"
    && !incomingByNo.has(String(existing.listingNo).trim())
    && (existing.status || "active") === "active";
}

module.exports = { firstSeenFields, firstMissingFields, firstOnHoldFields, shouldMarkFourStoreMissing };
