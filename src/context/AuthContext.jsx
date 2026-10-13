import { createContext, useContext, useEffect, useState } from "react";
import { onAuthStateChanged } from "firebase/auth";
import { auth } from "../lib/firebase";
import { getUserProfile } from "../lib/users";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null); // Firebase Auth user object
  const [profile, setProfile] = useState(null); // Firestore users/{uid} doc (has role)
  const [loading, setLoading] = useState(true);
  // Mirrors sessionStorage's "otpVerified" flag into React state so
  // components re-render when VerifyOtp.jsx sets it, instead of only
  // picking it up on the next navigation. Re-read on every auth change
  // since a new sign-in (even for the same uid, e.g. after sign-out and
  // back in) must re-require OTP — sessionStorage from a PREVIOUS session
  // for a different uid is explicitly ignored below.
  const [otpVerified, setOtpVerified] = useState(false);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      setUser(firebaseUser);
      if (firebaseUser) {
        const userProfile = await getUserProfile(firebaseUser.uid);
        setProfile(userProfile);
        const verifiedUid = sessionStorage.getItem("otpVerifiedUid");
        setOtpVerified(
          sessionStorage.getItem("otpVerified") === "1" &&
            verifiedUid === firebaseUser.uid
        );
      } else {
        setProfile(null);
        setOtpVerified(false);
      }
      setLoading(false);
    });
    return unsubscribe;
  }, []);

  // VerifyOtp.jsx (and Login.jsx, for customers who skip the OTP step
  // entirely — see Login.jsx's routeAfterSignIn) calls this after a
  // successful auth instead of writing sessionStorage directly, so React
  // state and storage never drift apart.
  //
  // Takes the uid explicitly rather than reading it off `user` in this
  // closure: right after signInWithEmailAndPassword/signInWithPopup
  // resolves, onAuthStateChanged hasn't necessarily fired yet, so `user`
  // here can still be null/stale for a moment. Passing the uid the caller
  // already has (from the sign-in credential) avoids a race where this
  // would silently no-op and leave the session unverified.
  function markOtpVerified(uid) {
    const targetUid = uid || user?.uid;
    if (!targetUid) return;
    sessionStorage.setItem("otpVerified", "1");
    sessionStorage.setItem("otpVerifiedUid", targetUid);
    setOtpVerified(true);
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
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}