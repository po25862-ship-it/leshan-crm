const { validatePropertySheetUrl } = require("../../api/_lib/property-sheet-url");

test("accepts only this CRM bucket's property sheet links", () => {
  const valid = "https://firebasestorage.googleapis.com/v0/b/leshan-crm.firebasestorage.app/o/properties%2Fabc123%2Fsheets%2Fsheet.jpg?alt=media&token=12345678-1234-1234-1234-123456789012";
  expect(validatePropertySheetUrl(valid)).toBe(valid);
  expect(validatePropertySheetUrl(valid.replace("sheets", "floorplans"))).toBeNull();
  expect(validatePropertySheetUrl(valid.replace("leshan-crm.firebasestorage.app", "another-bucket.app"))).toBeNull();
  expect(validatePropertySheetUrl(valid.replace("firebasestorage.googleapis.com", "example.com"))).toBeNull();
  expect(validatePropertySheetUrl(valid.replace("?alt=media&", "?"))).toBeNull();
});
