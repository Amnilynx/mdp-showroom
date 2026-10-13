import { db } from "./firebase";
import {
  collection,
  doc,
  getDocs,
  getDoc,
  setDoc,
  updateDoc,
  deleteDoc,
} from "firebase/firestore";

const COLLECTION = "categories";

export async function getCategories() {
  const snap = await getDocs(collection(db, COLLECTION));
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

export async function getCategoryById(categoryId) {
  const ref = doc(db, COLLECTION, categoryId);
  const snap = await getDoc(ref);
  if (!snap.exists()) return null;
  return { id: snap.id, ...snap.data() };
}

// --- Admin CRUD ---

// Categories use a meaningful slug as the document ID (e.g. "modular-kitchens")
// rather than an auto-ID, because furniture docs reference it directly via
// categoryId. The admin form turns the typed name into a slug automatically
// (see CategoryForm.jsx), but this function takes the final slug directly.
export async function createCategory(categoryId, data) {
  const ref = doc(db, COLLECTION, categoryId);
  const existing = await getDoc(ref);
  if (existing.exists()) {
    throw new Error("A category with that ID already exists.");
  }
  await setDoc(ref, data);
  return categoryId;
}

export async function updateCategory(categoryId, data) {
  const ref = doc(db, COLLECTION, categoryId);
  await updateDoc(ref, data);
}

// Deleting a category does NOT cascade-delete its furniture — the caller
// (CategoriesList.jsx) checks for and warns about linked furniture first,
// since orphaned furniture would still technically load by ID but vanish
// from Browse List (which filters by categoryId).
export async function deleteCategory(categoryId) {
  const ref = doc(db, COLLECTION, categoryId);
  await deleteDoc(ref);
}