const communities = require("./a7-communities.json");

function normalize(value) {
  return String(value || "")
    .normalize("NFKC")
    .replace(/臺/g, "台")
    .replace(/悦/g, "悅")
    .replace(/[\s　,，、．.]/g, "")
    .toLowerCase();
}

const addressIndex = new Map();
for (const community of communities) {
  for (const [street, numbers] of Object.entries(community.streets)) {
    for (const number of numbers) {
      const key = normalize(`${street}${number}號`);
      const names = addressIndex.get(key) || new Set();
      names.add(community.name);
      addressIndex.set(key, names);
    }
  }
}

const aliases = communities.flatMap(({ name }) => name.split("／").map((alias) => ({
  name,
  alias: normalize(alias),
}))).sort((a, b) => b.alias.length - a.alias.length);

function inferCommunity(property) {
  const address = normalize(property.address);
  const title = normalize(property.title);
  const addressMatches = new Set();
  if (address) {
    for (const [doorplate, names] of addressIndex) {
      if (!address.includes(doorplate)) continue;
      for (const name of names) addressMatches.add(name);
    }
  }
  if (addressMatches.size > 1) return null;
  const byAddress = [...addressMatches][0];
  const titleMatches = aliases.filter(({ alias }) => title.includes(alias));
  const longest = titleMatches[0]?.alias.length || 0;
  const bestTitleNames = new Set(titleMatches.filter(({ alias }) => alias.length === longest).map(({ name }) => name));
  const byTitle = bestTitleNames.size === 1 ? [...bestTitleNames][0] : null;
  if (byAddress && byTitle && byAddress !== byTitle) return null;
  if (byAddress) return { name: byAddress, method: "exact-address" };
  if (byTitle) return { name: byTitle, method: "title" };

  // The CRM screenshot supplied by the owner confirms this specific property.
  if (address.includes(normalize("牛角坡路49號")) && title.includes(normalize("智匯學"))) {
    return { name: "智匯學", method: "owner-confirmed" };
  }
  return null;
}

module.exports = { communities, inferCommunity, normalize };
