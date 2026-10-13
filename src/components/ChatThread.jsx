import { useEffect, useRef, useState } from "react";
import { useAuth } from "../context/AuthContext";
import { sendMessage, subscribeToMessages } from "../lib/messages";

export default function ChatThread({ orderId }) {
  const { user, profile } = useAuth();
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(true);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const bottomRef = useRef(null);

  useEffect(() => {
    const unsubscribe = subscribeToMessages(orderId, (msgs) => {
      setMessages(msgs);
      setLoading(false);
    });
    return unsubscribe;
  }, [orderId]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  async function handleSend(e) {
    e.preventDefault();
    if (!draft.trim() || sending) return;
    setSending(true);
    try {
      await sendMessage(orderId, {
        senderId: user.uid,
        senderRole: profile?.role || "customer",
        senderName: profile?.fullName || user.email || "Someone",
        text: draft,
      });
      setDraft("");
    } catch (err) {
      alert("Failed to send message. Please try again.");
    } finally {
      setSending(false);
    }
  }

  function formatTime(ts) {
    if (!ts?.toDate) return "";
    return ts.toDate().toLocaleString("en-PH", {
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });
  }

  return (
    <div className="chat-thread">
      <div className="chat-messages">
        {loading && <p className="chat-empty">Loading messages…</p>}
        {!loading && messages.length === 0 && (
          <p className="chat-empty">
            No messages yet. Send the first one below.
          </p>
        )}
        {messages.map((m) => {
          // Automated notices (status changes, price issued, deposit
          // verified) — centered, no bubble, distinct from a real reply.
          if (m.senderRole === "system") {
            return (
              <div key={m.id} className="chat-system-row">
                <span className="chat-system-text">{m.text}</span>
                <span className="chat-system-time">{formatTime(m.createdAt)}</span>
              </div>
            );
          }

          const isMine = m.senderId === user.uid;
          return (
            <div
              key={m.id}
              className={
                "chat-bubble-row" + (isMine ? " chat-bubble-row-mine" : "")
              }
            >
              <div
                className={
                  "chat-bubble" +
                  (isMine ? " chat-bubble-mine" : "") +
                  (m.senderRole === "manager" ? " chat-bubble-admin" : "")
                }
              >
                {m.senderRole === "manager" && (
                  <span className="chat-sender-name">{m.senderName}</span>
                )}
                <p>{m.text}</p>
                <span className="chat-timestamp">{formatTime(m.createdAt)}</span>
              </div>
            </div>
          );
        })}
        <div ref={bottomRef} />
      </div>

      <form className="chat-input-row" onSubmit={handleSend}>
        <input
          placeholder="Write a message…"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          disabled={sending}
        />
        <button type="submit" disabled={sending || !draft.trim()}>
          Send
        </button>
      </form>
    </div>
  );
}