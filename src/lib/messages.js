import { db } from "./firebase";
import {
  collection,
  addDoc,
  query,
  orderBy,
  onSnapshot,
  serverTimestamp,
} from "firebase/firestore";

// Messages live as a subcollection under each order:
//   orders/{orderId}/messages/{messageId}
// This keeps chat scoped per-order (per architecture decision) and lets
// any admin who opens that order see the exact same shared thread.

function messagesCollection(orderId) {
  return collection(db, "orders", orderId, "messages");
}

export async function sendMessage(orderId, { senderId, senderRole, senderName, text }) {
  await addDoc(messagesCollection(orderId), {
    senderId,
    senderRole, // "customer" | "manager"
    senderName, // display name at time of sending
    text: text.trim(),
    createdAt: serverTimestamp(),
  });
}

// Automated, admin-triggered message — posted into the thread whenever the
// system itself changes something on an order (status update, price issued,
// deposit verified), so the customer sees what happened without needing to
// keep refreshing their order page. Rendered distinctly in ChatThread.jsx
// via senderRole: "system" (no avatar/name, centered, muted style).
export async function sendSystemMessage(orderId, text) {
  await addDoc(messagesCollection(orderId), {
    senderId: "system",
    senderRole: "system",
    senderName: "MDP Modular Systems",
    text,
    createdAt: serverTimestamp(),
  });
}

// Real-time listener — calls `callback` with the current message list
// every time the thread changes. Returns an unsubscribe function.
export function subscribeToMessages(orderId, callback) {
  const q = query(messagesCollection(orderId), orderBy("createdAt", "asc"));
  return onSnapshot(q, (snap) => {
    const messages = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    callback(messages);
  });
}