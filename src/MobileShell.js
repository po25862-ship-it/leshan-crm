import React from "react";
import { useAuth } from "./AuthContext";
import MobileNavigation from "./MobileNavigation";

export function MobileTopBar() {
  const { logout } = useAuth();
  return (
    <div className="m-topbar">
      <h1>案件控台</h1>
      <button className="m-logout" onClick={logout}>
        登出
      </button>
    </div>
  );
}

export function MobileBottomNav() {
  return <MobileNavigation />;
}
