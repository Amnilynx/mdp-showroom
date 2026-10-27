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
  markRead(orderId);
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

// ---------------------------------------------------------------------
// "Needs a look" flags: the red dots on the admin Orders / Inquiries tabs
// and on each order row. Unlike `unread` above (this session only, and
// only for messages that arrive while the page is open), these are worked
// out from the data itself, so they are right straight after sign-in:
// a thread is flagged when its latest message came from the OTHER side
// and is newer than the last time this browser opened that chat. The
// "last opened" times are kept in localStorage per signed-in user.
// ChatNotifier feeds noteThread() from its Firestore listeners.
const attention = new Set(); // thread keys that need a look
const lastSeen = new Map(); // thread key -> time of its latest message (ms)
let readUid = null;
let readMap = {}; // thread key -> time of the latest message already read

const storeKey = () => "mdp.chatRead." + readUid;
const isInquiryKey = (k) => String(k).startsWith("inq_");

function saveRead() {
  try {
    localStorage.setItem(storeKey(), JSON.stringify(readMap));
  } catch {
    /* private mode or storage full: dots just won't survive a reload */
  }
}

export function initAttention(uid) {
  readUid = uid;
  try {
    readMap = JSON.parse(localStorage.getItem(storeKey()) || "{}") || {};
  } catch {
    readMap = {};
  }
  attention.clear();
  lastSeen.clear();
  emit();
}

// fromOtherSide: the latest message was sent by the other party (customer
// -> staff, or staff -> customer), not by the person looking at the screen.
export function noteThread(key, ms, fromOtherSide) {
  lastSeen.set(key, ms);
  let flag = false;
  if (fromOtherSide && ms) {
    if (open.has(key)) {
      readMap[key] = ms; // reading it live
      saveRead();
    } else {
      flag = ms > (readMap[key] || 0);
    }
  }
  const had = attention.has(key);
  if (flag === had) return;
  if (flag) attention.add(key);
  else attention.delete(key);
  emit();
}

export function forgetThread(key) {
  lastSeen.delete(key);
  if (attention.delete(key)) emit();
}

function markRead(key) {
  const ms = lastSeen.get(key);
  if (ms) {
    readMap[key] = ms;
    saveRead();
  }
  if (attention.delete(key)) emit();
}

const anyOrderAttention = () => {
  for (const k of attention) if (!isInquiryKey(k)) return true;
  return false;
};
const anyInquiryAttention = () => {
  for (const k of attention) if (isInquiryKey(k)) return true;
  return false;
};

export function useOrdersAttention() {
  return useSyncExternalStore(subscribeUnread, anyOrderAttention, () => false);
}
export function useInquiriesAttention() {
  return useSyncExternalStore(subscribeUnread, anyInquiryAttention, () => false);
}
export function useThreadAttention(key) {
  return useSyncExternalStore(subscribeUnread, () => attention.has(key), () => false);
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