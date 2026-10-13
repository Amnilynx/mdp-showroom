import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  signInWithEmailAndPassword,
  signInWithPopup,
} from "firebase/auth";
import { auth, googleProvider } from "../../lib/firebase";
import { ensureUserProfile, getUserProfile } from "../../lib/users";
import {
  checkLoginLockout,
  recordFailedLogin,
  clearLoginAttempts,
} from "../../lib/authSecurity";
import { useAuth } from "../../context/AuthContext";
import Navbar from "../../components/Navbar";
import Footer from "../../components/Footer";

export default function Login() {
  const navigate = useNavigate();
  const { markOtpVerified } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [googleBusy, setGoogleBusy] = useState(false);
  const [lockedSeconds, setLockedSeconds] = useState(0);

  // OTP is a manager-only control — it exists to put a second factor in
  // front of the admin console, not to add friction to every customer
  // browsing/ordering session. A customer (any sign-in method) is marked
  // verified immediately and goes straight in; only a manager account gets
  // routed through VerifyOtp.jsx. Role isn't known until AFTER Firebase
  // Auth succeeds (it lives in the users/{uid} Firestore doc), so this has
  // to branch post-auth rather than before.
  async function routeAfterSignIn(uid) {
    const profile = await getUserProfile(uid);
    if (profile?.role === "manager") {
      sessionStorage.removeItem("otpVerified");
      sessionStorage.removeItem("otpVerifiedUid");
      navigate("/verify-otp");
    } else {
      markOtpVerified(uid);
      navigate("/");
    }
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");

    const trimmedEmail = email.trim();

    const lockStatus = await checkLoginLockout(trimmedEmail).catch(() => null);
    if (lockStatus?.locked) {
      setLockedSeconds(lockStatus.remainingSeconds);
      setError(
        `Too many failed attempts. Please try again in ${formatLockout(
          lockStatus.remainingSeconds
        )}.`
      );
      return;
    }

    setBusy(true);
    try {
      const cred = await signInWithEmailAndPassword(auth, trimmedEmail, password);
      await clearLoginAttempts(trimmedEmail);
      await routeAfterSignIn(cred.user.uid);
    } catch (err) {
      const result = await recordFailedLogin(trimmedEmail).catch(() => null);
      if (result?.locked) {
        setLockedSeconds(result.remainingSeconds);
        setError(
          `Too many failed attempts. Your account is temporarily locked — try again in ${formatLockout(
            result.remainingSeconds
          )}.`
        );
      } else if (result && result.attemptsLeft <= 2) {
        setError(
          `Incorrect email or password. ${result.attemptsLeft} attempt${
            result.attemptsLeft === 1 ? "" : "s"
          } left before a temporary lockout.`
        );
      } else {
        setError("Incorrect email or password.");
      }
    } finally {
      setBusy(false);
    }
  }

  async function handleGoogleSignIn() {
    if (googleBusy) return;
    setError("");
    setGoogleBusy(true);

    // Safety-net: some browsers (Cross-Origin-Opener-Policy restrictions,
    // certain Brave/Safari/extension setups) never fire Firebase's own
    // "popup was closed" rejection if the user closes the Google tab/window
    // manually. Without this, googleBusy would stay true forever and the
    // button would look permanently stuck. If nothing has resolved this
    // within 15s, we forcibly reset the UI so the person can try again.
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
      await routeAfterSignIn(cred.user.uid);
    } catch (err) {
      clearTimeout(safetyTimer);
      // Expected, user-initiated cases — not real errors, just close quietly.
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
        <h1>Welcome back</h1>
        <form onSubmit={handleSubmit}>
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
            Password
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </label>
          {error && <p className="form-error">{error}</p>}
          <p className="auth-forgot-link">
            <Link to="/forgot-password">Forgot password?</Link>
          </p>
          <button type="submit" disabled={busy || googleBusy || lockedSeconds > 0}>
            {busy ? "Signing in…" : "Sign In"}
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
          Don't have an account? <Link to="/register">Create one</Link>
        </p>
      </div>
      <Footer />
    </div>
  );
}

function formatLockout(totalSeconds) {
  const minutes = Math.ceil(totalSeconds / 60);
  return `${minutes} minute${minutes === 1 ? "" : "s"}`;
}