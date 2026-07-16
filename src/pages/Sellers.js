import React, { useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { addDoc, collection, serverTimestamp } from "firebase/firestore";
import { db } from "../firebase";
import { useCollection } from "../hooks/useCollection";
import { useCollectionGroup } from "../hooks/useCollectionGroup";
import { formatDate, todayStr } from "../lib/dates";

const STATUS_LABELS = { tracking: "追蹤中", listed: "已委託", expired: "已過期", sold: "已出售" };
const STATUS_ORDER = ["tracking", "listed", "expired", "sold"];

export default function Sellers() {
  const navigate = useNavigate();
  const { items: contacts, add: addContact } = useCollection("contacts", "name");
  const listings = useCollectionGroup("listings");

  const [keyword, setKeyword] = useState("");
  const [statusFilter, setStatusFilter] = useState("全部");
  const [showNewForm, setShowNewForm] = useState(false);
  const [newMode, setNewMode] = useState("existing"); // existing | new
  const [selectedContactId, setSelectedContactId] = useState("");
  const [newName, setNewName] = useState("");
  const [newPhone, setNewPhone] = useState("");
  const [creating, setCreating] = useState(false);

  const sellerContacts = contacts.filter((c) => (c.tags || []).includes("賣方"));
  const contactMap = useMemo(() => {
    const map = {};
    contacts.forEach((c) => (map[c.id] = c));
    return map;
  }, [contacts]);

  const enriched = listings.map((l) => ({
    ...l,
    contactId: l.parentId,
    owner: contactMap[l.parentId] || null,
  }));

  const byStatus = (s) => enriched.filter((l) => (l.status || "tracking") === s);
  const counts = {
    全部: enriched.length,
    tracking: byStatus("tracking").length,
    listed: byStatus("listed").length,
    expired: byStatus("expired").length,
    sold: byStatus("sold").length,
  };

  const filtered = enriched.filter((l) => {
    if (statusFilter !== "全部" && (l.status || "tracking") !== statusFilter) return false;
    if (!keyword.trim()) return true;
    const k = keyword.trim();
    return (
      (l.title || "").includes(k) ||
      (l.propertyAddress || "").includes(k) ||
      (l.owner?.name || "").includes(k)
    );
  });

  const columns = useMemo(() => {
    const map = {};
    filtered.forEach((l) => {
      const key = STATUS_LABELS[l.status || "tracking"];
      if (!map[key]) map[key] = [];
      map[key].push(l);
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
      let contactId = selectedContactId;
      if (newMode === "new") {
        if (!newName.trim()) {
          setCreating(false);
          return;
        }
        const ref = await addContact({
          name: newName.trim(),
          phone: newPhone.trim(),
          tags: ["賣方"],
          source: "",
          notes: "",
          lastContactDate: todayStr(),
        });
        contactId = ref.id;
      }
      if (!contactId) {
        setCreating(false);
        return;
      }
      const listingRef = await addDoc(collection(db, `contacts/${contactId}/listings`), {
        title: "",
        propertyId: null,
        category: "公寓",
        store: "捷運樂善直營店",
        propertyUrl: "",
        propertyAddress: "",
        price: "",
        status: "tracking",
        listingNo: "",
        agreementType: "一般",
        agreementStartDate: "",
        agreementEndDate: "",
        askingPrice: "",
        floorPrice: "",
        adPlatforms: [],
        documentUrl: null,
        documentName: null,
        documentType: null,
        createdAt: serverTimestamp(),
      });
      navigate(`/sellers/${contactId}/${listingRef.id}`);
    } catch (err) {
      console.error(err);
      alert("建立失敗，請再試一次");
    }
    setCreating(false);
  };

  return (
    <main>
      <div className="top-actions">
        <div className="section-title">賣方委託（{enriched.length}）</div>
        <button className="btn" onClick={() => setShowNewForm(!showNewForm)}>
          ＋ 新增委託
        </button>
      </div>

      {showNewForm && (
        <div className="panel" style={{ marginBottom: 20, maxWidth: 480 }}>
          <div style={{ display: "flex", gap: 16, marginBottom: 12, fontSize: 13 }}>
            <label style={{ display: "flex", alignItems: "center", gap: 6, cursor: "pointer" }}>
              <input type="radio" checked={newMode === "existing"} onChange={() => setNewMode("existing")} />
              選擇已有的賣方客戶
            </label>
            <label style={{ display: "flex", alignItems: "center", gap: 6, cursor: "pointer" }}>
              <input type="radio" checked={newMode === "new"} onChange={() => setNewMode("new")} />
              新增賣方客戶
            </label>
          </div>
          {newMode === "existing" ? (
            <select value={selectedContactId} onChange={(e) => setSelectedContactId(e.target.value)} style={{ width: "100%", padding: "10px 12px", border: "1px solid var(--border)", borderRadius: 7 }}>
              <option value="">— 選擇賣方客戶 —</option>
              {sellerContacts.map((c) => (
                <option key={c.id} value={c.id}>{c.name}{c.phone ? `（${c.phone}）` : ""}</option>
              ))}
            </select>
          ) : (
            <div style={{ display: "flex", gap: 10 }}>
              <input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="姓名" style={{ flex: 1, padding: "10px 12px", border: "1px solid var(--border)", borderRadius: 7 }} />
              <input value={newPhone} onChange={(e) => setNewPhone(e.target.value)} placeholder="電話" style={{ flex: 1, padding: "10px 12px", border: "1px solid var(--border)", borderRadius: 7 }} />
            </div>
          )}
          <div style={{ display: "flex", gap: 10, marginTop: 14 }}>
            <button className="btn" onClick={startCreate} disabled={creating}>
              {creating ? "建立中…" : "建立並繼續填寫"}
            </button>
            <button className="btn ghost" onClick={() => setShowNewForm(false)}>取消</button>
          </div>
        </div>
      )}

      <div style={{ marginBottom: 14 }}>
        <input
          value={keyword}
          onChange={(e) => setKeyword(e.target.value)}
          placeholder="搜尋屋主姓名、案名、地址…"
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
            <div className="big">還沒有賣方委託</div>
            點右上角「＋ 新增委託」開始建檔
          </div>
        </div>
      ) : (
        <div className="board">
          {Object.entries(columns).map(([label, items]) => (
            <div key={label}>
              <div className="col-head">{label} <span>{items.length}</span></div>
              {items.map((l) => (
                <div
                  className="card"
                  key={`${l.contactId}-${l.id}`}
                  onClick={() => navigate(`/sellers/${l.contactId}/${l.id}`)}
                  style={{ cursor: "pointer" }}
                >
                  <div className="name">{l.title || "（尚未命名）"}</div>
                  <div className="meta">
                    {l.owner && <>屋主：{l.owner.name}{l.owner.phone ? `・${l.owner.phone}` : ""}<br /></>}
                    {l.propertyAddress && <>{l.propertyAddress}<br /></>}
                    {l.price && <>價格：{l.price} 萬　</>}
                    {l.askingPrice && <>開價：{l.askingPrice} 萬　</>}
                    {l.floorPrice && <>底價：{l.floorPrice} 萬</>}
                    {l.agreementEndDate && l.status === "listed" && (
                      <><br />委託到期：{formatDate(l.agreementEndDate)}</>
                    )}
                  </div>
                </div>
              ))}
            </div>
          ))}
        </div>
      )}
    </main>
  );
}
