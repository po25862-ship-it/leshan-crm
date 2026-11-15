import React from "react";
import { formatPropertyRentalYield, propertyRentalIncome } from "../lib/propertyRentalIncome";
import "./PropertyRentalFields.css";

export default function PropertyRentalFields({ property, onChange }) {
  const income = propertyRentalIncome(property);
  return <>
    <div className="form-field">
      <label htmlFor="property-monthly-rent">月租金（元／月）</label>
      <input id="property-monthly-rent" inputMode="decimal" value={property.monthlyRent ?? ""} onChange={event => onChange(event.target.value)} placeholder="例如：30000；未確認可留空" aria-describedby="property-monthly-rent-help" />
      <small id="property-monthly-rent-help" className="property-rental-help">有出租時可填每月租金；請以元填寫，未確認可留空。</small>
    </div>
    <div className="form-field">
      <label htmlFor="property-rental-yield">年租金報酬率（未扣費用）</label>
      <output id="property-rental-yield" className="property-rental-output" aria-live="polite">{formatPropertyRentalYield(property)}</output>
      <small className="property-rental-help">月租金 × 12 ÷（總價 × 10,000）× 100%。{income.annualRent !== null ? `年租金 ${income.annualRent.toLocaleString("zh-TW")} 元。` : ""}總價或租金調整時自動重算；未扣稅費、修繕及空租等成本。</small>
    </div>
  </>;
}
