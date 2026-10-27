import { createContext, useContext, useEffect, useState } from "react";
import { onAuthStateChanged, signOut } from "firebase/auth";
import { auth } from "../lib/firebase";
import { getUserProfile } from "../lib/users";
import { registerStaffEmail } from "../lib/staffEmails";

const AuthContext = createContext(null);

// A manager only counts as signed in for the tab where they passed the OTP.
// Login.jsx stamps this key when a sign-in starts, so the short window between
// "password accepted" and "OTP entered" is allowed. Anything else (a new tab,
// or the browser reopened) is a manager session that never went through the
// OTP in this tab, and it is signed out instead of being left half signed in.
const SIGN_IN_KEY = "mdpSignInStartedAt";
const SIGN_IN_WINDOW_MS = 15 * 60 * 1000; // a bit longer than the OTP lifetime

export function markSignInStarted() {
  try {
    sessionStorage.setItem(SIGN_IN_KEY, String(Date.now()));
  } catch {
    /* storage unavailable: the check below then errs on the side of signing out */
  }
}
function signInIsRecent() {
  try {
    const t = Number(sessionStorage.getItem(SIGN_IN_KEY) || 0);
    return t > 0 && Date.now() - t < SIGN_IN_WINDOW_MS;
  } catch {
    return false;
  }
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null); // Firebase Auth user object
  const [profile, setProfile] = useState(null); // Firestore users/{uid} doc (has role)
  const [loading, setLoading] = useState(true);
  // Mirrors sessionStorage's "otpVerified" flag into React state so
  // components re-render when VerifyOtp.jsx sets it. Re-read on every auth
  // change; a flag left by a different uid is ignored.
  const [otpVerified, setOtpVerified] = useState(false);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      if (firebaseUser) {
        const userProfile = await getUserProfile(firebaseUser.uid);
        const verifiedUid = sessionStorage.getItem("otpVerifiedUid");
        const verified =
          sessionStorage.getItem("otpVerified") === "1" && verifiedUid === firebaseUser.uid;

        // Manager session that did not start in this tab and never passed the
        // OTP here (new tab, or browser reopened): end it.
        if (userProfile?.role === "manager" && !verified && !signInIsRecent()) {
          try {
            await signOut(auth);
          } catch {
            /* ignore */
          }
          setUser(null);
          setProfile(null);
          setOtpVerified(false);
          setLoading(false);
          return;
        }

        // Keep the staff-email list in step with real managers (also fills it in for
        // admins created before this list existed). Best effort.
        if (userProfile?.role === "manager" && userProfile.email) {
          registerStaffEmail(userProfile.email, firebaseUser.uid).catch(() => {});
        }

        setUser(firebaseUser);
        setProfile(userProfile);
        setOtpVerified(verified);
      } else {
        setUser(null);
        setProfile(null);
        setOtpVerified(false);
      }
      setLoading(false);
    });
    return unsubscribe;
  }, []);

  // VerifyOtp.jsx (and Login.jsx, for customers who skip the OTP step) calls
  // this after a successful auth instead of writing sessionStorage directly,
  // so React state and storage never drift apart. It takes the uid explicitly
  // because onAuthStateChanged may not have fired yet right after sign-in.
  function markOtpVerified(uid) {
    const targetUid = uid || user?.uid;
    if (!targetUid) return;
    sessionStorage.setItem("otpVerified", "1");
    sessionStorage.setItem("otpVerifiedUid", targetUid);
    setOtpVerified(true);
  }

  // Re-reads the signed-in person's profile (used after they edit it on My Profile).
  async function refreshProfile() {
    const uid = auth.currentUser?.uid;
    if (!uid) return;
    setProfile(await getUserProfile(uid));
  }

  const value = {
    user,
    profile,
    role: profile?.role ?? null,
    isManager: profile?.role === "manager",
    isCustomer: profile?.role === "customer",
    loading,
    otpVerified,
    markOtpVerified,
    refreshProfile,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}