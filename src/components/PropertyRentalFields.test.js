import React, { act, useState } from "react";
import { createRoot } from "react-dom/client";
import PropertyRentalFields from "./PropertyRentalFields";

test("rent input and total-price edits immediately recalculate the labelled output", async () => {
  global.IS_REACT_ACT_ENVIRONMENT = true;
  const host = document.createElement("div"); document.body.appendChild(host); const root = createRoot(host);
  function Form() {
    const [property, setProperty] = useState({ totalPrice: "1500", monthlyRent: "" });
    return <><label>總價<input id="test-price" value={property.totalPrice} onChange={event => setProperty({ ...property, totalPrice: event.target.value })} /></label><PropertyRentalFields property={property} onChange={monthlyRent => setProperty({ ...property, monthlyRent })} /></>;
  }
  const type = async (id, value) => act(async () => { const input = host.querySelector(id); Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set.call(input, value); input.dispatchEvent(new Event("input", { bubbles: true })); });
  try {
    act(() => root.render(<Form />));
    expect(host.querySelector("output").textContent).toBe("待填月租金");
    await type("#property-monthly-rent", "30000"); expect(host.querySelector("output").textContent).toBe("2.40%");
    await type("#test-price", "1200"); expect(host.querySelector("output").textContent).toBe("3.00%");
    expect(host.textContent).toContain("未扣稅費、修繕及空租");
    await type("#property-monthly-rent", ""); expect(host.querySelector("output").textContent).toBe("待填月租金");
  } finally { act(() => root.unmount()); host.remove(); }
});
