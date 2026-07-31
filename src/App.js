import React, { useState } from "react";
import { HashRouter, Routes, Route, NavLink } from "react-router-dom";
import { doc, setDoc, serverTimestamp } from "firebase/firestore";
import { db } from "./firebase";
import { useDoc } from "./hooks/useDoc";
import Dashboard from "./pages/Dashboard";
import Sellers from "./pages/Sellers";
import SellerDetail from "./pages/SellerDetail";
import Buyers from "./pages/Buyers";
import Rentals from "./pages/Rentals";
import RentalDetail from "./pages/RentalDetail";
import QuickNotes from "./pages/QuickNotes";
import Cases from "./pages/Cases";
import Topics from "./pages/Topics";
import Properties from "./pages/Properties";
import Needs from "./pages/Needs";
import Settings from "./pages/Settings";
import CalendarPage from "./pages/Calendar";
import MobileMore from "./pages/MobileMore";
import Login from "./pages/Login";
import { AuthProvider, useAuth } from "./AuthContext";
import { GoogleAuthProvider } from "./GoogleAuthContext";
import { useIsMobile } from "./hooks/useIsMobile";
import { MobileTopBar, MobileBottomNav } from "./MobileShell";
import "./mobile.css";

function DesktopHeader() {
  const { logout } = useAuth();
  return (
    <header className="app-header">
      <div className="brand">
        <h1>案件控台</h1>
        <span>劉昭佑 · 台灣房屋捷運樂善直營店</span>
      </div>
      <nav className="app-nav">
        <NavLink to="/" end className={({ isActive }) => (isActive ? "active" : "")}>
          總覽
        </NavLink>
        <NavLink to="/sellers" className={({ isActive }) => (isActive ? "active" : "")}>
          賣方
        </NavLink>
        <NavLink to="/buyers" className={({ isActive }) => (isActive ? "active" : "")}>
          買方
        </NavLink>
        <NavLink to="/rentals" className={({ isActive }) => (isActive ? "active" : "")}>
          出租
        </NavLink>
        <NavLink to="/quicknotes" className={({ isActive }) => (isActive ? "active" : "")}>
          待辦
        </NavLink>
        <NavLink to="/cases" className={({ isActive }) => (isActive ? "active" : "")}>
          成交案件
        </NavLink>
        <NavLink to="/properties" className={({ isActive }) => (isActive ? "active" : "")}>
          物件
        </NavLink>
        <NavLink to="/needs" className={({ isActive }) => (isActive ? "active" : "")}>
          客需
        </NavLink>
        <NavLink to="/topics" className={({ isActive }) => (isActive ? "active" : "")}>
          商談事項
        </NavLink>
        <NavLink to="/calendar" className={({ isActive }) => (isActive ? "active" : "")}>
          行事曆
        </NavLink>
        <NavLink to="/settings" className={({ isActive }) => (isActive ? "active" : "")}>
          設定
        </NavLink>
        <button className="btn ghost" onClick={logout} style={{ marginLeft: 8 }}>
          登出
        </button>
      </nav>
    </header>
  );
}

function AppRoutes() {
  return (
    <Routes>
      <Route path="/" element={<Dashboard />} />
      <Route path="/sellers" element={<Sellers />} />
      <Route path="/sellers/:contactId/:listingId" element={<SellerDetail />} />
      <Route path="/buyers" element={<Buyers />} />
      <Route path="/rentals" element={<Rentals />} />
      <Route path="/rentals/:rentalId" element={<RentalDetail />} />
      <Route path="/quicknotes" element={<QuickNotes />} />
      <Route path="/cases" element={<Cases />} />
      <Route path="/properties" element={<Properties />} />
      <Route path="/needs" element={<Needs />} />
      <Route path="/topics" element={<Topics />} />
      <Route path="/settings" element={<Settings />} />
      <Route path="/calendar" element={<CalendarPage />} />
      <Route path="/more" element={<MobileMore />} />
    </Routes>
  );
}

function NamePrompt({ uid, email, onDone }) {
  const [name, setName] = useState("");
  const [saving, setSaving] = useState(false);

  const onSubmit = async (e) => {
    e.preventDefault();
    if (!name.trim()) return;
    setSaving(true);
    try {
      await setDoc(doc(db, "colleagues", uid), { name: name.trim(), email: email || "", createdAt: serverTimestamp() }, { merge: true });
      onDone();
    } catch (err) {
      console.error(err);
      alert("儲存失敗，請再試一次");
    }
    setSaving(false);
  };

  return (
    <main style={{ maxWidth: 380, margin: "80px auto" }}>
      <div className="section-title">請設定你的姓名</div>
      <div className="panel">
        <div style={{ fontSize: 13, color: "var(--muted)", marginBottom: 14 }}>
          系統裡還沒有你的姓名資料（可能是上次註冊時漏掉了），補填一次就好，之後同事分享資料給你時才看得到是你。
        </div>
        <form className="form-grid" onSubmit={onSubmit}>
          <div className="form-field">
            <label>姓名</label>
            <input value={name} onChange={(e) => setName(e.target.value)} required autoFocus />
          </div>
          <button className="btn" type="submit" disabled={saving}>
            {saving ? "儲存中…" : "儲存並繼續"}
          </button>
        </form>
      </div>
    </main>
  );
}

function AppShell() {
  const { user } = useAuth();
  const isMobile = useIsMobile();
  const { data: colleagueProfile, loading: profileLoading } = useDoc(
    user ? `colleagues/${user.uid}` : "colleagues/_placeholder",
    { name: "" }
  );

  if (user === undefined) {
    return <main style={{ padding: 40 }}>載入中…</main>;
  }
  if (user === null) {
    return <Login />;
  }
  if (profileLoading) {
    return <main style={{ padding: 40 }}>載入中…</main>;
  }
  if (!colleagueProfile.name) {
    return <NamePrompt uid={user.uid} email={user.email} onDone={() => {}} />;
  }

  return (
    <HashRouter>
      {isMobile ? (
        <div className="mobile-shell">
          <MobileTopBar />
          <AppRoutes />
          <MobileBottomNav />
        </div>
      ) : (
        <>
          <DesktopHeader />
          <AppRoutes />
        </>
      )}
    </HashRouter>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <GoogleAuthProvider>
        <AppShell />
      </GoogleAuthProvider>
    </AuthProvider>
  );
}
