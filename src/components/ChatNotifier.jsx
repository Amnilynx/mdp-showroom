import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { collection, query, where, onSnapshot } from "firebase/firestore";
import { inquiryThreadId } from "../lib/messages";
import { db } from "../lib/firebase";
import { useAuth } from "../context/AuthContext";
import {
  isChatOpen,
  addUnread,
  getUnreadFor,
  subscribeUnread,
  useUnread,
} from "../lib/chatPresence";
import { playChime, unlockAudio, setMuted, useMuted } from "../lib/chime";

const MAX_TOASTS = 3;

// New-message alert, deliberately hard to miss:
//   - a pop-up bubble that STAYS (and shakes) until you open the chat
//   - a soft chime (mutable with the bell button, remembered per browser)
//   - the browser-tab title blinks while anything is unread
//   - the floating chat bubble / Messages tab blink too (they read the
//     same unread state from lib/chatPresence.js)
// Customers hear about staff replies; staff hear about customer messages.
// Each message stamps `lastMessage*` on its order (lib/messages.js), so one
// lightweight orders listener is enough — no per-chat listeners.
export default function ChatNotifier() {
  const { user, profile } = useAuth();
  const navigate = useNavigate();
  const muted = useMuted();
  const unreadTotal = useUnread();
  const [toasts, setToasts] = useState([]);
  const seen = useRef(new Map()); // orderId -> last message time handled
  const isManager = profile?.role === "manager";
  const uid = user?.uid;

  // Browsers only allow sound after one interaction with the page.
  useEffect(() => {
    const unlock = () => unlockAudio();
    window.addEventListener("pointerdown", unlock, { once: true });
    window.addEventListener("keydown", unlock, { once: true });
    return () => {
      window.removeEventListener("pointerdown", unlock);
      window.removeEventListener("keydown", unlock);
    };
  }, []);

  // Blink the browser-tab title while there is anything unread.
  useEffect(() => {
    if (unreadTotal <= 0) return;
    const original = document.title;
    let on = false;
    const timer = setInterval(() => {
      on = !on;
      document.title = on ? `💬 (${unreadTotal}) NEW MESSAGE!` : original;
    }, 1000);
    return () => {
      clearInterval(timer);
      document.title = original;
    };
  }, [unreadTotal]);

  // Drop a pop-up once that chat has been opened (read).
  useEffect(
    () =>
      subscribeUnread(() =>
        setToasts((t) => t.filter((x) => getUnreadFor(x.orderId) > 0))
      ),
    []
  );

  useEffect(() => {
    if (!uid || !profile) return;
    seen.current = new Map();
    let firstSnapshot = true;

    // One listener on orders and one on inquiries (pre-order questions).
    // Thread keys: the order id, or "inq_" + customer uid for inquiries.
    function listen(q, keyOf, labelOf) {
      let first = true;
      const unsub = onSnapshot(
        q,
        (snap) => {
          snap.docChanges().forEach((ch) => {
            if (ch.type === "removed") return;
            const d = ch.doc.data({ serverTimestamps: "estimate" });
            const key = keyOf(ch.doc);
            const ms = d.lastMessageAt?.toMillis?.() || 0;
            const prev = seen.current.get(key) || 0;
            seen.current.set(key, ms);

            if (first || !ms || ms <= prev) return;
            if (d.lastMessageBy === uid) return;
            // Staff only hear about customers, customers only about staff.
            if (isManager ? d.lastMessageRole !== "customer" : d.lastMessageRole !== "manager") return;
            if (isChatOpen(key)) return; // the open chat plays its own chime

            addUnread(key);
            playChime();

            const toast = {
              id: key + ":" + ms,
              orderId: key,
              name: d.lastMessageName || (isManager ? "Customer" : "MDP Modular Systems"),
              text: d.lastMessageText || "Sent you a message",
              label: labelOf(d, ch.doc),
            };
            setToasts((t) => [toast, ...t.filter((x) => x.orderId !== toast.orderId)].slice(0, MAX_TOASTS));
          });
          first = false;
        },
        (err) => console.error("Chat notifier failed:", err)
      );
      return unsub;
    }

    const orderQ = isManager
      ? collection(db, "orders")
      : query(collection(db, "orders"), where("customerId", "==", uid));
    const inquiryQ = isManager
      ? collection(db, "inquiries")
      : query(collection(db, "inquiries"), where("customerId", "==", uid));

    const unsubOrders = listen(
      orderQ,
      (doc) => doc.id,
      (d, doc) =>
        d.orderCode || `${d.configurations?.[0]?.furnitureName || "Order"} — ${doc.id.slice(0, 6)}`
    );
    const unsubInquiries = listen(
      inquiryQ,
      (doc) => inquiryThreadId(doc.id),
      () => "Question before ordering"
    );
    const unsub = () => {
      unsubOrders();
      unsubInquiries();
    };
    return unsub;
  }, [uid, profile?.role]);

  if (!uid) return null;

  function dismiss(id) {
    setToasts((t) => t.filter((x) => x.id !== id));
  }

  function open(t) {
    dismiss(t.id);
    if (t.orderId.startsWith("inq_")) {
      // Pre-order question: staff go to the Inquiries page, customers get
      // the floating chat opened on that thread.
      if (isManager) navigate(`/admin/inquiries?thread=${t.orderId.slice(4)}`);
      else window.dispatchEvent(new CustomEvent("mdp:open-chat", { detail: { threadId: t.orderId } }));
      return;
    }
    navigate(isManager ? `/admin/orders/${t.orderId}?tab=messages` : `/orders/${t.orderId}?tab=messages`);
  }

  function toggleSound() {
    unlockAudio();
    const next = !muted;
    setMuted(next);
    if (!next) playChime(); // preview when turning it back on
  }

  return (
    <>
      {toasts.length > 0 && (
        <div
          className={"chat-toasts" + (isManager ? " chat-toasts-admin" : "")}
          role="alert"
          aria-live="assertive"
        >
          {toasts.map((t) => {
            const count = getUnreadFor(t.orderId);
            return (
              <div className="chat-toast" key={t.id}>
                <button type="button" className="chat-toast-body" onClick={() => open(t)}>
                  <span className="chat-toast-icon" aria-hidden="true">🔔</span>
                  <span className="chat-toast-text">
                    <strong>
                      {t.name}
                      {count > 1 && <span className="chat-toast-count">{count} new</span>}
                    </strong>
                    <span className="chat-toast-order">{t.label}</span>
                    <span className="chat-toast-msg">{t.text}</span>
                    <span className="chat-toast-cta">Tap to open the chat →</span>
                  </span>
                </button>
                <button
                  type="button"
                  className="chat-toast-close"
                  onClick={() => dismiss(t.id)}
                  aria-label="Dismiss"
                >
                  ✕
                </button>
              </div>
            );
          })}
        </div>
      )}

      <button
        type="button"
        className={"chat-sound-toggle" + (muted ? " chat-sound-toggle-off" : "")}
        onClick={toggleSound}
        aria-pressed={muted}
        title={muted ? "Chat sound is off — click to turn on" : "Chat sound is on — click to mute"}
      >
        <span aria-hidden="true">{muted ? "🔕" : "🔔"}</span>
        <span className="chat-sound-toggle-label">{muted ? "Sound off" : "Sound on"}</span>
      </button>
    </>
  );
}