import { Link, useNavigate, useLocation } from "react-router-dom";
import { signOut } from "firebase/auth";
import { auth } from "../lib/firebase";
import { useAuth } from "../context/AuthContext";

const NAV_ITEMS = [
  { label: "Dashboard", to: "/admin", icon: "☰" },
  { label: "Orders", to: "/admin/orders", icon: "📋" },
  { label: "Showroom", to: "/admin/showroom", icon: "🗄" },
  { label: "Categories", to: "/admin/categories", icon: "🏷" },
  { label: "Our Work", to: "/admin/portfolio", icon: "🖼" },
  { label: "Import", to: "/admin/import", icon: "⬆" },
  { label: "Reports", to: "/admin/reports", icon: "📊" },
  { label: "Accounts", to: "/admin/accounts", icon: "👤" },
];

export default function AdminLayout({ title, children }) {
  const { profile } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  async function handleSignOut() {
    await signOut(auth);
    navigate("/");
  }

  return (
    <div className="admin-shell">
      <header className="admin-topbar">
        <div className="admin-topbar-brand">
          <span className="navbar-logo">MDP</span>
          <span className="navbar-brand-text">
            MDP MODULAR
            <br />
            <span className="navbar-brand-accent">SYSTEMS</span>
          </span>
        </div>
        <input className="admin-search" placeholder="Search" />
        <span className="admin-title">ADMIN</span>
        <button className="admin-signout" onClick={handleSignOut}>
          Sign Out
        </button>
      </header>

      <div className="admin-body">
        <aside className="admin-sidebar">
          <div className="admin-avatar-circle">
            {(profile?.fullName || "A").charAt(0).toUpperCase()}
          </div>
          <nav>
            {NAV_ITEMS.map((item) => {
              const active =
                item.to === "/admin"
                  ? location.pathname === "/admin"
                  : location.pathname.startsWith(item.to);
              return (
                <Link
                  key={item.to}
                  to={item.to}
                  className={"admin-nav-item" + (active ? " admin-nav-active" : "")}
                >
                  <span className="admin-nav-icon">{item.icon}</span>
                  <span className="admin-nav-label">{item.label}</span>
                </Link>
              );
            })}
          </nav>
        </aside>

        <main className="admin-main">
          {title && <h1 className="admin-page-title">{title}</h1>}
          {children}
        </main>
      </div>
    </div>
  );
}