// Shared choices travel with the existing shared property records; no extra listener or collection.
export const PROPERTY_TAG_LIMIT = 20;
export const PROPERTY_CHOICE_HISTORY_LIMIT = 120;
export const PROPERTY_TAG_LENGTH = 24;
export const VIEWING_METHOD_LENGTH = 100;

export function choiceText(value) {
  return typeof value === "string" ? value.normalize("NFKC").replace(/\s+/g, " ").trim() : "";
}

export function choiceKey(value) {
  return choiceText(value).toLocaleLowerCase("zh-TW");
}

export function filterPropertyChoices(values, query) {
  const key = choiceKey(query);
  const rank = value => choiceKey(value) === key ? 0 : choiceKey(value).startsWith(key) ? 1 : 2;
  return uniqueChoices(values).filter(value => !key || choiceKey(value).includes(key))
    .sort((a, b) => key ? rank(a) - rank(b) || a.localeCompare(b, "zh-Hant") : 0);
}

export function uniqueChoices(values, limit = Infinity) {
  const seen = new Set();
  return (Array.isArray(values) ? values : []).map(choiceText).filter((value) => {
    const key = choiceKey(value);
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  }).slice(0, limit);
}

export function propertyTags(value) {
  return uniqueChoices(Array.isArray(value) ? value : typeof value === "string" ? value.split(/[、,，\n]/) : []);
}

export function sharedPropertyChoices(properties = []) {
  const tags = [], viewingMethods = [];
  properties.forEach((property) => {
    tags.push(...propertyTags(property.tags), ...propertyTags(property.tagCatalog));
    viewingMethods.push(property.viewingMethod, ...uniqueChoices(property.viewingMethodCatalog));
  });
  const sort = (values) => uniqueChoices(values).sort((a, b) => a.localeCompare(b, "zh-Hant", { numeric: true }));
  return { tags: sort(tags), viewingMethods: sort(viewingMethods) };
}

// Keep previously used values even after removing a tag or changing a method on this property.
export function propertyChoiceFields(form, previous = {}) {
  const tags = propertyTags(form.tags);
  const viewingMethod = choiceText(form.viewingMethod);
  return {
    tags,
    viewingMethod,
    tagCatalog: uniqueChoices([...tags, ...propertyTags(form.tagCatalog), ...propertyTags(previous.tags), ...propertyTags(previous.tagCatalog)], PROPERTY_CHOICE_HISTORY_LIMIT),
    viewingMethodCatalog: uniqueChoices([viewingMethod, ...uniqueChoices(form.viewingMethodCatalog), previous.viewingMethod, ...uniqueChoices(previous.viewingMethodCatalog)], PROPERTY_CHOICE_HISTORY_LIMIT),
  };
}

export function matchesPropertyTags(property, selectedTags) {
  const actual = new Set(propertyTags(property?.tags).map(choiceKey));
  return propertyTags(selectedTags).every((tag) => actual.has(choiceKey(tag)));
}

export function featureTerms(value) {
  return uniqueChoices(Array.isArray(value) ? value : String(value || "").split(/[、,，\n]/));
}

// An explicitly removed tag in the choice history must never become a positive match.
export function matchesPropertyFeature(property, feature, fallbackText = "") {
  const key = choiceKey(feature);
  if (!key) return false;
  if (propertyTags(property?.tags).some((tag) => choiceKey(tag) === key)) return true;
  if (propertyTags(property?.tagCatalog).some((tag) => choiceKey(tag) === key)) return false;
  return choiceKey(fallbackText).includes(key);
}
