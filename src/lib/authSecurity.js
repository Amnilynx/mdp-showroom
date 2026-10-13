// ---------- Login security helpers ----------
//
// Two independent concerns live here:
//
// 1. Failed-login lockout — tracked PRE-AUTH, keyed by the email address
//    being attempted (not uid, since there's no session yet). Firestore
//    rules for `loginAttempts/{emailKey}` must allow an unauthenticated
//    client to read/write its own attempt counter — see firestore.rules.
//    This is a client-side speed bump, not a hard security boundary (a
//    determined attacker can reset it by clearing the browser's view of
//    Firestore isn't possible, but they could hit Firestore directly with
//    a fresh "attempt count" write since rules can't verify who's asking
//    before auth exists). It's enough to stop casual brute-forcing and to
//    demonstrate the control for testing purposes.
//
// 2. Manager second factor — a 6-digit OTP code, generated and stored
//    POST-PASSWORD-CHECK (i.e. after Firebase Auth has already signed the
//    manager in), so `otpCodes/{uid}` can be locked to that uid via normal
//    isOwner() rules. The code is emailed via EmailJS (client-side email
//    sending, independent of Firebase's own auth-email quota — Firebase
//    Auth's built-in mailer, used for password resets and email-link
//    sign-in, has a low daily cap on its free plan that EmailJS doesn't
//    share) and checked against the stored value before the app treats the
//    manager as "fully" signed in. If the OTP step is abandoned, the
//    Firebase Auth session already exists — AuthContext/ProtectedRoute
//    re-check sessionStorage's otpVerified flag so an unverified session
//    can't wander into protected pages (see AuthContext.jsx).

import { db } from "./firebase";
import {
  doc,
  getDoc,
  setDoc,
  deleteDoc,
  serverTimestamp,
  Timestamp,
} from "firebase/firestore";

const ATTEMPTS_COLLECTION = "loginAttempts";
const OTP_COLLECTION = "otpCodes";

const MAX_ATTEMPTS = 5;
const LOCKOUT_MINUTES = 5;
const OTP_TTL_MINUTES = 10;
const OTP_MAX_CHECKS = 5; // guards against guessing the 6-digit code itself

function emailKey(email) {
  // Firestore doc IDs can't contain "/", and we lowercase so
  // Foo@Bar.com and foo@bar.com share one counter.
  return encodeURIComponent(email.trim().toLowerCase());
}

// ---------- Lockout ----------

// Call BEFORE attempting signInWithEmailAndPassword. Returns
// { locked: boolean, remainingSeconds, attemptsLeft }.
export async function checkLoginLockout(email) {
  const ref = doc(db, ATTEMPTS_COLLECTION, emailKey(email));
  const snap = await getDoc(ref);
  if (!snap.exists()) {
    return { locked: false, remainingSeconds: 0, attemptsLeft: MAX_ATTEMPTS };
  }
  const data = snap.data();
  const lockedUntil = data.lockedUntil?.toMillis?.() ?? 0;
  const now = Date.now();
  if (lockedUntil > now) {
    return {
      locked: true,
      remainingSeconds: Math.ceil((lockedUntil - now) / 1000),
      attemptsLeft: 0,
    };
  }
  // Lockout window passed — treat as reset.
  const count = lockedUntil ? 0 : data.count || 0;
  return { locked: false, remainingSeconds: 0, attemptsLeft: Math.max(0, MAX_ATTEMPTS - count) };
}

// Call after a FAILED password attempt. Increments the counter and, once
// MAX_ATTEMPTS is hit, sets a lockedUntil timestamp LOCKOUT_MINUTES out.
export async function recordFailedLogin(email) {
  const ref = doc(db, ATTEMPTS_COLLECTION, emailKey(email));
  const snap = await getDoc(ref);
  const prevCount = snap.exists() && !isExpiredLock(snap.data()) ? snap.data().count || 0 : 0;
  const count = prevCount + 1;

  const payload = {
    count,
    lastAttemptAt: serverTimestamp(),
  };
  if (count >= MAX_ATTEMPTS) {
    payload.lockedUntil = Timestamp.fromMillis(Date.now() + LOCKOUT_MINUTES * 60 * 1000);
  }
  await setDoc(ref, payload, { merge: true });

  return {
    attemptsLeft: Math.max(0, MAX_ATTEMPTS - count),
    locked: count >= MAX_ATTEMPTS,
    remainingSeconds: count >= MAX_ATTEMPTS ? LOCKOUT_MINUTES * 60 : 0,
  };
}

function isExpiredLock(data) {
  const lockedUntil = data.lockedUntil?.toMillis?.() ?? 0;
  return lockedUntil > 0 && lockedUntil <= Date.now();
}

// Call after a SUCCESSFUL login — clears the counter so the next bad
// streak starts fresh.
export async function clearLoginAttempts(email) {
  const ref = doc(db, ATTEMPTS_COLLECTION, emailKey(email));
  try {
    await deleteDoc(ref);
  } catch {
    // Non-fatal — a leftover counter just means a slightly stricter
    // threshold next time, never a blocked login once below MAX_ATTEMPTS.
  }
}

// ---------- OTP ----------

function generateCode() {
  return String(Math.floor(100000 + Math.random() * 900000)); // 100000–999999
}

// Call right after a successful signInWithEmailAndPassword / Google
// sign-in, while the Firebase Auth session already exists. Generates and
// stores a fresh code for this uid, returns the raw code so the caller can
// hand it to EmailJS (sending happens in the component, which already has
// the EmailJS SDK loaded).
export async function issueOtpCode(uid) {
  const code = generateCode();
  const ref = doc(db, OTP_COLLECTION, uid);
  await setDoc(ref, {
    code,
    checksUsed: 0,
    createdAt: serverTimestamp(),
    expiresAt: Timestamp.fromMillis(Date.now() + OTP_TTL_MINUTES * 60 * 1000),
  });
  return code;
}

// Returns { ok: boolean, reason?: "expired" | "wrong" | "too_many" | "none" }
export async function verifyOtpCode(uid, enteredCode) {
  const ref = doc(db, OTP_COLLECTION, uid);
  const snap = await getDoc(ref);
  if (!snap.exists()) return { ok: false, reason: "none" };

  const data = snap.data();
  const expiresAt = data.expiresAt?.toMillis?.() ?? 0;
  if (expiresAt <= Date.now()) return { ok: false, reason: "expired" };
  if ((data.checksUsed || 0) >= OTP_MAX_CHECKS) return { ok: false, reason: "too_many" };

  if (data.code !== enteredCode.trim()) {
    await setDoc(ref, { checksUsed: (data.checksUsed || 0) + 1 }, { merge: true });
    return { ok: false, reason: "wrong" };
  }

  await deleteDoc(ref); // one-time use
  return { ok: true };
}

export async function invalidateOtpCode(uid) {
  try {
    await deleteDoc(doc(db, OTP_COLLECTION, uid));
  } catch {
    // Non-fatal.
  }
}

export const OTP_TTL_SECONDS = OTP_TTL_MINUTES * 60;