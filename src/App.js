import React from "react";
import { HashRouter, Routes, Route, NavLink } from "react-router-dom";
import Dashboard from "./pages/Dashboard";
import Sellers from "./pages/Sellers";
import SellerDetail from "./pages/SellerDetail";
import Buyers from "./pages/Buyers";
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

function AppShell() {
  const { user } = useAuth();
  const isMobile = useIsMobile();

  if (user === undefined) {
    return <main style={{ padding: 40 }}>載入中…</main>;
  }
  if (user === null) {
    return <Login />;
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
