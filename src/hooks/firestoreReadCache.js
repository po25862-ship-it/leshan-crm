const entries = new Map();

function ensureEntry(key) {
  if (!entries.has(key)) {
    entries.set(key, {
      data: undefined,
      error: null,
      loading: false,
      promise: null,
      subscribers: new Set(),
    });
  }
  return entries.get(key);
}

function snapshot(entry) {
  return {
    data: entry.data,
    error: entry.error,
    loading: entry.loading,
  };
}

function notify(entry) {
  const next = snapshot(entry);
  entry.subscribers.forEach((subscriber) => subscriber(next));
}

// 所有頁面共用同一份記憶體資料。同一個查詢即使同時被多個元件使用，
// 也只會向 Firestore 發出一次請求。
export function subscribeReadCache(key, subscriber) {
  const entry = ensureEntry(key);
  entry.subscribers.add(subscriber);
  subscriber(snapshot(entry));
  return () => entry.subscribers.delete(subscriber);
}

export function loadReadCache(key, loader, force = false) {
  const entry = ensureEntry(key);
  if (!force && entry.data !== undefined) return Promise.resolve(entry.data);
  if (entry.promise) return entry.promise;

  entry.loading = true;
  entry.error = null;
  notify(entry);

  entry.promise = Promise.resolve()
    .then(loader)
    .then((data) => {
      entry.data = data;
      entry.error = null;
      return data;
    })
    .catch((error) => {
      entry.error = error;
      throw error;
    })
    .finally(() => {
      entry.loading = false;
      entry.promise = null;
      notify(entry);
    });

  return entry.promise;
}

export function updateReadCache(key, updater) {
  const entry = ensureEntry(key);
  const current = entry.data === undefined ? [] : entry.data;
  entry.data = typeof updater === "function" ? updater(current) : updater;
  entry.error = null;
  notify(entry);
  return entry.data;
}
