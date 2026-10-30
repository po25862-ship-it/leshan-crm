import source from "./a7-community-options.json";
import { A7_RENTAL_COMMUNITIES, searchRentalCommunities } from "./rentalCommunities";

test("the rental list includes the entire imported A7 master without duplicate communities", () => {
  expect(A7_RENTAL_COMMUNITIES).toHaveLength(source.communities.length);
  expect(A7_RENTAL_COMMUNITIES.length).toBeGreaterThan(90);
  expect(new Set(A7_RENTAL_COMMUNITIES.map(row => row.name)).size).toBe(A7_RENTAL_COMMUNITIES.length);
  expect(A7_RENTAL_COMMUNITIES).toEqual(expect.arrayContaining([
    expect.objectContaining({ name: "富宇富御" }), expect.objectContaining({ name: "智匯學" }),
  ]));
});
test("search accepts aliases, variant Chinese characters and fullwidth Latin names", () => {
  expect(searchRentalCommunities("華悦城").map(row => row.name)).toEqual(["華悅城"]);
  expect(searchRentalCommunities("新潤興業鉑麗").map(row => row.name)).toEqual(["新潤鉑麗／新潤翡麗2"]);
  expect(searchRentalCommunities("鴻廣新 ａ７").map(row => row.name)).toEqual(["鴻廣新A7"]);
  expect(searchRentalCommunities("")).toEqual(A7_RENTAL_COMMUNITIES);
});
