import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  createUserWithEmailAndPassword,
  fetchSignInMethodsForEmail,
  signInWithPopup,
} from "firebase/auth";
import { auth, googleProvider } from "../../lib/firebase";
import { createUserProfile, ensureUserProfile } from "../../lib/users";
import { isStaffEmail } from "../../lib/staffEmails";
import { checkName, checkEmail, checkPhone, checkPassword } from "../../lib/validators";
import { useAuth } from "../../context/AuthContext";
import Navbar from "../../components/Navbar";
import Footer from "../../components/Footer";
import PasswordInput from "../../components/PasswordInput";

// New accounts created here are always role: "customer" (see
// createUserProfile/ensureUserProfile in lib/users.js) — manager accounts
// are never self-registered. OTP is a manager-only control (see Login.jsx),
// so a freshly registered account must be marked otpVerified immediately.
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

    const cleanEmail = email.trim().toLowerCase();
    const problem =
      checkName(fullName, "full name") ||
      checkEmail(cleanEmail) ||
      checkPhone(phone) ||
      checkPassword(password);
    if (problem) {
      setError(problem);
      return;
    }
    setBusy(true);
    try {
      // Staff / owner addresses are never allowed to become customer accounts.
      if (await isStaffEmail(cleanEmail)) {
        setError("That email address can't be used to create a customer account. Please use a different email.");
        return;
      }
      // If this address already has any account (for example a Google or admin
      // account), stop here instead of creating a second, separate one.
      const methods = await fetchSignInMethodsForEmail(auth, cleanEmail).catch(() => []);
      if (methods.length > 0) {
        setError("That email is already registered. Try signing in instead.");
        return;
      }

      const cred = await createUserWithEmailAndPassword(auth, cleanEmail, password);
      await createUserProfile(cred.user.uid, { fullName: fullName.trim(), email: cleanEmail, phone: phone.trim() });
      markOtpVerified(cred.user.uid);
      navigate("/");
    } catch (err) {
      if (err.code === "auth/email-already-in-use") {
        setError("That email is already registered. Try signing in instead.");
      } else if (err.code === "auth/weak-password") {
        setError("Password is too weak. Use at least 8 characters with a letter and a number.");
      } else if (err.code === "auth/invalid-email") {
        setError("Enter a valid email address, like name@example.com.");
      } else if (err.code === "auth/network-request-failed") {
        setError("Can't reach the server. Check your internet connection and try again.");
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
      const silentCodes = ["auth/popup-closed-by-user", "auth/cancelled-popup-request"];
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
        <form onSubmit={handleSubmit} noValidate>
          <label>
            Full Name
            <input value={fullName} onChange={(e) => setFullName(e.target.value)} required />
          </label>
          <label>
            Email
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
          </label>
          <label>
            Mobile number
            <input
              type="tel"
              inputMode="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="0917 123 4567"
              required
            />
          </label>
          <label>
            Password
            <PasswordInput value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="new-password" />
          </label>
          <p className="legal-note">At least 8 characters, with a letter and a number.</p>
          <p className="legal-note">
            By creating an account you agree to our{" "}
            <Link to="/privacy" target="_blank" rel="noopener noreferrer">
              Privacy Policy
            </Link>
            .
          </p>
          {error && <p className="form-error" role="alert">{error}</p>}
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