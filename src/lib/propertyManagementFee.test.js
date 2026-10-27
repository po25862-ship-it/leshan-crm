import { getPropertyManagementFee, formatPropertyManagementFee, managementFeeImportFields } from "./propertyManagementFee";
import { buildPropertySummary } from "./propertySummaryCanvas";

test("distinguishes a zero management fee from unknown and explicitly cleared data", () => {
  expect(formatPropertyManagementFee({ managementFee: 0 })).toBe("0 元／月");
  expect(formatPropertyManagementFee({})).toBe("");
  expect(getPropertyManagementFee({ customFields: [{ label: "管理費（元／月）", value: "1800" }] })).toBe("1800");
  expect(getPropertyManagementFee({ managementFee: "", customFields: [{ label: "管理費", value: "1800" }] })).toBe("");
});

test("keeps billing units supplied by the user and includes them in the viewing summary", () => {
  const property = { managementFee: "60 元／坪／月" };
  expect(formatPropertyManagementFee(property)).toBe("60 元／坪／月");
  expect(buildPropertySummary(property).areas).toContainEqual(["管理費", "60 元／坪／月"]);
  expect(buildPropertySummary({}).areas).toContainEqual(["管理費", "未提供"]);
});

test("legacy and blank Excel cells preserve stored fees while explicit zero is imported", () => {
  expect(managementFeeImportFields(["案名", "管理費"], ["兩房", 0])).toEqual({ managementFee: "0" });
  expect(managementFeeImportFields(["案名", "管理費"], ["兩房", ""])).toEqual({});
  expect(managementFeeImportFields(["案名", "備註"], ["兩房", ""])).toEqual({});
});
