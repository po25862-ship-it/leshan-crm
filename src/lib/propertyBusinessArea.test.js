import { matchesPropertyBusinessArea, propertyBusinessAreaOptions } from "./propertyBusinessArea";

test("station groups include their subareas and respect the property's explicit business zone", () => {
  expect(matchesPropertyBusinessArea({ area: "Ａ７ 站重劃區-體育大學" }, "zone:A7")).toBe(true);
  expect(matchesPropertyBusinessArea({ title: "A9兩房車" }, "zone:A9")).toBe(true);
  expect(matchesPropertyBusinessArea({ area: "A8長庚生活圈", title: "近A7" }, "zone:A7")).toBe(false);
  expect(matchesPropertyBusinessArea({ area: "A70新城" }, "zone:A7")).toBe(false);
});

test("specific areas stay separate and options deduplicate equivalent names", () => {
  const properties = [{ area: "A7 重劃區" }, { area: "Ａ７重劃區" }, { area: "A7站重劃區-體育大學" }, {}];
  expect(propertyBusinessAreaOptions(properties)).toHaveLength(2);
  expect(matchesPropertyBusinessArea(properties[0], "area:A7重劃區")).toBe(true);
  expect(matchesPropertyBusinessArea(properties[2], "area:A7重劃區")).toBe(false);
  expect(matchesPropertyBusinessArea(properties[3], "missing")).toBe(true);
  expect(matchesPropertyBusinessArea(properties[3], "")).toBe(true);
});
