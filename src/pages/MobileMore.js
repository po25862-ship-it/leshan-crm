import React from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../AuthContext";

export default function MobileMore() {
  const { logout } = useAuth();

  return (
    <main>
      <div className="section-title">更多</div>
      <Link to="/cases" className="mobile-more-row">
        成交案件 <span className="arrow">›</span>
      </Link>
      <Link to="/rentals" className="mobile-more-row">
        出租 <span className="arrow">›</span>
      </Link>
      <Link to="/calendar" className="mobile-more-row">
        行事曆 <span className="arrow">›</span>
      </Link>
      <Link to="/needs" className="mobile-more-row">
        客需 <span className="arrow">›</span>
      </Link>
      <Link to="/topics" className="mobile-more-row">
        商談事項 <span className="arrow">›</span>
      </Link>
      <Link to="/settings" className="mobile-more-row">
        設定 <span className="arrow">›</span>
      </Link>
      <div className="mobile-more-row" onClick={logout} style={{ cursor: "pointer", color: "#B34A3C" }}>
        登出 <span className="arrow">›</span>
      </div>
    </main>
  );
}
