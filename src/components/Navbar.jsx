import { Link, useNavigate } from "react-router-dom";
import { signOut } from "firebase/auth";
import { auth } from "../lib/firebase";
import { useAuth } from "../context/AuthContext";

export default function Navbar() {
  const { user, profile, loading } = useAuth();
  const navigate = useNavigate();

  async function handleSignOut() {
    await signOut(auth);
    navigate("/");
  }

  return (
    <header className="navbar">
      <Link to="/" className="navbar-brand">
        <span className="navbar-logo">MDP</span>
        <span className="navbar-brand-text">
          MDP MODULAR
          <br />
          <span className="navbar-brand-accent">SYSTEMS</span>
        </span>
      </Link>

      <nav className="navbar-links">
        <Link to="/">Home</Link>
        <Link to="/showroom">Showroom</Link>
        <Link to="/portfolio">Our Work</Link>
        <Link to="/orders">Order Status</Link>
      </nav>

      <div className="navbar-actions">
        {loading ? null : user ? (
          <div className="navbar-user">
            <span className="navbar-avatar">
              {(profile?.fullName || user.email || "?").charAt(0).toUpperCase()}
            </span>
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