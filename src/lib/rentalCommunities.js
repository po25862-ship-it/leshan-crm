import source from "./a7-community-options.json";

const key = value => String(value || "").normalize("NFKC").toLowerCase().replace(/\s+/g, "");
export const A7_RENTAL_COMMUNITIES = source.communities.slice().sort((a, b) => a.name.localeCompare(b.name, "zh-Hant"));

export function searchRentalCommunities(query) {
  const term = key(query);
  return term ? A7_RENTAL_COMMUNITIES.filter(row => [row.name, ...row.aliases].some(name => key(name).includes(term))) : A7_RENTAL_COMMUNITIES;
}
