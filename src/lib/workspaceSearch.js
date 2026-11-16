import { matchesPropertyKeyword } from "./propertyKeywordSearch";
import { canManageNeed, needShareTitle } from "./needPrivacy";
import { COMPANY_RENTAL_STATUSES } from "./companyRental";

export const workspaceSearchText = value => String(value ?? "").normalize("NFKC").replace(/臺/g, "台").toLowerCase();
const words = value => workspaceSearchText(value).trim().split(/\s+/).filter(Boolean);
const joins = values => values.filter(value => value !== undefined && value !== null && value !== "").join("・");
const statusLabel = value => ({ active: "在售", onHold: "暫時不賣", sold: "已售出" }[value || "active"] || "狀態待確認");
const linkTo = (path, key, id) => `${path}?${new URLSearchParams({ [key]: id })}`;
const match = (values, terms) => {
  const text = workspaceSearchText(values.filter(Boolean).join(" "));
  return terms.every(term => text.includes(term) || (/^[\d-]+$/.test(term) && text.replace(/[\s-]/g, "").includes(term.replace(/-/g, ""))));
};

// Callers supply the same permission-filtered collections used by the management pages.
// In particular, another colleague's shared need must never become searchable by private fields.
export function searchWorkspace({ query, uid, properties = [], buyers = [], needs = [], rentals = [], limit = 4 }) {
  const terms = words(query);
  if (!terms.length) return [];
  const q = terms.join(" ");
  const groups = [
    { key: "properties", label: "物件", rows: properties.filter(p => p.id && matchesPropertyKeyword(p, q)).map(p => ({
      id: p.id, title: p.title || "未命名物件", subtitle: joins([p.listingNo, p.communityName, p.address]),
      status: statusLabel(p.status), exact: workspaceSearchText(p.listingNo) === q || workspaceSearchText(p.title) === q,
      to: linkTo("/properties", "open", p.id),
    })) },
    { key: "buyers", label: "買方", rows: buyers.filter(b => b.id && b.tags?.includes("買方") && match([b.name, b.phone, b.source], terms)).map(b => ({
      id: b.id, title: b.name || "未命名買方", subtitle: joins([b.phone, b.source]), status: "買方",
      exact: workspaceSearchText(b.name) === q || workspaceSearchText(b.phone) === q, to: linkTo("/buyers", "open", b.id),
    })) },
    { key: "needs", label: "買方客需", rows: needs.flatMap(n => {
      const own = canManageNeed(n, uid), title = own ? n.title || n.contactName || needShareTitle(n) : needShareTitle(n);
      const area = (n.areas || []).flatMap(a => [a.city, a.district, a.community]);
      if (!n.id || !match([title, ...area, ...(own ? [n.contactName] : [])], terms)) return [];
      return [{ id: n.id, title, subtitle: joins(area), status: n.statusTag || "正在找", exact: workspaceSearchText(title) === q, to: linkTo("/needs", "open", n.id) }];
    }) },
    { key: "rentals", label: "公司租賃", rows: rentals.filter(r => r.id && match([r.title, r.community, r.city, r.district, r.street, r.area, r.agentName], terms)).map(r => ({
      id: r.id, title: r.title || "未命名租賃物件", subtitle: joins([r.community, `${r.city || ""}${r.district || ""}${r.street || ""}`, r.agentName]),
      status: COMPANY_RENTAL_STATUSES[r.status] || "狀態待確認", exact: workspaceSearchText(r.title) === q, to: linkTo("/company-rentals", "rentalOpen", r.id),
    })) },
  ];
  return groups.map(group => ({ ...group, count: group.rows.length, rows: [...group.rows].sort((a, b) => Number(b.exact) - Number(a.exact) || a.title.localeCompare(b.title, "zh-Hant", { numeric: true })).slice(0, limit) }));
}
