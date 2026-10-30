import React, { useMemo } from "react";
import { assessPropertyPriority, COMPARABLE_AREA_TOLERANCE, comparableDeals } from "../lib/propertyMarketReference";
import { formatUnitPrice, nonNegativeNumber, parkingPricePresetNote } from "../lib/propertyUnitPrice";
import { formatPropertyManagementFee } from "../lib/propertyManagementFee";
import { dealParkingComparison } from "../lib/propertyDealParking";
import { priorityActionLabel, priorityEditField } from "../lib/propertyPriorityWorklist";
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

function PriorityTotalPrice({ property, assessment }) {
  const target = assessment.priceTarget;
  if (!target) return null;
  const current = nonNegativeNumber(property.totalPrice);
  const priceMet = assessment.unit <= assessment.referenceUnit;
  const difference = Math.max(0, current - target.totalPrice);
  const estimated = target.parkingSource === "preset" || assessment.estimatedSampleCount > 0;
  return <section className="property-priority-price" aria-label="優先推案參考總價">
    <div className="property-priority-price-title">優先推案的參考總價{target.parkingPrice > 0 ? "（含車位）" : ""}</div>
    <strong className="property-priority-price-amount">{money(target.totalPrice)} <span>萬以下{estimated ? "（試算）" : ""}</span></strong>
    <p>{priceMet ? `目前總價 ${money(current)} 萬，已符合價格條件。` : `目前總價 ${money(current)} 萬，約需調整 ${money(difference)} 萬。`}</p>
    <p>價格達標後，仍需有合適客需，且近 30 天已確認可帶看，才會列為優先推案。</p>
    <details><summary>查看總價怎麼算{estimated ? "（含預設試算）" : ""}</summary><p>以原始成交參考單價 × 本件扣車面積 {money(target.netPing)} 坪{target.parkingPrice > 0 ? `，再加回車位 ${money(target.parkingPrice)} 萬` : "（本件無車位）"}。顯示總價向下取到小數兩位。</p>{target.parkingSource === "preset" && <p>{parkingPricePresetNote(property)}確認實際車位價格後，可到「編輯資料」修改。</p>}{assessment.estimatedSampleCount > 0 && <p>成交參考含 {assessment.estimatedSampleCount} 筆車位預設試算，未分列的平面車位每個採 180 萬、機械車位每個採 150 萬。</p>}</details>
  </section>;
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
  const tolerance = COMPARABLE_AREA_TOLERANCE;
  const deals = useMemo(() => comparableDeals(property, reference, { tolerance }), [property, reference, tolerance]);
  const assessment = useMemo(() => assessPropertyPriority(property, reference, needs, { error }), [property, reference, needs, error]);
  const community = reference?.community;
  const amenities = community?.amenities;
  const ping = Number(property.titlePing);
  const recent = deals.slice(0, 5);
  return <section className="panel property-market-reference" style={{ gridColumn: "1 / -1" }} aria-label="物件行情與搶攻提醒">
    <header className="property-market-heading"><div><span className="property-market-eyebrow">{property.title || "本件物件"}</span><h3>成交參考與業務提醒</h3></div><button type="button" className="btn ghost" onClick={onRefresh} disabled={loading}>{loading ? "讀取參考中…" : "更新參考"}</button></header>
    {reference?.sourceMode === "cloud-snapshot" && !error && <p className="property-market-caption" role="status">雲端資料・最後同步：{dateTime(reference.snapshotAt)}。手機、電腦皆可查詢，無須開啟本機程式。「更新參考」會重新讀取最新雲端資料。</p>}
    <div className="property-market-unit-row"><span>含車簡算單價 <strong>{formatUnitPrice(property, "gross")}</strong></span><span>扣車位單價 <strong>{formatUnitPrice(property, "net")}</strong></span></div>
    {parkingPricePresetNote(property) && <p className="property-market-caption">{parkingPricePresetNote(property)}可在「編輯資料」修改。</p>}
    <div className={`property-priority-detail ${assessment.status}`}>
      <div className="property-priority-detail-heading"><strong>業務搶攻提醒</strong><PropertyPriorityBadge assessment={assessment} /><span>內部參考</span></div>
      <div>{assessment.reason}</div>
      <PriorityTotalPrice property={property} assessment={assessment} />
      <div className="property-priority-next"><span>建議下一步</span><strong>{assessment.next}</strong></div>
      {priorityEditField(assessment) && <button type="button" className="btn ghost" onClick={() => onEdit(priorityEditField(assessment))}>{priorityActionLabel(assessment)}</button>}
      <details className="property-priority-method"><summary>查看判斷依據</summary>{Number.isInteger(assessment.sampleCount) && <p>本次判斷採用 {assessment.sampleCount} 筆成交。沒有車位的成交也可納入；用預設車價的成交會標示試算{assessment.estimatedSampleCount > 0 ? `（本次 ${assessment.estimatedSampleCount} 筆）` : ""}。</p>}{assessment.sampleDates?.length > 0 && <p>採用成交日期：{assessment.sampleDates.join("、")}。</p>}<p>同社區完整門牌、相近建物總坪數 ±30%、同類型，不限房數。只採近一年（365 天）的成交，至少 1 筆就能比較，最多採用最新 5 筆可用成交。官方已分列車位價格時優先使用；未分列時，車位坪數與類型明確才採平面每個 180 萬、機械每個 150 萬試算。只有 1 筆就用該筆單價，多筆則取中位數。不高於參考單價、至少一組客需完全符合、近 30 天人工確認可帶看，才標示優先推案。樓層、屋況與交易條件仍須業務核對。</p></details>
    </div>
    {error && <div className="property-market-error" role="alert">{error}</div>}
    {loading && <div className="property-market-message" role="status">正在取得社區主檔與官方成交；不查電傳，也不啟動付費 AI。</div>}
    {!loading && !error && !community && <div className="property-market-message">{reference?.reason === "ambiguous_community" ? "社區名稱有重複，請補齊完整門牌確認。" : "尚未配對到 A7／A8／A9 社區主檔。請核對地址及社區名稱，再更新參考。"}</div>}
    {community && !error && <>
      <div className="property-market-grid">
        <section className="property-market-deals" aria-label="同社區相近成交">
          <div className="property-market-section-heading"><h4>{community.name}・近一年相近成交</h4><span>官方實價登錄</span></div>
          <div className="property-market-controls"><span className="property-market-caption">坪數範圍 ±30%</span><span className="property-market-caption">不限房數</span></div>
          <div className="property-market-caption" role="status">{ping > 0 ? `${(ping * (1 - tolerance)).toFixed(2)}～${(ping * (1 + tolerance)).toFixed(2)} 坪・` : "權狀坪數未提供・"}近一年符合 {deals.length} 筆，顯示最近 {recent.length} 筆</div>
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
          {!recent.length && <div className="property-market-message">近一年沒有符合條件的相近成交。可調整坪數範圍查看參考。</div>}
          <div className="property-market-source">資料發布：{reference.publishedDate || "未提供"}；成交年度：{(reference.years || []).join("、")}。本社區本批最新成交：{reference.deals?.[0]?.date || "未提供"}。</div>
          <details className="property-priority-method"><summary>面積與單價說明</summary><p>官方揭露單價保留原數字；扣車單價另以（成交總價－車位價）÷（建物總坪數－車位坪數）計算。有官方車位價就優先使用；未分列時，平面每個預設 180 萬、機械每個預設 150 萬，標示「預設試算」並可納入價格參考。官方未提供車位數量時先按 1 個試算；未提供車位坪數、類型不明或數字不合理時不計算。已排除特殊交易；車位數量、屋況與備註仍須核對。</p></details>
        </section>
        <aside className="property-market-community" aria-label="社區公設與管理">
          <h4>社區公設與管理</h4><div className="property-market-caption">{community.name}・{community.zone}</div>
          {community.households && <div className="property-market-caption">{money(community.households)} 戶</div>}
          <div className="property-market-facilities">{amenities?.list?.length ? <div className="property-market-facility-tags">{amenities.list.map((a) => <span key={a}>{a}</span>)}</div> : <strong>來源尚未填寫公設資料</strong>}{amenities?.note && <p>{amenities.note}</p>}<small>公設更新：{dateTime(amenities?.updatedAt)}</small></div>
          <dl><div><dt>本件管理費</dt><dd>{formatPropertyManagementFee(property) || "未提供"}</dd></div><div><dt>社區管理費單價</dt><dd>{community.fees?.perPing !== null && community.fees?.perPing !== undefined ? `${money(community.fees.perPing)} 元／坪・月` : "來源尚未提供"}</dd></div><div><dt>社區資料更新</dt><dd>{dateTime(community.updatedAt)}</dd></div>{reference.snapshotAt && <div><dt>雲端最後同步</dt><dd>{dateTime(reference.snapshotAt)}</dd></div>}<div><dt>本次讀取</dt><dd>{dateTime(reference.fetchedAt)}</dd></div></dl>
          <div className="property-market-caption">公設依來源更新；本件管理費保留原物件資料。</div>
        </aside>
      </div>
    </>}
  </section>;
}
