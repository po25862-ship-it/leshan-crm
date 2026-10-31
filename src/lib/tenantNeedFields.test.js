const f = require('./tenantNeedFields.js');
const form = { ...f.tenantNeedForm(), name:'小陳', budgetText:'3.5萬', areas:'A7' };
const listing = { id:'a', status:'available', title:'A7兩房', area:'A7', rent:28000, rooms:2, parking:'坡道平面', parkMode:'已含租金', mgmtMode:'另計', mgmt:2000, pets:'不可養寵物', subsidy:'可申請', cook:'可開伙' };
test('approved template round trips all fields and does not request contact details', () => {
 const template=f.tenantNeedTemplate(form), result=f.parseTenantTemplate(template);
 expect(result.errors).toEqual([]); expect(result.present).toHaveLength(18);
 expect(f.tenantNeedErrors(result.form)).toEqual([]); expect(result.form.name).toBe('小陳');
 expect(result.form.carParking).toBe(''); expect(template).not.toMatch(/電話|聯絡方式/);
});
test.each([['３５，０００ 元內',35000],['3.5萬',35000],['2.5～3萬',30000],['25000-35000元',35000],['不限',null]])('budget %s is normalized without guessing', (text,max) => expect(f.parseRentalBudget(text)?.max).toBe(max));
test.each(['-3000','0','3萬5','35000或40000','4萬～3萬','abc','30000以上但不超過40000'])('ambiguous or invalid budget %s must be clarified', text => expect(f.parseRentalBudget(text)).toBeNull());
test('follow-up preserves fields and forbids ownership injection or conflicting duplicate labels', () => {
 const parsed=f.parseTenantTemplate('租金預算：3萬\n區域：A8');
 const merged=f.mergeTenantDraft(form,parsed); expect(merged.name).toBe('小陳');expect(merged.areas).toBe('A8');
 expect(f.parseTenantTemplate('姓名：甲\n姓名：乙').errors.length).toBe(1);
 expect(f.parseTenantTemplate('ownerUid：other').errors.length).toBe(1);
 expect(f.tenantNeedErrors({...form,type:''})[0]).toMatch(/需求類型/);
});
test('only available listings within known monthly budget match; unknown fees are flagged', () => {
 const need={...form,includedFees:'租金、管理費、汽車位'};
 expect(f.matchTenantRental(need,{...listing,status:'rented'})).toBeNull();
 expect(f.matchTenantRental({...need,budgetText:'29000'},listing)).toBeNull();
 expect(f.matchTenantRental(need,listing).knownMonthly).toBe(30000);
 expect(f.matchTenantRental(need,{...listing,parkMode:'待確認'}).uncertain).toContain('汽車位費');
 expect(f.matchTenantRental({...need,areas:'A9'},listing)).toBeNull();
});
test('negative needs do not become pet requirements; explicit restrictions reject; negotiable is pending', () => {
 expect(f.matchTenantRental({...form,pets:'無寵物'},listing)).not.toBeNull();
 expect(f.matchTenantRental({...form,pets:'貓1隻'},listing)).toBeNull();
 expect(f.matchTenantRental({...form,pets:'貓1隻'},{...listing,pets:'可談'}).uncertain).toContain('寵物種類／數量');
 expect(f.matchTenantRental({...form,carParking:'平面1個'},{...listing,parking:'坡道機械'})).toBeNull();
 expect(f.matchTenantRental({...form,cook:'需要'},{...listing,cook:'不可開伙'})).toBeNull();
});
