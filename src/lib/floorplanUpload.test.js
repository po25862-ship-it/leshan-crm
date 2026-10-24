import { validateFloorplanFiles } from "./floorplanUpload";

const file = (type, size = 100) => ({ type, size });

test("accepts the image formats allowed by Storage rules", () => {
  expect(validateFloorplanFiles([file("image/jpeg"), file("image/png"), file("image/webp"), file("image/heic")])).toBeNull();
});

test("rejects unsupported files and images over 10 MB", () => {
  expect(validateFloorplanFiles([file("application/pdf")])).toMatch(/JPG/);
  expect(validateFloorplanFiles([file("image/gif")])).toMatch(/JPG/);
  expect(validateFloorplanFiles([file("image/jpeg", 10 * 1024 * 1024 + 1)])).toMatch(/10 MB/);
});
