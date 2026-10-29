import { useCallback, useEffect, useRef, useState } from "react";
import { useAuth } from "../AuthContext";
import { referenceKey } from "../lib/propertyMarketReference";

const cache = new Map();
const TTL = 5 * 60 * 1000;

async function requestReference(user, key, force) {
  const current = cache.get(key);
  if (!force && current && Date.now() - current.at < TTL) return current.promise;
  const promise = (async () => {
    const token = await user.getIdToken();
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 16000);
    try {
      const response = await fetch("/api/market/reference", {
        method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ ...JSON.parse(key), refresh: force }), signal: controller.signal,
      });
      const payload = await response.json();
      if (!response.ok || !Array.isArray(payload.deals)) throw new Error("unavailable");
      return payload;
    } finally { clearTimeout(timer); }
  })();
  if (cache.size > 128) cache.clear();
  cache.set(key, { promise, at: Date.now() });
  try { return await promise; } catch (e) { if (cache.get(key)?.promise === promise) cache.delete(key); throw e; }
}

export function useMarketReference(property, enabled = true) {
  const { user } = useAuth();
  const key = referenceKey(property || {});
  const sequence = useRef(0);
  const [state, setState] = useState({ key: "", data: null, loading: false, error: "" });
  const load = useCallback(async (force = false) => {
    if (!user || !enabled) return;
    const request = ++sequence.current;
    setState((s) => ({ key, data: s.key === key ? s.data : null, loading: true, error: "" }));
    try {
      const data = await requestReference(user, key, force);
      if (request === sequence.current) setState({ key, data, loading: false, error: "" });
    } catch {
      if (request === sequence.current) setState({ key, data: null, loading: false, error: "市場參考暫時無法更新。請確認 Mac 的市場開發程式與網路通道正在運作，再按「更新參考」。" });
    }
  }, [user, enabled, key]);
  useEffect(() => {
    if (enabled && user) load();
    return () => { sequence.current++; };
  }, [load, enabled, user]);
  return {
    key, data: state.key === key ? state.data : null,
    loading: enabled && (state.key !== key || state.loading), error: state.key === key ? state.error : "",
    refresh: () => load(true),
  };
}
