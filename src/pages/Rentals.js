import React, { useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { serverTimestamp } from "firebase/firestore";
import { useCollection } from "../hooks/useCollection";
import { formatDateRoc } from "../lib/dates";

const STATUS_LABELS = { seeking: "招租中", leased: "租賃中", idle: "閒置中" };
const STATUS_ORDER = ["seeking", "leased", "idle"];

const emptyRental = {
  title: "",
  status: "seeking",
  propertyId: null,
  propertyAddress: "",
  propertyUrl: "",
  landlordContactId: null,
  landlordName: "",
  landlordPhone: "",
  tenantContactId: null,
  tenantName: "",
  tenantPhone: "",
  rent: "",
  deposit: "",
  depositReturned: false,
  leaseStartDate: "",
  leaseEndDate: "",
  rentDueDay: "",
  rentSyncToCalendar: false,
  rentGoogleEventId: null,
  rentGoogleEventLink: null,
  adPlatforms: [],
  documentUrl: null,
  documentName: null,
  documentType: null,
  notes: "",
};

export default function Rentals() {
  const navigate = useNavigate();
  const { items, add } = useCollection("rentals", "createdAt");

  const [keyword, setKeyword] = useState("");
  const [statusFilter, setStatusFilter] = useState("全部");
  const [creating, setCreating] = useState(false);

  const counts = {
    全部: items.length,
    seeking: items.filter((r) => (r.status || "seeking") === "seeking").length,
    leased: items.filter((r) => r.status === "leased").length,
    idle: items.filter((r) => r.status === "idle").length,
  };

  const filtered = items.filter((r) => {
    if (statusFilter !== "全部" && (r.status || "seeking") !== statusFilter) return false;
    if (!keyword.trim()) return true;
    const k = keyword.trim();
    return (
      (r.title || "").includes(k) ||
      (r.propertyAddress || "").includes(k) ||
      (r.landlordName || "").includes(k) ||
      (r.tenantName || "").includes(k)
    );
  });

  const columns = useMemo(() => {
    const map = {};
    filtered.forEach((r) => {
      const key = STATUS_LABELS[r.status || "seeking"];
      if (!map[key]) map[key] = [];
      map[key].push(r);
    });
    const ordered = {};
    STATUS_ORDER.forEach((s) => {
      const label = STATUS_LABELS[s];
      if (map[label]) ordered[label] = map[label];
    });
    return ordered;
  }, [filtered]);

  const startCreate = async () => {
    setCreating(true);
    try {
      const ref = await add({ ...emptyRental, createdAt: serverTimestamp() });
      navigate(`/rentals/${ref.id}`);
    } catch (err) {
      console.error(err);
      alert("建立失敗，請再試一次");
    }
    setCreating(false);
  };

  const RentalCard = ({ r }) => (
    <div className="card compact" onClick={() => navigate(`/rentals/${r.id}`)} style={{ cursor: "pointer" }}>
      <div className="name">{r.title || "（尚未命名）"}</div>
      <div className="meta">
        {r.landlordName && <>屋主 {r.landlordName}{r.landlordPhone ? `・${r.landlordPhone}` : ""}</>}
        {r.propertyAddress && <>　｜　{r.propertyAddress}</>}
        <br />
        {r.tenantName && <>房客 {r.tenantName}　</>}
        {r.rent && <>租金 {r.rent}元/月　</>}
        {r.deposit && <>押金 {r.deposit}{r.depositReturned ? "（已退）" : ""}　</>}
        {r.leaseEndDate && r.status === "leased" && <>租期至 {formatDateRoc(r.leaseEndDate)}</>}
        {r.status === "seeking" && (r.adPlatforms || []).length > 0 && (
          <>已刊登 {r.adPlatforms.length} 個平台</>
        )}
      </div>
    </div>
  );

  return (
    <main>
      <div className="top-actions">
        <div className="section-title">出租管理（{items.length}）</div>
        <button className="btn" onClick={startCreate} disabled={creating}>
          {creating ? "建立中…" : "＋ 新增出租"}
        </button>
      </div>

      <div style={{ marginBottom: 14 }}>
        <input
          value={keyword}
          onChange={(e) => setKeyword(e.target.value)}
          placeholder="搜尋案名、地址、屋主、房客…"
          style={{ width: "100%", maxWidth: 360, padding: "10px 12px", border: "1px solid var(--border)", borderRadius: 7, fontSize: 14 }}
        />
      </div>

      <div style={{ display: "flex", gap: 8, marginBottom: 20, flexWrap: "wrap" }}>
        <button className={statusFilter === "全部" ? "btn" : "btn ghost"} onClick={() => setStatusFilter("全部")}>全部（{counts["全部"]}）</button>
        {STATUS_ORDER.map((s) => (
          <button key={s} className={statusFilter === s ? "btn" : "btn ghost"} onClick={() => setStatusFilter(s)}>
            {STATUS_LABELS[s]}（{counts[s]}）
          </button>
        ))}
      </div>

      {filtered.length === 0 ? (
        <div className="panel">
          <div className="empty-state">
            <div className="big">還沒有出租資料</div>
            點右上角「＋ 新增出租」開始建檔
          </div>
        </div>
      ) : statusFilter === "全部" ? (
        <div className="board">
          {Object.entries(columns).map(([label, rows]) => (
            <div key={label}>
              <div className="col-head">{label} <span>{rows.length}</span></div>
              {rows.map((r) => <RentalCard key={r.id} r={r} />)}
            </div>
          ))}
        </div>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))", gap: 12, alignItems: "start" }}>
          {filtered.map((r) => <RentalCard key={r.id} r={r} />)}
        </div>
      )}
    </main>
  );
}
