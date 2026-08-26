import { matchPropertiesForNeed, reverseMatchProperty } from "./needsMatch";

const baseNeed = {
  areas: [{ city: "桃園市", district: "龜山區", community: "" }],
  budgetMax: "1800",
  roomsMin: "2",
  criteriaLevels: { rooms: "preferred" },
};

const property = (overrides = {}) => ({
  id: "p1", status: "active", title: "A7 兩房平車", address: "桃園市龜山區文化一路",
  totalPrice: "1750", layout: "2/2/1", category: "電梯大樓", parkingCount: "1",
  ...overrides,
});

test("保留區域硬篩與預算 10% 容忍", () => {
  expect(matchPropertiesForNeed(baseNeed, [property({ address: "台北市信義區" })])).toHaveLength(0);
  expect(matchPropertiesForNeed(baseNeed, [property({ totalPrice: "1900" })])).toHaveLength(1);
  expect(matchPropertiesForNeed(baseNeed, [property({ totalPrice: "2000" })])).toHaveLength(0);
});

test("必要條件不符淘汰，偏好條件不符則保留並扣分", () => {
  const oneRoom = property({ layout: "1/1/1" });
  const preferred = matchPropertiesForNeed(baseNeed, [oneRoom]);
  expect(preferred).toHaveLength(1);
  expect(preferred[0].percent).toBeLessThan(100);
  expect(preferred[0].missedReasons).toContain("房數不符");
  expect(matchPropertiesForNeed({ ...baseNeed, criteriaLevels: { rooms: "required" } }, [oneRoom])).toHaveLength(0);
});

test("排除條件命中直接淘汰", () => {
  expect(matchPropertiesForNeed({ ...baseNeed, excludeGroundFloor: true }, [property({ floor: "1/15" })])).toHaveLength(0);
  expect(matchPropertiesForNeed({ ...baseNeed, excludeMechanicalParking: true }, [property({ parkingDescription: "機械車位" })])).toHaveLength(0);
});

test("反向配對回傳買方客需與解釋理由", () => {
  const matches = reverseMatchProperty(property(), [{ ...baseNeed, id: "n1", contactName: "陳先生" }]);
  expect(matches[0].need.contactName).toBe("陳先生");
  expect(matches[0].percent).toBeGreaterThanOrEqual(90);
  expect(matches[0].reasons).toContain("區域相符");
});
