// Accept common hand-typed forms while keeping stored times in 24-hour HH:mm format.
export function normalizeTimeInput(value) {
  const text = String(value || "").normalize("NFKC").trim().replace(/\s/g, "");
  let hours;
  let minutes;
  let match = text.match(/^(\d{1,2}):(\d{2})$/);
  if (match) {
    hours = Number(match[1]);
    minutes = Number(match[2]);
  } else {
    match = text.match(/^(\d{1,2})(\d{2})$/);
    if (match) {
      hours = Number(match[1]);
      minutes = Number(match[2]);
    } else if (/^\d{1,2}$/.test(text)) {
      hours = Number(text);
      minutes = 0;
    } else {
      return null;
    }
  }
  if (hours > 23 || minutes > 59) return null;
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
}
