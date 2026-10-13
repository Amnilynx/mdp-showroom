import { useCallback, useEffect, useRef, useState } from "react";
import { signOut } from "firebase/auth";
import { auth } from "../lib/firebase";
import { useAuth } from "../context/AuthContext";

// Idle session timeout: after IDLE_MINUTES of no mouse/keyboard/touch/
// scroll activity, show a warning with a countdown; if nothing happens
// before it reaches zero, sign the user out automatically. Any activity
// while the warning is showing dismisses it and resets the idle clock.
//
// Mounted once in App.jsx, inside AuthProvider but outside the route
// tree, so it's always present on every page (not just protected ones —
// a logged-in admin idling on the public homepage should still time out).
// Renders nothing when logged out.
const IDLE_MINUTES = 15;
const WARNING_SECONDS = 60; // shown before auto-logout, counted DOWN from IDLE_MINUTES mark

const ACTIVITY_EVENTS = ["mousemove", "mousedown", "keydown", "touchstart", "scroll"];

export default function SessionTimeout() {
  const { user } = useAuth();
  const [showWarning, setShowWarning] = useState(false);
  const [secondsLeft, setSecondsLeft] = useState(WARNING_SECONDS);

  const idleTimerRef = useRef(null);
  const countdownRef = useRef(null);

  const handleLogout = useCallback(async (reason) => {
    clearTimeout(idleTimerRef.current);
    clearInterval(countdownRef.current);
    setShowWarning(false);
    sessionStorage.removeItem("otpVerified");
    sessionStorage.removeItem("otpVerifiedUid");
    try {
      await signOut(auth);
    } catch {
      // Sign-out failing shouldn't leave the warning stuck on screen.
    }
  }, []);

  const startWarning = useCallback(() => {
    setShowWarning(true);
    setSecondsLeft(WARNING_SECONDS);
    countdownRef.current = setInterval(() => {
      setSecondsLeft((s) => {
        if (s <= 1) {
          clearInterval(countdownRef.current);
          handleLogout("timeout");
          return 0;
        }
        return s - 1;
      });
    }, 1000);
  }, [handleLogout]);

  const resetIdleTimer = useCallback(() => {
    clearTimeout(idleTimerRef.current);
    idleTimerRef.current = setTimeout(
      startWarning,
      IDLE_MINUTES * 60 * 1000 - WARNING_SECONDS * 1000
    );
  }, [startWarning]);

  function handleStayLoggedIn() {
    clearInterval(countdownRef.current);
    setShowWarning(false);
    resetIdleTimer();
  }

  useEffect(() => {
    if (!user) {
      clearTimeout(idleTimerRef.current);
      clearInterval(countdownRef.current);
      setShowWarning(false);
      return;
    }

    function onActivity() {
      // While the warning is up, activity should NOT silently reset the
      // timer behind it — the person has to actively click "Stay signed
      // in" so a stray mouse-jiggle doesn't bypass the check entirely.
      if (showWarning) return;
      resetIdleTimer();
    }

    ACTIVITY_EVENTS.forEach((evt) => window.addEventListener(evt, onActivity));
    resetIdleTimer();

    return () => {
      ACTIVITY_EVENTS.forEach((evt) => window.removeEventListener(evt, onActivity));
      clearTimeout(idleTimerRef.current);
      clearInterval(countdownRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, showWarning]);

  if (!user || !showWarning) return null;

  return (
    <div className="modal-overlay">
      <div className="modal-card session-timeout-modal">
        <h3>Still there?</h3>
        <p>
          You've been inactive for a while. For your security, you'll be
          signed out in <strong>{secondsLeft}s</strong>.
        </p>
        <div className="admin-form-actions">
          <button className="btn btn-primary" onClick={handleStayLoggedIn}>
            Stay signed in
          </button>
          <button className="btn btn-secondary" onClick={() => handleLogout("manual")}>
            Sign out now
          </button>
        </div>
      </div>
    </div>
  );
}