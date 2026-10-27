import { propertyAreaWithoutParking, formatPropertyAreaWithoutParking } from "./propertyAreaWithoutParking";

test("subtracts the parking area from the registered total, independent of common area", () => {
  expect(propertyAreaWithoutParking({ titlePing: 54.59, parkingPing: 11.01, commonAreaPing: 13.04 })).toBe(43.58);
  expect(propertyAreaWithoutParking({ titlePing: "54.59", parkingPing: "11.01", commonAreaPing: 24.05 })).toBe(43.58);
  expect(propertyAreaWithoutParking({ titlePing: 30, parkingPing: 30 })).toBe(0);
  expect(formatPropertyAreaWithoutParking({ titlePing: 30, parkingPing: 0 })).toBe("30 坪");
});

test("does not treat missing parking area as zero unless no parking is confirmed", () => {
  expect(propertyAreaWithoutParking({ titlePing: 30, parkingCount: 0 })).toBe(30);
  expect(propertyAreaWithoutParking({ titlePing: 30, parkingDescription: "無" })).toBe(30);
  for (const property of [
    {}, { titlePing: "", parkingPing: 2 }, { titlePing: 30 },
    { titlePing: 30, parkingPing: "", parkingCount: 1 },
    { titlePing: 30, parkingPing: -1 }, { titlePing: 30, parkingPing: 31 },
  ]) expect(formatPropertyAreaWithoutParking(property)).toBe("未提供");
});
