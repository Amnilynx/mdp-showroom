import { useEffect, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { getOrdersByCustomer, STATUS_LABELS } from "../lib/orders";
import { inquiryThreadId } from "../lib/messages";
import { COMPANY_EMAIL } from "../lib/contactConfig";
import ChatThread from "./ChatThread";
import ChatNotifier from "./ChatNotifier";
import { useUnread, getUnreadFor } from "../lib/chatPresence";

const FACEBOOK_URL = "https://www.facebook.com/MdpModularKitchenAndCabinets";

// Site-wide floating chat bubble.
//   - Signed-in customers: always available. The first entry is a general
//     "Ask MDP a question" thread for talking to the owners BEFORE ordering
//     anything (stored at inquiries/{uid}); below it, one thread per order
//     (orders/{orderId}/messages). Defaults to the latest order if there is
//     one, otherwise to the general thread.
//   - Guests: the bubble opens a short note asking them to sign in (so the
//     chat can't be used anonymously), with Facebook / email as alternatives.
//   - Managers: no bubble (they use Inquiries and each order's Messages
//     tab), but the new-message pop-up still runs for them.
//   - On a customer's own order page the bubble sits at the bottom-LEFT
//     (it used to cover that page's Send button on the right) and opens
//     the general question thread, so customers can still reach MDP about
//     anything other than that order after they have ordered.
//
// The open-chat event ("mdp:open-chat", optional detail.threadId) lets
// other parts of the site open the bubble: the footer's "Message us" link
// and the pop-up notifier.
export default function FloatingChat() {
  const { user, profile } = useAuth();
  const { pathname } = useLocation();
  const unread = useUnread();
  const [open, setOpen] = useState(false);
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeId, setActiveId] = useState(null);
  const [pickerOpen, setPickerOpen] = useState(false);

  const isManager = profile?.role === "manager";
  const inquiryId = user ? inquiryThreadId(user.uid) : null;

  useEffect(() => {
    if (!user || isManager) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    async function load() {
      try {
        const data = await getOrdersByCustomer(user.uid);
        if (!cancelled) {
          setOrders(data);
          setActiveId((cur) => cur || (data.length > 0 ? data[0].id : inquiryThreadId(user.uid)));
        }
      } catch {
        if (!cancelled) setActiveId((cur) => cur || inquiryThreadId(user.uid));
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [user, isManager]);

  useEffect(() => {
    function onOpen(e) {
      const id = e.detail?.threadId;
      if (id) setActiveId(id);
      setOpen(true);
    }
    window.addEventListener("mdp:open-chat", onOpen);
    return () => window.removeEventListener("mdp:open-chat", onOpen);
  }, []);

  const onOrderPage = /^\/orders\/[^/]+/.test(pathname);

  if (isManager) return <ChatNotifier />;
  if (user && loading) return <ChatNotifier />;
  if (!user && /^\/(login|register|forgot-password|verify-otp)/.test(pathname)) return null;

  const threads = user
    ? [{ id: inquiryId, label: "Ask MDP a question", sub: "Before ordering" }].concat(
        orders.map((o) => ({
          id: o.id,
          label:
            o.orderCode ||
            `${o.orderType === "pure_custom" ? "Pure custom" : o.configurations?.[0]?.furnitureName || "Order"} — Draft ${o.id.slice(0, 6)}`,
          status: o.status,
        }))
      )
    : [];
  const active = threads.find((t) => t.id === activeId) || threads[0];
  const isInquiry = active?.id === inquiryId;

  return (
    <>
      {user && <ChatNotifier />}
      <div className={"floating-chat" + (onOrderPage ? " floating-chat-left" : "")}>
        {open && (
          <div className="floating-chat-panel">
            <div className="floating-chat-header">
              <div className="floating-chat-header-info">
                <strong>{user ? "Messages" : "Message MDP"}</strong>
                {user &&
                  (threads.length > 1 ? (
                    <button
                      type="button"
                      className="floating-chat-order-switch"
                      onClick={() => setPickerOpen((v) => !v)}
                    >
                      {active.label} ▾
                    </button>
                  ) : (
                    <span className="floating-chat-order-fixed">{active.label}</span>
                  ))}
              </div>
              <button
                type="button"
                className="floating-chat-close"
                onClick={() => setOpen(false)}
                aria-label="Close chat"
              >
                ✕
              </button>
            </div>

            {user && pickerOpen && threads.length > 1 && (
              <div className="floating-chat-order-list">
                {threads.map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    className={
                      "floating-chat-order-item" +
                      (t.id === active.id ? " floating-chat-order-item-active" : "") +
                      (getUnreadFor(t.id) > 0 ? " floating-chat-order-item-alert" : "")
                    }
                    onClick={() => {
                      setActiveId(t.id);
                      setPickerOpen(false);
                    }}
                  >
                    <span>
                      {t.label}
                      {getUnreadFor(t.id) > 0 && (
                        <span className="tab-unread-badge">{getUnreadFor(t.id)} NEW</span>
                      )}
                    </span>
                    {t.status ? (
                      <span className={`status-pill status-pill-${t.status}`}>{STATUS_LABELS[t.status]}</span>
                    ) : (
                      <span className="status-pill">{t.sub}</span>
                    )}
                  </button>
                ))}
              </div>
            )}

            <div className="floating-chat-body">
              {user ? (
                <>
                  {isInquiry && (
                    <p className="inquiry-intro">
                      Questions about our furniture, prices or how ordering works? Message the
                      owners here. No order needed.
                    </p>
                  )}
                  <ChatThread key={active.id} orderId={active.id} />
                </>
              ) : (
                <div className="guest-chat">
                  <p>
                    <strong>Have a question before ordering?</strong>
                  </p>
                  <p>Sign in (or create a free account) to chat with the owners directly.</p>
                  <Link to="/login" className="btn btn-primary" onClick={() => setOpen(false)}>
                    Sign in
                  </Link>
                  <Link to="/register" className="btn btn-secondary" onClick={() => setOpen(false)}>
                    Create account
                  </Link>
                  <p className="guest-chat-alt">
                    Or reach us on{" "}
                    <a href={FACEBOOK_URL} target="_blank" rel="noopener noreferrer">
                      Facebook
                    </a>{" "}
                    or at <a href={`mailto:${COMPANY_EMAIL}`}>{COMPANY_EMAIL}</a>.
                  </p>
                </div>
              )}
            </div>

            {user && !isInquiry && (
              <Link
                to={`/orders/${active.id}`}
                className="floating-chat-view-order"
                onClick={() => setOpen(false)}
              >
                View full order →
              </Link>
            )}
          </div>
        )}

        <button
          type="button"
          className={
            "floating-chat-bubble" + (unread > 0 && !open ? " floating-chat-bubble-alert" : "")
          }
          onClick={() => {
            // On an order page the order's own Messages tab already covers
            // that order, so the bubble opens the general question thread.
            if (!open && onOrderPage && user) setActiveId(inquiryId);
            setOpen((v) => !v);
          }}
          aria-label={open ? "Close chat" : unread > 0 ? `Open chat — ${unread} new` : "Open chat"}
        >
          {open ? "✕" : "💬"}
          {unread > 0 && !open && <span className="floating-chat-badge">{unread}</span>}
        </button>
      </div>
    </>
  );
}