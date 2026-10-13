// "Our Work" portfolio — a public gallery of completed real projects,
// separate from the orderable catalog (categories.js / furniture.js).
// These entries are NOT tied to a furniture item or category; they exist
// purely to showcase finished work and build trust with visitors browsing
// before they've committed to an order.
//
// Images are stored as plain URLs (same pattern as categories/furniture),
// not base64-in-Firestore like payment proofs — a portfolio entry can have
// several photos, and base64 would risk the 1MB Firestore document cap
// fast. Admin pastes a link to an externally-hosted image (Imgur, Google
// Photos, etc.) rather than uploading a file directly.

import { db } from "./firebase";
import {
  collection,
  doc,
  getDocs,
  getDoc,
  addDoc,
  updateDoc,
  deleteDoc,
  query,
  orderBy,
} from "firebase/firestore";

const COLLECTION = "portfolio";

// Newest first — a portfolio reads best with the most recent work up top.
export async function getPortfolioItems() {
  const q = query(collection(db, COLLECTION), orderBy("createdAt", "desc"));
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

export async function getPortfolioItemById(itemId) {
  const ref = doc(db, COLLECTION, itemId);
  const snap = await getDoc(ref);
  if (!snap.exists()) return null;
  return { id: snap.id, ...snap.data() };
}

// --- Admin CRUD ---

// data: { title, description, imageUrls: string[] }
export async function createPortfolioItem(data) {
  const ref = await addDoc(collection(db, COLLECTION), {
    ...data,
    createdAt: Date.now(),
  });
  return ref.id;
}

export async function updatePortfolioItem(itemId, data) {
  const ref = doc(db, COLLECTION, itemId);
  await updateDoc(ref, data);
}

export async function deletePortfolioItem(itemId) {
  const ref = doc(db, COLLECTION, itemId);
  await deleteDoc(ref);
}