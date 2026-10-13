import { db } from "./firebase";
import { doc, getDoc, setDoc } from "firebase/firestore";

const COLLECTION = "settings";
const DOC_ID = "general";

// Fallback used until the settings doc exists in Firestore, or if the read
// fails for any reason — keeps pricing working even on a fresh project.
export const DEFAULT_SETTINGS = {
  hardwareInstallationRate: 0.10,
};

export async function getSettings() {
  const ref = doc(db, COLLECTION, DOC_ID);
  const snap = await getDoc(ref);
  if (!snap.exists()) return { ...DEFAULT_SETTINGS };
  return { ...DEFAULT_SETTINGS, ...snap.data() };
}

// Admin-only write — called from the Pricing Settings card on the Overview
// page. Uses setDoc with merge so it also works the very first time, before
// the settings/general doc exists.
export async function updateSettings(data) {
  const ref = doc(db, COLLECTION, DOC_ID);
  await setDoc(ref, data, { merge: true });
}