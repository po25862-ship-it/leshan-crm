import { rentalExpiryReminders, rentalToday, rentalWebsiteKey, rentalWebsitePatch, rentalWebsiteState } from "./companyRentalWebsite";
import { buildCompanyRentalShare, companyRentalForm, rentalSavePayload, validateCompanyRental } from "./companyRental";
const url = "https://rent.591.com.tw/22258856", now = Date.parse("2026-10-31T04:00:00Z");
const rental = { status: "available", websiteUrl: url, shareWebsite: true, mandateExpiresOn: "2026-11-07", websiteExpiresOn: "2026-10-31" };
test("seven-day reminders and expiry use Taiwan dates; the last advertised date remains available", () => {
  expect(rentalExpiryReminders(rental, now).map(row => row.label)).toEqual(["委託剩 7 天到期", "591 刊登今天到期"]);
  expect(rentalWebsiteState(rental, now).available).toBe(true);
  expect(rentalToday(Date.parse("2026-10-31T16:01:00Z"))).toBe("2026-11-01");
  expect(rentalWebsiteState(rental, Date.parse("2026-10-31T16:01:00Z"))).toEqual(expect.objectContaining({ available: false, label: "目前無網站" }));
  expect(rentalExpiryReminders({ ...rental, status: "rented" }, now)).toEqual([]);
});
test("an expired mandate reminds colleagues without declaring a still-live website invalid", () => {
  const row = { ...rental, mandateExpiresOn: "2026-10-29", websiteExpiresOn: "2026-11-29" };
  expect(rentalExpiryReminders(row, now)[0]).toEqual(expect.objectContaining({ kind: "mandate", tone: "danger", days: -2 }));
  expect(rentalWebsiteState(row, now).available).toBe(true);
});
test("unavailable websites disappear from customer text while original URLs and mandate dates remain stored", () => {
  const input = { ...rental, websiteUnavailable: true, mandateExpiresOn: "2026-09-01" };
  const saved = rentalSavePayload(input, "draft"); expect(saved.listing.websiteUrl).toBe(url);
  const share = buildCompanyRentalShare(saved.listing, "", now);
  expect(share).toContain("目前無網站"); expect(share).not.toContain(url); expect(share).not.toContain("2026-09-01");
  expect(companyRentalForm(saved.listing, saved.internal, { uid: "staff" }).mandateExpiresOn).toBe("2026-09-01");
});
test("old URL checks never hide a new URL or import an old source expiry date", () => {
  const changed = { ...rental, websiteUrl: "https://rent.591.com.tw/12345678", websiteExpirySource: "591", websiteCheckStatus: "unlisted", websiteCheckedUrl: url, websiteExpiresOn: "2026-01-01" };
  expect(rentalWebsiteState(changed, now).available).toBe(true);
  expect(rentalExpiryReminders(changed, now).some(row => row.kind === "website")).toBe(false);
  expect(rentalWebsitePatch(changed, { url, status: "live", checkedAt: new Date(now).toISOString(), expiresOn: "2026-11-29" })).toBeNull();
});
test("unknown checks preserve data; renewed source dates refresh; explicit manual dates are respected", () => {
  const current = { ...rental, websiteExpirySource: "manual" }, info = { url, status: "live", expiresOn: "2026-11-29", checkedAt: new Date(now).toISOString() };
  expect(rentalWebsitePatch(current, { ...info, status: "unknown" })).toBeNull();
  expect(rentalWebsitePatch(current, info)).not.toHaveProperty("websiteExpiresOn");
  expect(rentalWebsitePatch({ ...current, websiteExpirySource: "591" }, info).websiteExpiresOn).toBe("2026-11-29");
  expect(rentalWebsitePatch(current, info, { overwriteExpiry: true }).websiteExpiresOn).toBe("2026-11-29");
  expect(rentalWebsitePatch({ ...current, websiteCheckedUrl: url, websiteCheckedAt: now + 1000 }, info)).toBeNull();
  expect(rentalWebsiteKey("https://www.591.com.tw/rent-detail-22258856.html?tracking=1")).toBe(url);
  expect(validateCompanyRental({ mandateExpiresOn: "2026-02-30" }, "draft")).toContain("委託到期日");
});
