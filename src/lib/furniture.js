import { db } from "./firebase";
import {
  collection,
  doc,
  getDocs,
  getDoc,
  query,
  where,
  addDoc,
  updateDoc,
  deleteDoc,
} from "firebase/firestore";

const COLLECTION = "furniture";

export async function getFurnitureByCategory(categoryId) {
  const q = query(
    collection(db, COLLECTION),
    where("categoryId", "==", categoryId),
    where("active", "==", true)
  );
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

export async function getFurnitureById(furnitureId) {
  const ref = doc(db, COLLECTION, furnitureId);
  const snap = await getDoc(ref);
  if (!snap.exists()) return null;
  return { id: snap.id, ...snap.data() };
}

export async function getAllFurniture() {
  const snap = await getDocs(collection(db, COLLECTION));
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

// --- Admin CRUD ---

export async function createFurniture(data) {
  const ref = await addDoc(collection(db, COLLECTION), {
    ...data,
    active: true,
  });
  return ref.id;
}

export async function updateFurniture(furnitureId, data) {
  const ref = doc(db, COLLECTION, furnitureId);
  await updateDoc(ref, data);
}

export async function deleteFurniture(furnitureId) {
  const ref = doc(db, COLLECTION, furnitureId);
  await deleteDoc(ref);
}

// --- Price calculation (client-side, per architecture plan) ---
// basePrice(shape) + sum of selected finish/hardware add-ons
export function calculatePrice({ sizeOption, finishOption, hardwareOption }) {
  const base = sizeOption?.price ?? 0;
  const finishAddOn = finishOption?.priceAddOn ?? 0;
  const hardwareAddOn = hardwareOption?.priceAddOn ?? 0;
  return base + finishAddOn + hardwareAddOn;
}
