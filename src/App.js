import React, { useState, useEffect } from "react";
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
import LineBroadcast from "./pages/LineBroadcast";
import MobileMore from "./pages/MobileMore";
import Login from "./pages/Login";
import { AuthProvider, useAuth } from "./AuthContext";
import { GoogleAuthProvider } from "./GoogleAuthContext";
import { useIsMobile } from "./hooks/useIsMobile";
import { MobileTopBar, MobileBottomNav } from "./MobileShell";
import {
  LayoutDashboard,
  KeyRound,
  Users,
  Home,
  ListTodo,
  BadgeCheck,
  Building2,
  SearchCheck,
  MessagesSquare,
  CalendarDays,
  MessageCircle,
  Settings as SettingsIcon,
  LogOut,
} from "lucide-react";
import "./mobile.css";

const desktopNavItems = [
  { to: "/", label: "總覽", icon: LayoutDashboard, end: true },
  { to: "/sellers", label: "賣方", icon: KeyRound },
  { to: "/buyers", label: "買方", icon: Users },
  { to: "/rentals", label: "出租", icon: Home },
  { to: "/quicknotes", label: "待辦", icon: ListTodo },
  { to: "/cases", label: "成交", icon: BadgeCheck },
  { to: "/properties", label: "物件", icon: Building2 },
  { to: "/needs", label: "客需", icon: SearchCheck },
  { to: "/topics", label: "商談", icon: MessagesSquare },
  { to: "/calendar", label: "行事曆", icon: CalendarDays },
  { to: "/line", label: "個人LINE", icon: MessageCircle },
  { to: "/settings", label: "設定", icon: SettingsIcon },
];

function DesktopHeader() {
  const { user, logout } = useAuth();
  const { data: profile } = useDoc(`colleagues/${user.uid}`, { name: "" });
  return (
    <header className="app-header">
      <div className="brand">
        <div className="brand-mark" aria-hidden="true">樂</div>
        <div className="brand-copy">
          <h1>案件控台</h1>
          <span>{profile.name || user.email} · 捷運樂善直營店</span>
        </div>
      </div>
      <nav className="app-nav" aria-label="主要導覽">
        {desktopNavItems.map(({ to, label, icon: Icon, end }) => (
          <NavLink key={to} to={to} end={end} className={({ isActive }) => (isActive ? "active" : "")}>
            <Icon size={16} strokeWidth={2.1} aria-hidden="true" />
            <span>{label}</span>
          </NavLink>
        ))}
        <button className="nav-logout" onClick={logout} aria-label="登出">
          <LogOut size={17} strokeWidth={2.1} aria-hidden="true" />
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
      <Route path="/line" element={<LineBroadcast />} />
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

  useEffect(() => {
    document.title = colleagueProfile.name ? `案件控台｜${colleagueProfile.name}` : "案件控台";
  }, [colleagueProfile.name]);

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
