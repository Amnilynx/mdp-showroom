import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  createUserWithEmailAndPassword,
  signInWithPopup,
} from "firebase/auth";
import { auth, googleProvider } from "../../lib/firebase";
import { createUserProfile, ensureUserProfile } from "../../lib/users";
import { useAuth } from "../../context/AuthContext";
import Navbar from "../../components/Navbar";
import Footer from "../../components/Footer";

// New accounts created here are always role: "customer" (see
// createUserProfile/ensureUserProfile in lib/users.js) — manager accounts
// are never self-registered. OTP is a manager-only control (see Login.jsx),
// so a freshly registered account must be marked otpVerified immediately,
// just like a customer logging in normally. Without this, the brand-new
// Firebase Auth session would count as "signed in but unverified" and
// ProtectedRoute would bounce the new user to /verify-otp on their very
// first click into a protected page.
export default function Register() {
  const navigate = useNavigate();
  const { markOtpVerified } = useAuth();
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [googleBusy, setGoogleBusy] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");
    setBusy(true);
    try {
      const cred = await createUserWithEmailAndPassword(auth, email, password);
      await createUserProfile(cred.user.uid, { fullName, email, phone });
      markOtpVerified(cred.user.uid);
      navigate("/");
    } catch (err) {
      if (err.code === "auth/email-already-in-use") {
        setError("That email is already registered. Try signing in instead.");
      } else if (err.code === "auth/weak-password") {
        setError("Password should be at least 6 characters.");
      } else {
        setError("Couldn't create your account. Please try again.");
      }
    } finally {
      setBusy(false);
    }
  }

  async function handleGoogleSignIn() {
    if (googleBusy) return;
    setError("");
    setGoogleBusy(true);

    // Same safety-net as Login.jsx: force-reset if Firebase's own
    // popup-closed detection never fires (COOP/browser edge cases).
    const safetyTimer = setTimeout(() => {
      setGoogleBusy(false);
      setError(
        "Google sign-in didn't complete. If a popup appeared and you closed it, please try again."
      );
    }, 15000);

    try {
      const cred = await signInWithPopup(auth, googleProvider);
      clearTimeout(safetyTimer);
      await ensureUserProfile(cred.user.uid, {
        fullName: cred.user.displayName || "",
        email: cred.user.email || "",
      });
      markOtpVerified(cred.user.uid);
      navigate("/");
    } catch (err) {
      clearTimeout(safetyTimer);
      const silentCodes = [
        "auth/popup-closed-by-user",
        "auth/cancelled-popup-request",
      ];
      if (!silentCodes.includes(err.code)) {
        if (err.code === "auth/popup-blocked") {
          setError("Your browser blocked the Google sign-in popup. Please allow popups for this site and try again.");
        } else {
          setError("Google sign-in failed. Please try again.");
        }
      }
    } finally {
      clearTimeout(safetyTimer);
      setGoogleBusy(false);
    }
  }

  return (
    <div className="showroom-page">
      <Navbar />
      <div className="showroom-inner auth-page">
        <h1>Create your account</h1>
        <form onSubmit={handleSubmit}>
          <label>
            Full Name
            <input
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              required
            />
          </label>
          <label>
            Email
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </label>
          <label>
            Phone
            <input
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              required
            />
          </label>
          <label>
            Password
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </label>
          {error && <p className="form-error">{error}</p>}
          <button type="submit" disabled={busy || googleBusy}>
            {busy ? "Creating account…" : "Create Account"}
          </button>
        </form>

        <div className="auth-divider">
          <span>or</span>
        </div>

        <button
          type="button"
          className="google-signin-btn"
          onClick={handleGoogleSignIn}
          disabled={busy || googleBusy}
        >
          {googleBusy ? "Connecting to Google…" : "Continue with Google"}
        </button>

        <p>
          Already have an account? <Link to="/login">Sign in</Link>
        </p>
      </div>
      <Footer />
    </div>
  );
}