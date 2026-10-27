// Which email addresses belong to MDP staff.
//
// Two sources, checked together:
//   1. PROTECTED_ADMIN_EMAILS below: the owners. They are hardcoded so they work
//      even if the database is empty or unreachable, and the Accounts page never
//      lets anyone remove them.
//   2. The Firestore collection "staffEmails": one tiny document per admin
//      (document id = the email, lowercased and encoded). It mirrors every
//      account with role "manager". It exists because a visitor who is not signed
//      in yet cannot read the users collection, but must still be stopped from
//      registering with an admin's address. The rules allow a single lookup by
//      exact email (get), not browsing the list.
import { db } from "./firebase";
import { doc, getDoc, setDoc, deleteDoc, updateDoc, serverTimestamp } from "firebase/firestore";

// TODO: put the two or three owner / main admin emails here, in lowercase.
export const PROTECTED_ADMIN_EMAILS = [
  // "owner1@gmail.com",
  // "owner2@gmail.com",
];

const COLLECTION = "staffEmails";
const clean = (email) => String(email || "").trim().toLowerCase();
const keyOf = (email) => encodeURIComponent(clean(email));

export function isProtectedAdmin(email) {
  return PROTECTED_ADMIN_EMAILS.includes(clean(email));
}

// True if this address is hardcoded or listed in the database. If the database
// can't be reached, the hardcoded list alone decides.
export async function isStaffEmail(email) {
  const e = clean(email);
  if (!e) return false;
  if (PROTECTED_ADMIN_EMAILS.includes(e)) return true;
  try {
    const snap = await getDoc(doc(db, COLLECTION, keyOf(e)));
    return snap.exists();
  } catch {
    return false;
  }
}

// Called when an admin account is created, and again each time an admin signs
// in (so admins created before this feature are added automatically).
export async function registerStaffEmail(email, uid) {
  const e = clean(email);
  if (!e) return;
  await setDoc(doc(db, COLLECTION, keyOf(e)), { email: e, uid: uid || null, updatedAt: serverTimestamp() }, { merge: true });
}

// Removes admin access. The person becomes an ordinary customer. Their login
// itself can't be deleted from the browser (that needs the Firebase console), but
// without the manager role it opens nothing in the admin area.
export async function removeAdminAccess(uid, email) {
  if (isProtectedAdmin(email)) throw new Error("This is a protected owner account and can't be removed here.");
  await updateDoc(doc(db, "users", uid), { role: "customer" });
  try {
    await deleteDoc(doc(db, COLLECTION, keyOf(email)));
  } catch (err) {
    console.error("Couldn't remove staffEmails entry:", err);
  }
}