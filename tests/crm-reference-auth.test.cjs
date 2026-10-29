const test = require("node:test");
const assert = require("node:assert/strict");
const { verifyCrmReferenceUser } = require("../api/_lib/crm-reference-auth");
const request = { headers: { authorization: "Bearer fixture-token-with-sufficient-length" } };
const claims = { uid: "fixture-user", aud: "leshan-crm", iss: "https://securetoken.google.com/leshan-crm", auth_time: 1000 };
const options = (account = {}) => ({ verifyToken: async () => claims, fetcher: async (url, req) => {
  assert.ok(url.startsWith("https://identitytoolkit.googleapis.com/v1/accounts:lookup?key="));
  assert.equal(req.redirect, "error");
  assert.equal(JSON.parse(req.body).idToken, request.headers.authorization.slice(7));
  return { ok: true, json: async () => ({ users: [{ localId: "fixture-user", validSince: "999", ...account }] }) };
} });
test("main API verifies Firebase identity before checking current account status", async () => {
  assert.deepEqual(await verifyCrmReferenceUser(request, options()), { uid: "fixture-user" });
});
test("wrong project, issuer or invalid JWT cannot access the source", async () => {
  for (const bad of [{ ...claims, aud: "another-project" }, { ...claims, iss: "https://untrusted.invalid" }]) {
    let calls = 0;
    await assert.rejects(verifyCrmReferenceUser(request, { verifyToken: async () => bad, fetcher: async () => { calls++; } }));
    assert.equal(calls, 0);
  }
  await assert.rejects(verifyCrmReferenceUser(request, { verifyToken: async () => { throw new Error("invalid signature"); } }));
});
test("disabled, revoked, deleted and unknown account states fail closed", async () => {
  for (const bad of [{ disabled: true }, { validSince: "1001" }, { localId: "another-user" }, { validSince: null }]) {
    await assert.rejects(verifyCrmReferenceUser(request, options(bad)));
  }
});
test("official account verification failure cannot become successful authentication", async () => {
  await assert.rejects(verifyCrmReferenceUser(request, { verifyToken: async () => claims, fetcher: async () => ({ ok: false }) }));
  await assert.rejects(verifyCrmReferenceUser({ headers: {} }, options()));
});
