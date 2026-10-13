import { Navigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

// Usage:
//   <ProtectedRoute><CustomerOnlyPage /></ProtectedRoute>              -> any logged-in user
//   <ProtectedRoute role="manager"><AdminPage /></ProtectedRoute>      -> manager only
//
// For a MANAGER account, a Firebase Auth session alone isn't enough — the
// OTP step (VerifyOtp.jsx) must also have been completed THIS session
// (tracked via otpVerified in AuthContext, backed by sessionStorage so it
// doesn't survive a closed browser). A signed-in-but-unverified manager
// gets bounced to /verify-otp instead of the page they asked for.
//
// Customers are marked otpVerified automatically at sign-in (see
// Login.jsx's routeAfterSignIn) — OTP is a manager-only control, not a
// per-customer login requirement — so in practice this check only ever
// blocks a manager session, never a customer one.
export default function ProtectedRoute({ role, children }) {
  const { user, role: userRole, loading, otpVerified } = useAuth();

  if (loading) {
    return <div className="page-loading">Loading...</div>;
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  if (!otpVerified) {
    return <Navigate to="/verify-otp" replace />;
  }

  if (role && userRole !== role) {
    // Logged in, but wrong role (e.g. customer trying to hit /admin)
    return <Navigate to="/" replace />;
  }

  return children;
}