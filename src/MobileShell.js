import React from "react";
import { useAuth } from "./AuthContext";
import TextSizeSettings from "./components/TextSizeSettings";
import MobileNavigation from "./MobileNavigation";

export function MobileTopBar() {
  const { logout } = useAuth();
  return (
    <div className="m-topbar">
      <h1>案件控台</h1>
      <div className="m-topbar-actions"><TextSizeSettings /><button className="m-logout" onClick={logout}>
        登出
      </button></div>
    </div>
  );
}

export function MobileBottomNav() {
  return <MobileNavigation />;
}
