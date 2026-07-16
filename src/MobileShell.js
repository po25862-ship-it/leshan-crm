import React from "react";
import { NavLink } from "react-router-dom";
import { LayoutDashboard, KeyRound, Users, Briefcase, MoreHorizontal } from "lucide-react";
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
        <LayoutDashboard size={20} strokeWidth={2.2} />總覽
      </NavLink>
      <NavLink to="/sellers" className={({ isActive }) => (isActive ? "active" : "")}>
        <KeyRound size={20} strokeWidth={2.2} />賣方
      </NavLink>
      <NavLink to="/buyers" className={({ isActive }) => (isActive ? "active" : "")}>
        <Users size={20} strokeWidth={2.2} />買方
      </NavLink>
      <NavLink to="/cases" className={({ isActive }) => (isActive ? "active" : "")}>
        <Briefcase size={20} strokeWidth={2.2} />案件
      </NavLink>
      <NavLink to="/more" className={({ isActive }) => (isActive ? "active" : "")}>
        <MoreHorizontal size={20} strokeWidth={2.2} />更多
      </NavLink>
    </nav>
  );
}
