import { useSyncExternalStore } from "react";

// Shared, in-memory state about chats:
//   open    which order chats are on screen right now
//   unread  messages that arrived while that chat was NOT on screen
// ChatNotifier writes it; the floating bubble, the order pages' Messages
// tab and the browser-tab title read it to blink until the chat is opened.
const open = new Map();
const unread = new Map(); // orderId -> count
const subs = new Set();

function emit() {
  subs.forEach((s) => s());
}

export function markChatOpen(orderId) {
  open.set(orderId, (open.get(orderId) || 0) + 1);
  clearUnread(orderId); // looking at it = read
}

export function markChatClosed(orderId) {
  const n = (open.get(orderId) || 1) - 1;
  if (n <= 0) open.delete(orderId);
  else open.set(orderId, n);
}

export function isChatOpen(orderId) {
  return open.has(orderId);
}

export function addUnread(orderId) {
  unread.set(orderId, (unread.get(orderId) || 0) + 1);
  emit();
}

export function clearUnread(orderId) {
  if (unread.delete(orderId)) emit();
}

export function getUnreadFor(orderId) {
  return unread.get(orderId) || 0;
}

export function getUnreadTotal() {
  let n = 0;
  unread.forEach((v) => (n += v));
  return n;
}

// Unread messages across pre-order inquiry threads only (keys "inq_...").
export function getUnreadInquiries() {
  let n = 0;
  unread.forEach((v, k) => {
    if (String(k).startsWith("inq_")) n += v;
  });
  return n;
}

export function subscribeUnread(cb) {
  subs.add(cb);
  return () => subs.delete(cb);
}

// useUnread()         -> unread messages across all orders
// useUnread(orderId)  -> unread messages for one order
export function useUnreadInquiries() {
  return useSyncExternalStore(subscribeUnread, getUnreadInquiries, () => 0);
}

export function useUnread(orderId) {
  return useSyncExternalStore(
    subscribeUnread,
    () => (orderId ? getUnreadFor(orderId) : getUnreadTotal()),
    () => 0
  );
}