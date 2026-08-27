import { getRecommendationStatus, isActiveRecommendation, recommendationCounts } from "./recommendationStatus";

test("converts legacy introduced flags to the new status", () => {
  expect(getRecommendationStatus({ introduced: true })).toBe("introduced");
  expect(getRecommendationStatus({ introduced: false })).toBe("pending");
});

test("keeps only pending and interested recommendations active", () => {
  expect(isActiveRecommendation({ status: "pending" })).toBe(true);
  expect(isActiveRecommendation({ status: "interested" })).toBe(true);
  expect(isActiveRecommendation({ status: "introduced" })).toBe(false);
  expect(isActiveRecommendation({ status: "notInterested" })).toBe(false);
});

test("counts all recommendation lifecycle states", () => {
  expect(recommendationCounts([
    { status: "pending" },
    { introduced: true },
    { status: "interested" },
    { status: "notInterested" },
  ])).toEqual({ total: 4, pending: 1, introduced: 1, interested: 1, notInterested: 1 });
});
