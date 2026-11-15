import { choiceKey, choiceText } from "./propertyChoices";

export const MAX_BUYER_SOURCE_CHANGES = 400;

export function buyerSourceGroups(buyers = []) {
  const groups = new Map();
  buyers.forEach(buyer => {
    const key = choiceKey(buyer.source);
    if (!key) return;
    if (!groups.has(key)) groups.set(key, { key, name: choiceText(buyer.source), buyers: [], variants: new Set() });
    const group = groups.get(key);
    group.buyers.push(buyer);
    group.variants.add(buyer.source);
  });
  return [...groups.values()].sort((a, b) => a.name.localeCompare(b.name, "zh-Hant", { numeric: true }));
}

export function buyerSourceChanges(buyers, sourceKey, target) {
  const after = choiceText(target);
  return buyers.filter(buyer => choiceKey(buyer.source) === sourceKey && buyer.source !== after)
    .map(buyer => ({ id: buyer.id, before: buyer.source, after }));
}

export function reverseSourceChanges(changes) {
  return changes.map(({ id, before, after }) => ({ id, before: after, after: before }));
}
