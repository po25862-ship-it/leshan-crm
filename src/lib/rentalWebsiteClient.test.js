/** @jest-environment node */
import { getIdToken } from "firebase/auth";
import { loadRentalWebsiteInfo, needsRentalWebsiteCheck } from "./rentalWebsiteClient";
jest.mock("firebase/auth", () => ({ getIdToken: jest.fn(async () => "test-token") }));
const url = "https://rent.591.com.tw/22258856";
beforeEach(() => { global.fetch = jest.fn(); getIdToken.mockResolvedValue("test-token"); });
test("concurrent source checks share one authenticated request and a fresh result is reused", async () => {
  const info = { url, status: "live", expiresOn: "2026-11-29", checkedAt: new Date().toISOString() };
  fetch.mockResolvedValue({ ok: true, json: async () => info });
  const user = { uid: "dedupe-test" };
  expect(await Promise.all([loadRentalWebsiteInfo(user, url), loadRentalWebsiteInfo(user, url)])).toEqual([info, info]);
  expect(fetch).toHaveBeenCalledTimes(1); expect(getIdToken).toHaveBeenCalledTimes(1);
  expect(fetch.mock.calls[0][1].headers.Authorization).toBe("Bearer test-token");
  await loadRentalWebsiteInfo(user, url); expect(fetch).toHaveBeenCalledTimes(1);
});
test("daily checks skip fresh source data but a new URL or stale data is checked again", () => {
  const now = Date.parse("2026-10-31T04:00:00Z"), row = { websiteUrl: url, websiteCheckedUrl: url, websiteCheckedAt: new Date(now - 1000).toISOString() };
  expect(needsRentalWebsiteCheck(row, now)).toBe(false);
  expect(needsRentalWebsiteCheck({ ...row, websiteCheckedAt: "2026-10-29T04:00:00Z" }, now)).toBe(true);
  expect(needsRentalWebsiteCheck({ ...row, websiteUrl: "https://rent.591.com.tw/12345678" }, now)).toBe(true);
  expect(needsRentalWebsiteCheck({ websiteUrl: "https://example.test/rental" }, now)).toBe(false);
});
test("manual refresh bypasses the cache, while a mismatched response is rejected", async () => {
  const info = { url, status: "unknown", expiresOn: "", checkedAt: new Date().toISOString() }, user = { uid: "refresh-test" };
  fetch.mockResolvedValue({ ok: true, json: async () => info });
  await loadRentalWebsiteInfo(user, url); await loadRentalWebsiteInfo(user, url, true); expect(fetch).toHaveBeenCalledTimes(2);
  fetch.mockResolvedValue({ ok: true, json: async () => ({ ...info, url: "https://rent.591.com.tw/12345678" }) });
  await expect(loadRentalWebsiteInfo(user, url, true)).rejects.toThrow("無法確認");
});
