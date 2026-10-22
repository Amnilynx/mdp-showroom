import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { collection, query, orderBy, onSnapshot } from "firebase/firestore";
import { db } from "../../lib/firebase";
import AdminLayout from "../../components/AdminLayout";
import ChatThread from "../../components/ChatThread";
import { inquiryThreadId } from "../../lib/messages";
import { getUnreadFor, useUnread } from "../../lib/chatPresence";

// Admin inbox for pre-order questions: every customer who has messaged MDP
// without (or before) placing an order. One thread per customer
// (inquiries/{customerUid}); order chats stay on each order's Messages tab.
export default function Inquiries() {
  const [params, setParams] = useSearchParams();
  const [threads, setThreads] = useState([]);
  const [loading, setLoading] = useState(true);
  useUnread(); // re-render when unread counts change
  const selected = params.get("thread");

  useEffect(() => {
    const q = query(collection(db, "inquiries"), orderBy("lastMessageAt", "desc"));
    return onSnapshot(
      q,
      (snap) => {
        setThreads(snap.docs.map((d) => ({ id: d.id, ...d.data({ serverTimestamps: "estimate" }) })));
        setLoading(false);
      },
      (err) => {
        console.error("Inquiries failed:", err);
        setLoading(false);
      }
    );
  }, []);

  function when(ts) {
    if (!ts?.toDate) return "";
    return ts.toDate().toLocaleString("en-PH", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
  }

  const current = threads.find((t) => t.id === selected);

  return (
    <AdminLayout title="Inquiries">
      <p className="inquiries-help">
        Questions customers send before ordering. Replies appear in the customer's chat bubble.
      </p>
      <div className="inquiries-layout">
        <div className="inquiries-list">
          {loading && <p className="chat-empty">Loading…</p>}
          {!loading && threads.length === 0 && (
            <p className="chat-empty">No inquiries yet. They'll show up here when a customer messages you.</p>
          )}
          {threads.map((t) => {
            const unread = getUnreadFor(inquiryThreadId(t.id));
            return (
              <button
                key={t.id}
                type="button"
                className={
                  "inquiry-item" +
                  (t.id === selected ? " inquiry-item-active" : "") +
                  (unread > 0 ? " inquiry-item-unread inquiry-item-alert" : "")
                }
                onClick={() => setParams({ thread: t.id })}
              >
                <span className="inquiry-name">
                  {t.customerName || "Customer"}
                  {unread > 0 && <span className="tab-unread-badge">{unread} NEW</span>}
                </span>
                <span className="inquiry-preview">
                  {t.lastMessageRole === "manager" ? "You: " : ""}
                  {t.lastMessageText}
                </span>
                <span className="inquiry-time">{when(t.lastMessageAt)}</span>
              </button>
            );
          })}
        </div>

        <div className="inquiries-chat">
          {current ? (
            <>
              <h4 className="inquiries-chat-title">{current.customerName || "Customer"}</h4>
              <ChatThread key={current.id} orderId={inquiryThreadId(current.id)} />
            </>
          ) : (
            <p className="chat-empty">Select an inquiry to read and reply.</p>
          )}
        </div>
      </div>
    </AdminLayout>
  );
}