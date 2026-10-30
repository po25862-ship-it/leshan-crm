/** @jest-environment jsdom */
import React, { act } from "react";
import { createRoot } from "react-dom/client";
import ShareWithPicker from "./ShareWithPicker";

jest.mock("../AuthContext", () => ({ useAuth: () => ({ user: { uid: "owner" } }) }));
jest.mock("../hooks/useCollection", () => ({ useCollection: () => ({ items: [
  { id: "mTfncojmWcgx3XN3JYceTJFJtw03", name: "我會寫扣" },
  { id: "Qv7tWXKV07M5UL0UA6Ug8eWeJOF3", name: "po25862z" },
  { id: "real-staff", name: "正式同事" },
] }) }));

test("sharing hides test accounts from new choices while retaining existing sharing and names", () => {
  global.IS_REACT_ACT_ENVIRONMENT = true;
  const container = document.createElement("div"), root = createRoot(container), onChange = jest.fn();
  document.body.appendChild(container);
  try {
    act(() => root.render(<ShareWithPicker value={["mTfncojmWcgx3XN3JYceTJFJtw03"]} onChange={onChange} />));
    expect(container.querySelector(".tag").textContent).toContain("我會寫扣");
    const select = container.querySelector("select");
    expect([...select.options].map(option => option.value)).toEqual(["", "real-staff"]);
    expect(onChange).not.toHaveBeenCalled();
    act(() => { select.value = "real-staff"; select.dispatchEvent(new Event("change", { bubbles: true })); });
    expect(onChange).toHaveBeenCalledWith(["mTfncojmWcgx3XN3JYceTJFJtw03", "real-staff"]);
  } finally { act(() => root.unmount()); container.remove(); }
});
