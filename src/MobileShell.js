import React from "react";
import { NavLink } from "react-router-dom";
import { useAuth } from "./AuthContext";

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
  return (
    <nav className="mobile-bottom-nav">
      <NavLink to="/" end className={({ isActive }) => (isActive ? "active" : "")}>
        <div className="dot"></div>總覽
      </NavLink>
      <NavLink to="/contacts" className={({ isActive }) => (isActive ? "active" : "")}>
        <div className="dot"></div>客戶
      </NavLink>
      <NavLink to="/cases" className={({ isActive }) => (isActive ? "active" : "")}>
        <div className="dot"></div>案件
      </NavLink>
      <NavLink to="/properties" className={({ isActive }) => (isActive ? "active" : "")}>
        <div className="dot"></div>物件
      </NavLink>
      <NavLink to="/more" className={({ isActive }) => (isActive ? "active" : "")}>
        <div className="dot"></div>更多
      </NavLink>
    </nav>
  );
}
