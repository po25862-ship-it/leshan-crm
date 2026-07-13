import React from "react";
import { HashRouter, Routes, Route, NavLink } from "react-router-dom";
import Dashboard from "./pages/Dashboard";
import Contacts from "./pages/Contacts";
import Cases from "./pages/Cases";
import Topics from "./pages/Topics";
import Settings from "./pages/Settings";
import Login from "./pages/Login";
import { AuthProvider, useAuth } from "./AuthContext";

function Header() {
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
        <NavLink to="/contacts" className={({ isActive }) => (isActive ? "active" : "")}>
          客戶
        </NavLink>
        <NavLink to="/cases" className={({ isActive }) => (isActive ? "active" : "")}>
          案件
        </NavLink>
        <NavLink to="/topics" className={({ isActive }) => (isActive ? "active" : "")}>
          商談事項
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

function AppShell() {
  const { user } = useAuth();

  if (user === undefined) {
    return <main style={{ padding: 40 }}>載入中…</main>;
  }
  if (user === null) {
    return <Login />;
  }

  return (
    <HashRouter>
      <Header />
      <Routes>
        <Route path="/" element={<Dashboard />} />
        <Route path="/contacts" element={<Contacts />} />
        <Route path="/cases" element={<Cases />} />
        <Route path="/topics" element={<Topics />} />
        <Route path="/settings" element={<Settings />} />
      </Routes>
    </HashRouter>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <AppShell />
    </AuthProvider>
  );
}
