import React, { useMemo, useState } from "react";
import { assessPropertyPriority, comparableDeals } from "../lib/propertyMarketReference";
import { formatUnitPrice, parkingPricePresetNote } from "../lib/propertyUnitPrice";
import { formatPropertyManagementFee } from "../lib/propertyManagementFee";
import { dealParkingComparison } from "../lib/propertyDealParking";
import "./PropertyMarketReference.css";

const money = (value, divisor = 1) => value === null || value === undefined || value === "" ? "未提供" : (Number(value) / divisor).toLocaleString("zh-TW", { maximumFractionDigits: 2 });
function dateTime(value) {
  if (!value) return "未提供";
  const date = typeof value.toDate === "function" ? value.toDate() : new Date(value);
  return Number.isFinite(date.getTime()) ? new Intl.DateTimeFormat("zh-TW", { timeZone: "Asia/Taipei", dateStyle: "short", timeStyle: "short", hour12: false }).format(date) : "未提供";
}

export function PropertyPriorityBadge({ assessment }) {
  if (!assessment || assessment.status === "inactive") return null;
  return <span className={`property-priority-badge ${assessment.status}`} aria-label={`${assessment.label}：${assessment.reason}`} title={assessment.reason}>{assessment.label}</span>;
}

function DealParkingUnit({ deal }) {
  const comparison = dealParkingComparison(deal);
  return <div className={`property-market-net-unit${comparison.source === "preset" ? " is-estimated" : ""}`}>
    <span className="property-market-mobile-label">扣車單價</span>
    {comparison.unit === null ? <small>{comparison.reason}</small> : <>
      <strong>{comparison.unit.toFixed(2)}</strong><small>萬／坪</small>
      <small>{comparison.source === "preset" ? "預設試算" : comparison.source === "official" ? "官方拆分計算" : "無車位"}</small>
      {comparison.source !== "no-parking" && <small>
        {comparison.source === "preset" ? `預設車價 ${money(comparison.priceWan)} 萬` : `車價 ${money(comparison.priceWan)} 萬`}<br />車位 {money(comparison.area)} 坪
      </small>}
      {comparison.source === "preset" && <small>{Number(deal.parkingCount) > 0 ? `${comparison.count} 個車位合計` : "先按 1 個車位試算"}</small>}
    </>}
  </div>;
}

export default function PropertyMarketReference({ property, reference, loading, error, onRefresh, needs, onEdit }) {
  const [tolerance, setTolerance] = useState(0.2);
  const deals = useMemo(() => comparableDeals(property, reference, { tolerance }), [property, reference, tolerance]);
  const assessment = useMemo(() => assessPropertyPriority(property, reference, needs, { error }), [property, reference, needs, error]);
  const community = reference?.community;
  const amenities = community?.amenities;
  const ping = Number(property.titlePing);
  const recent = deals.slice(0, 5);
  return <section className="panel property-market-reference" style={{ gridColumn: "1 / -1" }} aria-label="物件行情與搶攻提醒">
    <header className="property-market-heading"><div><span className="property-market-eyebrow">{property.title || "本件物件"}</span><h3>成交參考與業務提醒</h3></div><button type="button" className="btn ghost" onClick={onRefresh} disabled={loading}>{loading ? "讀取參考中…" : "更新參考"}</button></header>
    <div className="property-market-unit-row"><span>含車簡算單價 <strong>{formatUnitPrice(property, "gross")}</strong></span><span>扣車位單價 <strong>{formatUnitPrice(property, "net")}</strong></span></div>
    {parkingPricePresetNote(property) && <p className="property-market-caption">{parkingPricePresetNote(property)}可在「編輯資料」修改。</p>}
    <div className={`property-priority-detail ${assessment.status}`}>
      <div className="property-priority-detail-heading"><strong>業務搶攻提醒</strong><PropertyPriorityBadge assessment={assessment} /><span>內部參考</span></div>
      <div>{assessment.reason}</div><div className="property-priority-next"><span>建議下一步</span><strong>{assessment.next}</strong></div>
      {assessment.code === "missing_unit" && <button type="button" className="btn ghost" onClick={() => onEdit(assessment.missingFields?.[0]?.fieldId)}>去補資料</button>}
      <details className="property-priority-method"><summary>查看判斷依據</summary><p>同社區完整門牌、相近建物總坪數 ±20%、同類型，不限房數，取最近五筆；其中近一年且可拆分車位的成交至少 3 筆，才比較扣車單價中位數。不高於中位數、至少一組客需完全符合、近 30 天人工確認可帶看，才標示優先推案。樓層、屋況與交易條件仍須業務核對。</p></details>
    </div>
    {error && <div className="property-market-error" role="alert">{error}</div>}
    {loading && <div className="property-market-message" role="status">正在取得社區主檔與官方成交；不查電傳，也不啟動付費 AI。</div>}
    {!loading && !error && !community && <div className="property-market-message">{reference?.reason === "ambiguous_community" ? "社區名稱有重複，請補齊完整門牌確認。" : "尚未配對到 A7／A8／A9 社區主檔。請核對地址及社區名稱，再更新參考。"}</div>}
    {community && !error && <>
      <div className="property-market-grid">
        <section className="property-market-deals" aria-label="同社區相近成交">
          <div className="property-market-section-heading"><h4>{community.name}・近五筆相近成交</h4><span>官方實價登錄</span></div>
          <div className="property-market-controls"><label>坪數範圍<select value={tolerance} onChange={(e) => setTolerance(Number(e.target.value))}><option value={0.1}>相近 ±10%</option><option value={0.2}>相近 ±20%</option><option value={0.3}>相近 ±30%</option></select></label><span className="property-market-caption">不限房數</span></div>
          <div className="property-market-caption" role="status">{ping > 0 ? `${(ping * (1 - tolerance)).toFixed(2)}～${(ping * (1 + tolerance)).toFixed(2)} 坪・` : "權狀坪數未提供・"}符合 {deals.length} 筆，顯示最近 {recent.length} 筆</div>
          {reference.matchMethod === "exact-community-name" && <div className="property-market-caption warning">依唯一社區名稱／別名配對；請核對本件完整門牌。</div>}
          <div className="property-market-table">
            <div className="property-market-table-heading" aria-hidden="true"><span>日期／樓層</span><span>格局／坪數／地址</span><span>成交總價</span><span>官方揭露單價</span><span>扣車單價</span><span>車位／備註</span></div>
            {recent.map((d) => <article key={d.id} className="property-market-trade" aria-label={`${d.date} ${d.address}`}>
              <div><strong>{d.date}</strong><small>{d.floor || "樓層未提供"}</small></div>
              <div><strong>{d.rooms ?? "?"}房{d.halls ?? "?"}廳{d.baths ?? "?"}衛・{money(d.area)} 坪</strong><small>{d.address}</small></div>
              <div><span className="property-market-mobile-label">成交總價</span><strong>{money(d.price, 10000)} 萬</strong></div>
              <div><span className="property-market-mobile-label">官方揭露單價</span><strong>{money(d.unit)}</strong><small>萬／坪</small></div>
              <DealParkingUnit deal={d} />
              <div><small>{d.parkingType || "未列車位"}{Number(d.parkingPrice) > 0 ? `／車價 ${money(d.parkingPrice, 10000)} 萬` : d.parkingType ? "／車價未分列" : ""}</small>{d.remark && <details><summary>交易備註</summary><small>{d.remark}</small></details>}</div>
            </article>)}
          </div>
          {!recent.length && <div className="property-market-message">目前條件查無可比成交，不以其他社區補足。可調整坪數範圍。</div>}
          <div className="property-market-source">資料發布：{reference.publishedDate || "未提供"}；成交年度：{(reference.years || []).join("、")}。本社區本批最新成交：{reference.deals?.[0]?.date || "未提供"}。</div>
          <details className="property-priority-method"><summary>面積與單價說明</summary><p>官方揭露單價保留原數字；扣車單價另以（成交總價－車位價）÷（建物總坪數－車位坪數）計算。有官方車位價就優先使用；未分列時，平面每個預設 180 萬、機械每個預設 150 萬，標示「預設試算」。官方未提供車位數量時先按 1 個試算；未提供車位坪數、類型不明或數字不合理時不計算。預設試算供業務參考，自動案件判斷仍只採官方拆分完整的成交。已排除特殊交易；車位數量、屋況與備註仍須核對。</p></details>
        </section>
        <aside className="property-market-community" aria-label="社區公設與管理">
          <h4>社區公設與管理</h4><div className="property-market-caption">{community.name}・{community.zone}</div>
          {community.households && <div className="property-market-caption">{money(community.households)} 戶</div>}
          <div className="property-market-facilities">{amenities?.list?.length ? <div className="property-market-facility-tags">{amenities.list.map((a) => <span key={a}>{a}</span>)}</div> : <strong>來源尚未填寫公設資料</strong>}{amenities?.note && <p>{amenities.note}</p>}<small>公設更新：{dateTime(amenities?.updatedAt)}</small></div>
          <dl><div><dt>本件管理費</dt><dd>{formatPropertyManagementFee(property) || "未提供"}</dd></div><div><dt>社區管理費單價</dt><dd>{community.fees?.perPing !== null && community.fees?.perPing !== undefined ? `${money(community.fees.perPing)} 元／坪・月` : "來源尚未提供"}</dd></div><div><dt>社區資料更新</dt><dd>{dateTime(community.updatedAt)}</dd></div><div><dt>本次讀取</dt><dd>{dateTime(reference.fetchedAt)}</dd></div></dl>
          <div className="property-market-caption">公設依來源更新；本件管理費保留原物件資料。</div>
        </aside>
      </div>
    </>}
  </section>;
}
