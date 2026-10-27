import commonArea from "./propertyCommonArea";
import { buildPropertySummary } from "./propertySummaryCanvas";

const { companyCommonAreaFields, EXCLUDING_PARKING } = commonArea;

test("company common area excludes parking exactly once and retains source figures", () => {
  const corrected = companyCommonAreaFields({ commonAreaPing: 24.05, parkingPing: 11.01 });
  expect(corrected).toEqual({ commonAreaPing: 13.04, commonAreaGrossPing: 24.05, commonAreaBasis: EXCLUDING_PARKING });
  expect(companyCommonAreaFields({ ...corrected, parkingPing: 11.01 })).toEqual(corrected);
  expect(companyCommonAreaFields({ commonAreaPing: 11.01, parkingPing: 11.01 }).commonAreaPing).toBe(0);
});

test("missing and contradictory parking areas are never blindly subtracted", () => {
  for (const parkingPing of [null, undefined, "", "invalid", -1, 30]) {
    expect(companyCommonAreaFields({ commonAreaPing: 24.05, parkingPing }).commonAreaPing).toBe(24.05);
  }
  expect(companyCommonAreaFields({ commonAreaPing: "", parkingPing: 11.01 })).toEqual({});
});

test("viewing summaries use the corrected area while preserving the registered total and parking", () => {
  const summary = buildPropertySummary({ titlePing: 54.59, commonAreaPing: 13.04, parkingPing: 11.01 });
  expect(summary.areas).toEqual(expect.arrayContaining([
    ["權狀坪數", "54.59 坪"], ["公設（不含車位）", "13.04 坪"], ["車位面積", "11.01 坪"],
  ]));
  expect(buildPropertySummary({ commonAreaPing: 0 }).areas[3]).toEqual(["公設（不含車位）", "0 坪"]);
});
