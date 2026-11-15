import { propertyRentalIncome, propertyRentalIncomeFields, propertyRentalIncomeImportFields, formatPropertyMonthlyRent, formatPropertyRentalYield, leaseDateValue, formatPropertyLease } from "./propertyRentalIncome";

test("monthly yuan and total price in wan give an annual gross yield that follows price changes", () => {
  expect(propertyRentalIncome({ monthlyRent: "30,000", totalPrice: "1,500" })).toEqual({ monthlyRent: 30000, annualRent: 360000, annualYield: 2.4 });
  expect(formatPropertyRentalYield({ monthlyRent: 30000, totalPrice: 1200 })).toBe("3.00%");
  expect(formatPropertyRentalYield({ monthlyRent: 25000, totalPrice: 1200 })).toBe("2.50%");
  expect(formatPropertyMonthlyRent({ monthlyRent: "３０，０００" })).toBe("30,000 元／月");
});

test("blank rent stays unknown, a zero is deliberate, and a missing/zero price never divides by zero", () => {
  expect(propertyRentalIncome({ totalPrice: 1500 })).toEqual({ monthlyRent: null, annualRent: null, annualYield: null });
  expect(formatPropertyRentalYield({ totalPrice: 1500 })).toBe("待填月租金");
  expect(formatPropertyRentalYield({ monthlyRent: 0, totalPrice: 1500 })).toBe("0.00%");
  expect(formatPropertyRentalYield({ monthlyRent: 30000, totalPrice: 0 })).toBe("待填有效總價");
  expect(propertyRentalIncome({ monthlyRent: 30000 }).annualYield).toBeNull();
});

test("only rent is saved; calculated percentages are never persisted as stale values", () => {
  expect(propertyRentalIncomeFields({ monthlyRent: " 30,000 ", totalPrice: 1500, annualYield: 99 })).toEqual({ monthlyRent: 30000, leaseStartDate: "", leaseEndDate: "", rentFeeNote: "", leaseTermNote: "" });
  expect(propertyRentalIncomeFields({ monthlyRent: "" })).toEqual({ monthlyRent: "", leaseStartDate: "", leaseEndDate: "", rentFeeNote: "", leaseTermNote: "" });
  for (const monthlyRent of [-1, "abc", "3萬元", Infinity, 1e308]) expect(() => propertyRentalIncomeFields({ monthlyRent })).toThrow("月租金請填");
});

test("old or blank report columns preserve manual rent while valid cells and zero round-trip", () => {
  const old = { monthlyRent: 30000 };
  expect({ ...old, ...propertyRentalIncomeImportFields(["管理費"], [2000]) }).toEqual(old);
  expect(propertyRentalIncomeImportFields(["月租金（元／月）"], [""])).toEqual({});
  expect(propertyRentalIncomeImportFields(["月租金（元／月）", "年租金報酬率"], [28000, 99])).toEqual({ monthlyRent: 28000 });
  expect(propertyRentalIncomeImportFields(["月租金(元/月)"], [0])).toEqual({ monthlyRent: 0 });
  expect(() => propertyRentalIncomeImportFields(["月租金"], ["錯字"])).toThrow("月租金請填");
});


test("lease dates normalize ROC and Excel dates, reject impossible/reversed dates, and leave unknown data explicit", () => {
  expect(leaseDateValue("114/06/25")).toBe("2025-06-25");
  expect(leaseDateValue("１１８／０７／３１")).toBe("2029-07-31");
  expect(leaseDateValue(45833)).toBe("2025-06-25");
  expect(leaseDateValue("2026-02-30")).toBeNull();
  expect(() => propertyRentalIncomeFields({ leaseStartDate: "2029-08-01", leaseEndDate: "2029-07-31" })).toThrow("不能早於");
  expect(formatPropertyLease({})).toBe("租期待確認");
  expect(formatPropertyLease({ leaseEndDate: "2029-07-31" })).toContain("起日待確認");
  expect(propertyRentalIncomeImportFields(["租約起日", "租約到期日", "租金費用說明"], ["114/06/25", "118/07/31", "含稅、含管理費"]))
    .toEqual({ leaseStartDate: "2025-06-25", leaseEndDate: "2029-07-31", rentFeeNote: "含稅、含管理費" });
  expect(propertyRentalIncomeImportFields(["租約起日", "租金費用說明"], ["", ""])) .toEqual({});
});


test("incomplete lease text stays verbatim and an expired date never implies a renewed lease", () => {
  expect(formatPropertyLease({ leaseTermNote: "不定期租約" }, "2026-11-15")).toBe("不定期租約");
  expect(formatPropertyLease({ leaseTermNote: "至116/02/--" }, "2026-11-15")).toBe("至116/02/--");
  expect(formatPropertyLease({ leaseEndDate: "2026-09-30" }, "2026-11-15")).toContain("表載租期已到期");
  expect(propertyRentalIncomeImportFields(["租期補充"],["一年（至116.5月）"])).toEqual({leaseTermNote:"一年（至116.5月）"});
});
