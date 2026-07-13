import React, { createContext, useContext, useEffect, useState, useCallback } from "react";

// 這是在 Google Cloud Console 建立的 OAuth 用戶端 ID，屬於公開資訊，
// 安全性是靠 Cloud Console 裡設定的「已授權的 JavaScript 來源」把關，不是靠隱藏這串文字。
const CLIENT_ID = "67951666720-k1qder1i93lrm8kjp4p6f1iubt91qra9.apps.googleusercontent.com";
const SCOPE = "https://www.googleapis.com/auth/calendar.events";
const STORAGE_KEY = "gcal_session";

const GoogleAuthContext = createContext(null);

function loadSaved() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (parsed.expiresAt && parsed.expiresAt > Date.now()) return parsed;
    return null;
  } catch {
    return null;
  }
}

export function GoogleAuthProvider({ children }) {
  const [session, setSession] = useState(() => loadSaved());
  const [tokenClient, setTokenClient] = useState(null);
  const [gsiReady, setGsiReady] = useState(false);

  useEffect(() => {
    const check = setInterval(() => {
      if (window.google && window.google.accounts && window.google.accounts.oauth2) {
        setGsiReady(true);
        clearInterval(check);
      }
    }, 300);
    return () => clearInterval(check);
  }, []);

  useEffect(() => {
    if (!gsiReady) return;
    const client = window.google.accounts.oauth2.initTokenClient({
      client_id: CLIENT_ID,
      scope: SCOPE,
      callback: async (resp) => {
        if (resp.error) return;
        const expiresAt = Date.now() + (resp.expires_in - 60) * 1000;
        let email = "";
        try {
          const r = await fetch("https://www.googleapis.com/oauth2/v3/userinfo", {
            headers: { Authorization: `Bearer ${resp.access_token}` },
          });
          const data = await r.json();
          email = data.email || "";
        } catch {
          // 拿不到 email 也沒關係，不影響同步功能
        }
        const next = { accessToken: resp.access_token, expiresAt, email };
        setSession(next);
        localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      },
    });
    setTokenClient(client);
  }, [gsiReady]);

  const connect = useCallback(() => {
    if (tokenClient) tokenClient.requestAccessToken();
  }, [tokenClient]);

  const disconnect = useCallback(() => {
    if (session && window.google) {
      window.google.accounts.oauth2.revoke(session.accessToken, () => {});
    }
    setSession(null);
    localStorage.removeItem(STORAGE_KEY);
  }, [session]);

  const isConnected = !!session && session.expiresAt > Date.now();

  const authedFetch = useCallback(
    (url, options = {}) => {
      if (!isConnected) return Promise.reject(new Error("尚未連結 Google 帳號"));
      return fetch(url, {
        ...options,
        headers: {
          ...(options.headers || {}),
          Authorization: `Bearer ${session.accessToken}`,
          "Content-Type": "application/json",
        },
      });
    },
    [isConnected, session]
  );

  const buildEventBody = ({ title, date, time, durationMinutes = 60, notes }) => {
    if (time) {
      const startDateTime = `${date}T${time}:00`;
      const [h, m] = time.split(":").map(Number);
      const endDate = new Date(`${date}T00:00:00`);
      endDate.setHours(h, m + durationMinutes);
      const pad = (n) => String(n).padStart(2, "0");
      const endDateTime = `${endDate.getFullYear()}-${pad(endDate.getMonth() + 1)}-${pad(
        endDate.getDate()
      )}T${pad(endDate.getHours())}:${pad(endDate.getMinutes())}:00`;
      return {
        summary: title,
        description: notes || "",
        start: { dateTime: startDateTime, timeZone: "Asia/Taipei" },
        end: { dateTime: endDateTime, timeZone: "Asia/Taipei" },
      };
    }
    return {
      summary: title,
      description: notes || "",
      start: { date },
      end: { date },
    };
  };

  const createEvent = useCallback(
    async (payload) => {
      const res = await authedFetch(
        "https://www.googleapis.com/calendar/v3/calendars/primary/events",
        {
          method: "POST",
          body: JSON.stringify(buildEventBody(payload)),
        }
      );
      if (!res.ok) throw new Error("建立行事曆事件失敗");
      return res.json();
    },
    [authedFetch]
  );

  const updateEvent = useCallback(
    async (eventId, payload) => {
      const res = await authedFetch(
        `https://www.googleapis.com/calendar/v3/calendars/primary/events/${eventId}`,
        {
          method: "PATCH",
          body: JSON.stringify(buildEventBody(payload)),
        }
      );
      if (!res.ok) throw new Error("更新行事曆事件失敗");
      return res.json();
    },
    [authedFetch]
  );

  const deleteEvent = useCallback(
    async (eventId) => {
      await authedFetch(
        `https://www.googleapis.com/calendar/v3/calendars/primary/events/${eventId}`,
        { method: "DELETE" }
      );
    },
    [authedFetch]
  );

  return (
    <GoogleAuthContext.Provider
      value={{
        isConnected,
        email: session?.email || "",
        connect,
        disconnect,
        createEvent,
        updateEvent,
        deleteEvent,
        gsiReady,
      }}
    >
      {children}
    </GoogleAuthContext.Provider>
  );
}

export function useGoogleAuth() {
  return useContext(GoogleAuthContext);
}
