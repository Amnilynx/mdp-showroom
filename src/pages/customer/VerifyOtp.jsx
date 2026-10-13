import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import emailjs from "@emailjs/browser";
import { auth } from "../../lib/firebase";
import { signOut } from "firebase/auth";
import { getUserProfile } from "../../lib/users";
import { useAuth } from "../../context/AuthContext";
import {
  issueOtpCode,
  verifyOtpCode,
  invalidateOtpCode,
  OTP_TTL_SECONDS,
} from "../../lib/authSecurity";
import {
  EMAILJS_SERVICE_ID,
  EMAILJS_OTP_TEMPLATE_ID,
  EMAILJS_PUBLIC_KEY,
} from "../../lib/emailConfig";
import Navbar from "../../components/Navbar";
import Footer from "../../components/Footer";

// Manager-only second factor, shown right after a successful Firebase
// Auth sign-in (password or Google) IF AND ONLY IF the signed-in account
// is a manager — see Login.jsx's routeAfterSignIn, which is the only
// normal way to land here. Customers are marked otpVerified immediately
// at sign-in and never see this page.
//
// This page re-checks the role itself (rather than trusting that only
// Login.jsx ever navigates here) so that someone typing /verify-otp
// directly into the URL bar can't force a customer account through an
// unnecessary OTP screen, and so a customer session is never left
// half-verified by a direct visit here.
//
// Why EmailJS and not Firebase's own email sending: Firebase Auth's
// built-in mailer (used by sendPasswordResetEmail) has a low daily quota
// on the free "Spark" plan, shared across ALL auth emails for the whole
// project. EmailJS is a separate service with its own free quota, so the
// OTP step here doesn't compete with — or get blocked by — that limit.
//
// Why sessionStorage and not a Firestore field for the verified flag:
// it's inherently per-tab and clears when the browser closes, which is
// exactly the lifetime an OTP challenge should have — a verified tab
// shouldn't silently carry over into a new session days later just
// because Firebase Auth's own token is still valid.
export default function VerifyOtp() {
  const navigate = useNavigate();
  const { markOtpVerified } = useAuth();
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [resending, setResending] = useState(false);
  const [sentOnce, setSentOnce] = useState(false);
  const [checkingRole, setCheckingRole] = useState(true);
  const [secondsLeft, setSecondsLeft] = useState(OTP_TTL_SECONDS);
  const sendGuard = useRef(false); // StrictMode/dev double-invoke guard

  const user = auth.currentUser;

  async function sendCode() {
    if (!user) return;
    setError("");
    try {
      const freshCode = await issueOtpCode(user.uid);
      await emailjs.send(
        EMAILJS_SERVICE_ID,
        EMAILJS_OTP_TEMPLATE_ID,
        {
          to_email: user.email,
          otp_code: freshCode,
          minutes: Math.round(OTP_TTL_SECONDS / 60),
        },
        { publicKey: EMAILJS_PUBLIC_KEY }
      );
      setSecondsLeft(OTP_TTL_SECONDS);
      setSentOnce(true);
    } catch (err) {
      // Surface EmailJS's actual rejection (e.g. "The user ID is required",
      // "Invalid template ID", "Gmail_API: Request had insufficient
      // authentication scopes") instead of swallowing it — a generic
      // message here makes misconfiguration (wrong keys, template field
      // mismatch, Gmail service not re-authorized) impossible to diagnose
      // from the UI alone. Logged to console for anyone debugging, and
      // the specific text shown on-screen when EmailJS provides one.
      console.error("EmailJS send failed:", err);
      const detail =
        typeof err?.text === "string"
          ? err.text
          : typeof err?.message === "string"
          ? err.message
          : null;
      setError(
        detail
          ? `Couldn't send the verification code: ${detail}`
          : "Couldn't send the verification code. Check your connection and try again."
      );
    }
  }

  useEffect(() => {
    if (!user) {
      navigate("/login", { replace: true });
      return;
    }

    let cancelled = false;
    async function checkRoleThenSend() {
      const profile = await getUserProfile(user.uid);
      if (cancelled) return;
      if (profile?.role !== "manager") {
        // Not a manager — this account never needed OTP. Mark verified
        // and send them straight in rather than showing a pointless
        // "verify it's you" screen for a customer who reached this URL
        // directly.
        markOtpVerified(user.uid);
        navigate("/", { replace: true });
        return;
      }
      setCheckingRole(false);
      if (sendGuard.current) return;
      sendGuard.current = true;
      sendCode();
    }
    checkRoleThenSend();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  useEffect(() => {
    if (secondsLeft <= 0) return;
    const t = setInterval(() => setSecondsLeft((s) => Math.max(0, s - 1)), 1000);
    return () => clearInterval(t);
  }, [secondsLeft]);

  async function handleVerify(e) {
    e.preventDefault();
    if (!user || !code.trim()) return;
    setBusy(true);
    setError("");
    try {
      const result = await verifyOtpCode(user.uid, code.trim());
      if (!result.ok) {
        if (result.reason === "expired") {
          setError("That code expired. Send a new one below.");
        } else if (result.reason === "too_many") {
          setError("Too many incorrect attempts. Send a new code below.");
        } else if (result.reason === "none") {
          setError("No active code found. Send a new one below.");
        } else {
          setError("Incorrect code. Please try again.");
        }
        return;
      }
      markOtpVerified(user.uid);
      navigate("/admin", { replace: true });
    } catch (err) {
      setError("Something went wrong verifying that code. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  async function handleResend() {
    setResending(true);
    setCode("");
    await sendCode();
    setResending(false);
  }

  async function handleCancel() {
    if (user) await invalidateOtpCode(user.uid).catch(() => {});
    sessionStorage.removeItem("otpVerified");
    sessionStorage.removeItem("otpVerifiedUid");
    await signOut(auth);
    navigate("/login", { replace: true });
  }

  const minutes = String(Math.floor(secondsLeft / 60)).padStart(2, "0");
  const seconds = String(secondsLeft % 60).padStart(2, "0");

  if (checkingRole) {
    return (
      <div className="showroom-page">
        <Navbar />
        <div className="showroom-inner auth-page">
          <p>Loading…</p>
        </div>
        <Footer />
      </div>
    );
  }

  return (
    <div className="showroom-page">
      <Navbar />
      <div className="showroom-inner auth-page">
        <h1>Verify it's you</h1>
        <p className="auth-helper-text">
          {sentOnce
            ? <>We sent a 6-digit code to <strong>{user?.email}</strong>.</>
            : "Sending your verification code…"}
        </p>

        <form onSubmit={handleVerify}>
          <label>
            Verification code
            <input
              type="text"
              inputMode="numeric"
              pattern="[0-9]*"
              maxLength={6}
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
              autoFocus
              required
            />
          </label>
          {error && <p className="form-error">{error}</p>}
          {secondsLeft > 0 ? (
            <p className="auth-helper-text">
              Code expires in {minutes}:{seconds}
            </p>
          ) : (
            <p className="form-error">This code has expired.</p>
          )}
          <button type="submit" disabled={busy || code.trim().length !== 6}>
            {busy ? "Verifying…" : "Verify"}
          </button>
        </form>

        <button
          type="button"
          className="btn-link"
          onClick={handleResend}
          disabled={resending}
          style={{ marginTop: 12 }}
        >
          {resending ? "Sending…" : "Resend code"}
        </button>

        <p>
          <button type="button" className="btn-link" onClick={handleCancel}>
            Cancel and sign out
          </button>
        </p>
      </div>
      <Footer />
    </div>
  );
}