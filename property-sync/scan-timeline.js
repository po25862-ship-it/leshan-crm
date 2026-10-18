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

module.exports = { firstSeenFields, firstMissingFields, firstOnHoldFields };
