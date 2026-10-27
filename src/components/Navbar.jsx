import { Link, useNavigate } from "react-router-dom";
import { signOut } from "firebase/auth";
import { auth } from "../lib/firebase";
import { useAuth } from "../context/AuthContext";
import { useCart } from "../context/CartContext";

const LOGO_URL = "https://raw.githubusercontent.com/Amnilynx/mdp-showroom-media/main/branding/mdp-logo.png";

export default function Navbar() {
  const { user, profile, loading } = useAuth();
  const navigate = useNavigate();
  const { items } = useCart();
  const count = items.length;
  const isManager = profile?.role === "manager";

  async function handleSignOut() {
    await signOut(auth);
    navigate("/");
  }

  // Customers go to their profile page; admins go to the admin area.
  const avatarTarget = profile?.role === "manager" ? "/admin" : "/profile";

  return (
    <header className="navbar">
      <Link to="/" className="navbar-brand">
        <img src={LOGO_URL} alt="MDP Modular Systems" className="navbar-logo-img" />
      </Link>

      <nav className="navbar-links">
        <Link to="/">Home</Link>
        <Link to="/showroom">Showroom</Link>
        <Link to="/portfolio">Our Work</Link>
        <Link to="/orders">Order Status</Link>
      </nav>

      <div className="navbar-actions">
        {!isManager && (
          <Link
            to="/quote-request"
            className="navbar-cart"
            aria-label={`My quote request, ${count} item${count === 1 ? "" : "s"}`}
            title="My quote request"
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
              textDecoration: "none",
              fontWeight: 700,
              fontSize: 14,
              color: "inherit",
              marginRight: 12,
            }}
          >
            <span aria-hidden="true">🛒</span>
            <span>My Quote</span>
            <span
              style={{
                minWidth: 20,
                height: 20,
                padding: "0 6px",
                borderRadius: 10,
                background: count > 0 ? "#c8963e" : "#d9d4c8",
                color: count > 0 ? "#fff" : "#6b6b6b",
                fontSize: 12,
                lineHeight: "20px",
                textAlign: "center",
              }}
            >
              {count}
            </span>
          </Link>
        )}
        {loading ? null : user ? (
          <div className="navbar-user">
            <Link
              to={avatarTarget}
              className="navbar-avatar"
              title={profile?.role === "manager" ? "Admin area" : "My profile"}
              aria-label={profile?.role === "manager" ? "Admin area" : "My profile"}
              style={{ textDecoration: "none" }}
            >
              {(profile?.fullName || user.email || "?").charAt(0).toUpperCase()}
            </Link>
            <button className="navbar-signout" onClick={handleSignOut}>
              Sign Out
            </button>
          </div>
        ) : (
          <Link to="/login" className="navbar-login-btn">
            Log In / Sign Up
          </Link>
        )}
      </div>
    </header>
  );
}