// The shared "Studio Note" on the admin Overview. One document that every admin
// sees and edits (collection teamNotes, document "studio"). Managers only: see
// the teamNotes block in firestore.rules.
import { db } from "./firebase";
import { doc, onSnapshot, setDoc, serverTimestamp } from "firebase/firestore";

const REF = () => doc(db, "teamNotes", "studio");
export const NOTE_MAX_LENGTH = 2000;

// Calls cb({ text, updatedBy, updatedAt }) now and whenever someone saves.
export function subscribeToTeamNote(cb, onError) {
  return onSnapshot(
    REF(),
    (snap) => {
      const d = snap.exists() ? snap.data({ serverTimestamps: "estimate" }) : {};
      cb({ text: d.text || "", updatedBy: d.updatedBy || "", updatedAt: d.updatedAt?.toDate?.() || null });
    },
    onError
  );
}

export async function saveTeamNote(text, authorName) {
  await setDoc(REF(), { text: String(text).slice(0, NOTE_MAX_LENGTH), updatedBy: authorName || "An admin", updatedAt: serverTimestamp() });
}