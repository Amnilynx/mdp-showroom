import { useState } from "react";
import { Link } from "react-router-dom";
import { sendPasswordResetEmail } from "firebase/auth";
import { auth } from "../../lib/firebase";
import Navbar from "../../components/Navbar";
import Footer from "../../components/Footer";

export default function ForgotPassword() {
  const [email, setEmail] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");
    setBusy(true);
    try {
      await sendPasswordResetEmail(auth, email.trim());
      // Always show the same success state whether or not the email is
      // registered. Telling the visitor "no account with that email" (or
      // letting Firebase's auth/user-not-found bubble up) would let anyone
      // enumerate which addresses have accounts on the site — so every
      // outcome except a genuinely malformed address or rate-limit looks
      // identical from here.
      setSent(true);
    } catch (err) {
      if (err.code === "auth/too-many-requests") {
        setError("Too many attempts. Please wait a bit and try again.");
      } else if (err.code === "auth/invalid-email") {
        setError("Please enter a valid email address.");
      } else {
        // user-not-found and anything else — same as success, on purpose.
        setSent(true);
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="showroom-page">
      <Navbar />
      <div className="showroom-inner auth-page">
        {sent ? (
          <>
            <h1>Check your email</h1>
            <p className="auth-helper-text">
              If an account exists for <strong>{email.trim()}</strong>,
              we've sent a link to reset your password. It may take a few
              minutes to arrive — don't forget to check spam.
            </p>
            <p>
              <Link to="/login">← Back to Sign In</Link>
            </p>
          </>
        ) : (
          <>
            <h1>Forgot password</h1>
            <p className="auth-helper-text">
              Enter the email you signed up with and we'll send you a link
              to reset your password.
            </p>
            <form onSubmit={handleSubmit}>
              <label>
                Email
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  autoFocus
                />
              </label>
              {error && <p className="form-error">{error}</p>}
              <button type="submit" disabled={busy || !email.trim()}>
                {busy ? "Sending…" : "Send Reset Link"}
              </button>
            </form>
            <p>
              <Link to="/login">← Back to Sign In</Link>
            </p>
          </>
        )}
      </div>
      <Footer />
    </div>
  );
}