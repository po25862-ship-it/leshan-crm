export const TEXT_SIZE_OPTIONS = [
  { value: "standard", label: "標準", scale: 1 },
  { value: "large", label: "大", scale: 1.125 },
  { value: "xlarge", label: "特大", scale: 1.25 },
];

export function textSizeKey(userId) {
  return `leshan:reading-size:v1:${userId}`;
}

export function normalizeTextSizes(value) {
  const valid = (size) => TEXT_SIZE_OPTIONS.some((option) => option.value === size) ? size : "standard";
  return { desktop: valid(value?.desktop), mobile: valid(value?.mobile) };
}

export function readTextSizes(storage, userId) {
  try {
    return normalizeTextSizes(JSON.parse(storage.getItem(textSizeKey(userId))));
  } catch {
    return normalizeTextSizes(null);
  }
}

export function writeTextSizes(storage, userId, preferences) {
  try {
    storage.setItem(textSizeKey(userId), JSON.stringify(normalizeTextSizes(preferences)));
    return true;
  } catch {
    return false;
  }
}
