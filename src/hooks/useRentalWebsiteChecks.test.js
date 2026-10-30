/** @jest-environment jsdom */
import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { useRentalWebsiteChecks } from "./useRentalWebsiteChecks";
import { loadRentalWebsiteInfo } from "../lib/rentalWebsiteClient";
import { saveRentalWebsiteCheck } from "../lib/companyRentalRepository";
jest.mock("../lib/rentalWebsiteClient", () => ({ loadRentalWebsiteInfo: jest.fn(), needsRentalWebsiteCheck: rental => !rental.websiteCheckedAt }));
jest.mock("../lib/companyRentalRepository", () => ({ saveRentalWebsiteCheck: jest.fn(async () => null) }));
const user = { uid: "staff" }, url = "https://rent.591.com.tw/22258856";
const info = { url, status: "live", expiresOn: "2026-11-29", checkedAt: "2026-10-31T04:00:00Z" };
const row = { id: "one", ownerUid: "staff", status: "available", websiteUrl: url };
let root, container;
function Harness({ rows, enabled = true }) { const results = useRentalWebsiteChecks(rows, user, enabled); return <output>{JSON.stringify(results)}</output>; }
beforeEach(() => { global.IS_REACT_ACT_ENVIRONMENT = true; loadRentalWebsiteInfo.mockReset(); saveRentalWebsiteCheck.mockClear(); container = document.createElement("div"); document.body.appendChild(container); root = createRoot(container); });
afterEach(() => { act(() => root.unmount()); container.remove(); });
const render = (rows, enabled = true) => act(async () => root.render(<Harness rows={rows} enabled={enabled} />));
test("enriches an owned rental once and pauses source reads while editing", async () => {
  loadRentalWebsiteInfo.mockResolvedValue(info); const rows = [row];
  await render(rows, false); expect(loadRentalWebsiteInfo).not.toHaveBeenCalled();
  await render(rows); expect(loadRentalWebsiteInfo).toHaveBeenCalledTimes(1); expect(saveRentalWebsiteCheck).toHaveBeenCalledWith(row, info, user);
  expect(container.textContent).toContain("2026-11-29"); await render(rows); expect(loadRentalWebsiteInfo).toHaveBeenCalledTimes(1);
});
test("unknown responses never overwrite metadata, and other colleagues' cases are only read", async () => {
  loadRentalWebsiteInfo.mockResolvedValueOnce({ ...info, status: "unknown" }).mockResolvedValueOnce(info);
  await render([row, { ...row, id: "two", ownerUid: "other" }]);
  expect(saveRentalWebsiteCheck).not.toHaveBeenCalled(); expect(container.textContent).not.toContain('"one"'); expect(container.textContent).toContain('"two"');
});
test("a response for a URL that changed during the check is discarded", async () => {
  let resolveOld; loadRentalWebsiteInfo.mockImplementationOnce(() => new Promise(resolve => { resolveOld = resolve; }));
  await render([row]); const next = { ...row, websiteUrl: "https://rent.591.com.tw/12345678" }, nextInfo = { ...info, url: next.websiteUrl, expiresOn: "2026-12-31" };
  loadRentalWebsiteInfo.mockResolvedValueOnce(nextInfo); await render([next]);
  await act(async () => resolveOld(info));
  expect(container.textContent).toContain("2026-12-31"); expect(container.textContent).not.toContain("2026-11-29");
  expect(saveRentalWebsiteCheck.mock.calls.every(call => call[0].websiteUrl === next.websiteUrl)).toBe(true);
});
