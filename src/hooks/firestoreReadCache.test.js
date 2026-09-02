import { loadReadCache, subscribeReadCache, updateReadCache } from "./firestoreReadCache";

test("deduplicates concurrent reads for the same query", async () => {
  const loader = jest.fn(async () => [{ id: "one" }]);
  const key = "test::concurrent";

  const [first, second] = await Promise.all([
    loadReadCache(key, loader),
    loadReadCache(key, loader),
  ]);

  expect(loader).toHaveBeenCalledTimes(1);
  expect(first).toEqual([{ id: "one" }]);
  expect(second).toEqual(first);
});

test("shares local updates with every subscriber", () => {
  const key = "test::subscribers";
  const first = jest.fn();
  const second = jest.fn();
  const unsubscribeFirst = subscribeReadCache(key, first);
  const unsubscribeSecond = subscribeReadCache(key, second);

  updateReadCache(key, [{ id: "saved" }]);

  expect(first).toHaveBeenLastCalledWith(expect.objectContaining({ data: [{ id: "saved" }] }));
  expect(second).toHaveBeenLastCalledWith(expect.objectContaining({ data: [{ id: "saved" }] }));
  unsubscribeFirst();
  unsubscribeSecond();
});
