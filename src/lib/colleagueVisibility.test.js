import { HIDDEN_COLLEAGUE_UIDS, isHiddenColleague, visibleColleagueOptions } from "./colleagueVisibility";
import { companyRentalColleagues } from "./companyRental";

const tests = HIDDEN_COLLEAGUE_UIDS.map((id, index) => ({ id, name: index ? "po25862z" : "我會寫扣" }));
const colleague = { id: "real-staff", name: "正式同事" };
test("only the identified test accounts are hidden, even after a name change", () => {
  const directory = [...tests, colleague, { id: "different-account", name: "我會寫扣" }];
  expect(visibleColleagueOptions(directory)).toEqual([colleague, directory[3]]);
  expect(isHiddenColleague({ ...tests[0], name: "新名稱" })).toBe(true);
  expect(isHiddenColleague(tests[1].id)).toBe(true);
  expect(directory).toHaveLength(4);
});
test("new rentals offer active colleagues and the signed-in owner without test accounts", () => {
  const options = companyRentalColleagues([...tests, colleague], { uid: "owner" }, { name: "主要負責人" });
  expect(options.map(row => row.id).sort()).toEqual(["owner", "real-staff"]);
});
test("an existing test assignee and a test user's own identity remain available to preserve saved records", () => {
  const user = { uid: "owner" }, original = { agentUid: tests[0].id, agentName: tests[0].name };
  expect(companyRentalColleagues([...tests, colleague], user, {}, original)).toContainEqual(tests[0]);
  expect(companyRentalColleagues([...tests, colleague], { uid: tests[1].id })).toContainEqual(tests[1]);
  expect(original.agentUid).toBe(tests[0].id);
});
