import { db } from "./firebase";
import {
  doc,
  getDoc,
  setDoc,
  collection,
  query,
  where,
  getDocs,
  serverTimestamp,
} from "firebase/firestore";

const COLLECTION = "users";

export async function getUserProfile(uid) {
  const ref = doc(db, COLLECTION, uid);
  const snap = await getDoc(ref);
  if (!snap.exists()) return null;
  return { uid: snap.id, ...snap.data() };
}

// Called right after Firebase Auth registration to create the matching
// Firestore profile doc. New accounts are always role: "customer" —
// manager accounts are seeded manually in the Firebase console (per plan).
export async function createUserProfile(uid, { fullName, email, phone }) {
  const ref = doc(db, COLLECTION, uid);
  await setDoc(ref, {
    role: "customer",
    fullName,
    email,
    phone: phone ?? "",
    createdAt: serverTimestamp(),
  });
}

// Called after Google Sign-In. Only creates a profile if one doesn't
// already exist for this uid — so a returning Google user (or someone
// who signed up with email first, then also used Google) isn't overwritten.
export async function ensureUserProfile(uid, { fullName, email }) {
  const existing = await getUserProfile(uid);
  if (existing) return existing;
  const ref = doc(db, COLLECTION, uid);
  const newProfile = {
    role: "customer",
    fullName: fullName || "",
    email: email || "",
    phone: "",
    createdAt: serverTimestamp(),
  };
  await setDoc(ref, newProfile);
  return { uid, ...newProfile };
}

export async function createManagerProfile(uid, { fullName, email }) {
  const ref = doc(db, COLLECTION, uid);
  await setDoc(ref, {
    role: "manager",
    fullName,
    email,
    phone: "",
    createdAt: serverTimestamp(),
  });
}

export async function getAllManagers() {
  const q = query(collection(db, COLLECTION), where("role", "==", "manager"));
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ uid: d.id, ...d.data() }));
}