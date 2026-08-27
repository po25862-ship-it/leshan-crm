import React, { useState, useEffect } from "react";
import { HashRouter, Routes, Route, NavLink, useLocation } from "react-router-dom";
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
import SmartTools from "./pages/SmartTools";
import MatchingRecommendations from "./pages/MatchingRecommendations";
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
  WandSparkles,
  Settings as SettingsIcon,
  LogOut,
  Search,
  Bell,
  ShieldCheck,
} from "lucide-react";
import "./mobile.css";

const desktopNavItems = [
  { to: "/", label: "首頁", icon: LayoutDashboard, end: true },
  { to: "/buyers", label: "買方管理", icon: Users },
  { to: "/needs", label: "客需管理", icon: SearchCheck },
  { to: "/properties", label: "物件管理", icon: Building2 },
  { to: "/matching", label: "推薦配對", icon: WandSparkles },
];

const desktopSecondaryNavItems = [
  { to: "/activity", label: "互動紀錄", icon: MessageCircle },
  { to: "/calendar", label: "行事曆", icon: CalendarDays },
  { to: "/topics", label: "商談管理", icon: MessagesSquare },
  { to: "/rentals", label: "出租管理", icon: Home },
  { to: "/cases", label: "成交管理", icon: BadgeCheck },
  { to: "/sellers", label: "賣方管理", icon: KeyRound },
  { to: "/quicknotes", label: "待辦事項", icon: ListTodo },
  { to: "/settings", label: "權限設定", icon: ShieldCheck },
  { to: "/tools", label: "系統設定", icon: SettingsIcon },
];

function DesktopSidebar() {
  const { user, logout } = useAuth();
  const { data: profile } = useDoc(`colleagues/${user.uid}`, { name: "" });
  return (
    <aside className="desktop-sidebar">
      <div className="brand">
        <div className="brand-mark" aria-hidden="true">⌂</div>
        <div className="brand-copy">
          <h1>樂善房仲 CRM</h1>
          <span>成交導向・智慧配對</span>
        </div>
      </div>
      <nav className="sidebar-nav" aria-label="主要導覽">
        {desktopNavItems.map(({ to, label, icon: Icon, end }) => (
          <NavLink key={to} to={to} end={end} className={({ isActive }) => (isActive ? "active" : "")}>
            <Icon size={16} strokeWidth={2.1} aria-hidden="true" />
            <span>{label}</span>
          </NavLink>
        ))}
        <div className="sidebar-divider" />
        {desktopSecondaryNavItems.map(({ to, label, icon: Icon }) => (
          <NavLink key={`${to}-${label}`} to={to}><Icon size={16} /><span>{label}</span></NavLink>
        ))}
      </nav>
      <div className="sidebar-profile">
        <span className="sidebar-avatar">{(profile.name || user.email || "樂").slice(0, 1)}</span>
        <div><strong>{profile.name || user.email}</strong><small>主要負責人</small></div>
        <button onClick={logout} aria-label="登出"><LogOut size={15} /></button>
      </div>
    </aside>
  );
}

function DesktopTopBar() {
  const { user } = useAuth();
  const { data: profile } = useDoc(`colleagues/${user.uid}`, { name: "" });
  return <header className="desktop-topbar">
    <label><Search size={15} /><input placeholder="搜尋工作台" /></label>
    <div className="desktop-topbar-actions"><button aria-label="通知"><Bell size={16} /></button><span className="topbar-avatar">{(profile.name || user.email || "樂").slice(0, 1)}</span><strong>{profile.name || "樂善房仲"}</strong></div>
  </header>;
}

function AppRoutes() {
  return (
    <Routes>
      <Route path="/" element={<Dashboard />} />
      <Route path="/sellers" element={<Sellers />} />
      <Route path="/sellers/:contactId/:listingId" element={<SellerDetail />} />
      <Route path="/buyers" element={<Buyers />} />
      <Route path="/activity" element={<Buyers />} />
      <Route path="/rentals" element={<Rentals />} />
      <Route path="/rentals/:rentalId" element={<RentalDetail />} />
      <Route path="/quicknotes" element={<QuickNotes />} />
      <Route path="/cases" element={<Cases />} />
      <Route path="/properties" element={<Properties />} />
      <Route path="/needs" element={<Needs />} />
      <Route path="/matching" element={<MatchingRecommendations />} />
      <Route path="/topics" element={<Topics />} />
      <Route path="/settings" element={<Settings />} />
      <Route path="/calendar" element={<CalendarPage />} />
      <Route path="/line" element={<LineBroadcast />} />
      <Route path="/tools" element={<SmartTools />} />
      <Route path="/more" element={<MobileMore />} />
    </Routes>
  );
}

function ScrollToTop() {
  const { pathname } = useLocation();
  useEffect(() => {
    window.scrollTo({ top: 0, left: 0 });
  }, [pathname]);
  return null;
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
      <ScrollToTop />
      {isMobile ? (
        <div className="mobile-shell">
          <MobileTopBar />
          <AppRoutes />
          <MobileBottomNav />
        </div>
      ) : (
        <div className="desktop-shell">
          <DesktopSidebar />
          <div className="desktop-content">
            <DesktopTopBar />
            <AppRoutes />
          </div>
        </div>
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
