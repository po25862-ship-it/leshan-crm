import { displayPropertyAgent } from "./propertyAgent";

test("shows the imported developer name and phone without altering them", () => {
  expect(displayPropertyAgent("吳彥良 03-3281000")).toBe("吳彥良 03-3281000");
});

test("decodes numeric character references in legacy developer names", () => {
  expect(displayPropertyAgent("阮&#23032;臻 03-3281000")).toBe("阮姸臻 03-3281000");
});

test("makes missing developer data clear", () => {
  expect(displayPropertyAgent("  ")).toBe("尚未填寫");
});
