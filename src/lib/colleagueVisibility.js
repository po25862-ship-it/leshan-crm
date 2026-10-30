// Hide the owner's two test accounts from new colleague selections only.
// Keep the full directory available for history labels and existing assignments.
export const HIDDEN_COLLEAGUE_UIDS = Object.freeze([
  "mTfncojmWcgx3XN3JYceTJFJtw03", // 我會寫扣
  "Qv7tWXKV07M5UL0UA6Ug8eWeJOF3", // po25862z
]);

export function isHiddenColleague(colleague) {
  const uid = typeof colleague === "string" ? colleague : colleague?.id;
  return HIDDEN_COLLEAGUE_UIDS.includes(uid);
}

export function visibleColleagueOptions(rows) {
  return rows.filter(row => !isHiddenColleague(row));
}
