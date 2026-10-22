// Firebase initialization — everything else imports auth/db from here.
// Do not call initializeApp() anywhere else in the codebase.

import { initializeApp, getApps, deleteApp } from "firebase/app";
import { getAuth, GoogleAuthProvider } from "firebase/auth";
import { getFirestore } from "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyDmD7pDjz4RH-6GuY5dqehhQboM2qgxN0I",
  authDomain: "mdp-modular-systems.firebaseapp.com",
  projectId: "mdp-modular-systems",
  storageBucket: "mdp-modular-systems.firebasestorage.app",
  messagingSenderId: "374430093601",
  appId: "1:374430093601:web:b65ab1b2862092e348ee60",
};

const app = initializeApp(firebaseConfig);

export const auth = getAuth(app);
export const db = getFirestore(app);
export const googleProvider = new GoogleAuthProvider();

// Always show Google's account chooser. Without this, a browser that is
// signed in to exactly one Google account skips the chooser and signs that
// account in straight away — the person never gets to pick (or add) a
// different account. "select_account" forces the chooser every time.
googleProvider.setCustomParameters({ prompt: "select_account" });

export default app;

// Used for admin-creates-admin: a SEPARATE, temporary Firebase app instance
// so creating a new account doesn't hijack the current admin's session
// (createUserWithEmailAndPassword auto-signs-in as the new user otherwise).
export function createSecondaryAuth() {
  const name = `secondary-${Date.now()}`;
  const secondaryApp = initializeApp(firebaseConfig, name);
  const secondaryAuth = getAuth(secondaryApp);
  return {
    auth: secondaryAuth,
    cleanup: () => deleteApp(secondaryApp),
  };
}