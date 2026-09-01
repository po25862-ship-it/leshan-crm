import React from "react";
import { NavLink } from "react-router-dom";
import { LayoutDashboard, ListTodo, Bot, Building2, MoreHorizontal } from "lucide-react";
import { useAuth } from "./AuthContext";

export function MobileTopBar() {
  const { logout } = useAuth();
  return (
    <div className="m-topbar">
      <h1>Leshan OS</h1>
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
        <LayoutDashboard size={20} strokeWidth={2.2} />首頁
      </NavLink>
      <NavLink to="/tasks" className={({ isActive }) => (isActive ? "active" : "")}>
        <ListTodo size={20} strokeWidth={2.2} />任務
      </NavLink>
      <NavLink to="/properties" className={({ isActive }) => (isActive ? "active" : "")}>
        <Building2 size={20} strokeWidth={2.2} />物件
      </NavLink>
      <NavLink to="/agents" className={({ isActive }) => (isActive ? "active" : "")}>
        <Bot size={20} strokeWidth={2.2} />AI
      </NavLink>
      <NavLink to="/more" className={({ isActive }) => (isActive ? "active" : "")}>
        <MoreHorizontal size={20} strokeWidth={2.2} />更多
      </NavLink>
    </nav>
  );
}
