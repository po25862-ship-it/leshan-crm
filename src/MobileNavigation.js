import React from "react";
import { NavLink } from "react-router-dom";
import { PanelsTopLeft, ContactRound, HeartHandshake, Home, KeySquare, MoreHorizontal } from "lucide-react";
import "./MobileNavigation.css";

const coreItems = [
  { to: "/", label: "首頁", icon: PanelsTopLeft, end: true },
  { to: "/buyers", label: "買方", icon: ContactRound },
  { to: "/needs", label: "客需", icon: HeartHandshake },
  { to: "/properties", label: "物件", icon: Home },
];

export const RENTAL_MOBILE_NAV_ITEMS = [...coreItems, { to: "/company-rentals", label: "租賃", icon: KeySquare }];
const mainItems = [...coreItems, { to: "/more", label: "更多", icon: MoreHorizontal }];

export default function MobileNavigation({ items = mainItems }) {
  return <nav className="mobile-floating-nav" aria-label="手機主要導覽">
    {items.map(({ to, label, icon: Icon, end }) => <NavLink key={to} to={to} end={end} className={({ isActive }) => `mobile-floating-nav__link${isActive ? " active" : ""}`}>
      <span className="mobile-floating-nav__icon"><Icon size={26} strokeWidth={2.2} aria-hidden="true" focusable="false" /></span>
      <span className="mobile-floating-nav__label">{label}</span>
    </NavLink>)}
  </nav>;
}
