import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { getOrdersByCustomer, STATUS_LABELS } from "../lib/orders";
import ChatThread from "./ChatThread";

// Site-wide floating chat bubble for logged-in customers. Chat is scoped
// per-order (orders/{orderId}/messages), so this widget first figures out
// which order to open: defaults to the customer's most recent order, with
// a small switcher if they have more than one. Hidden entirely for
// managers (admin already has Messages inside each order's own detail
// page, where the order context is unambiguous) and for customers with no
// orders yet (nothing to chat about).
export default function FloatingChat() {
  const { user, profile } = useAuth();
  const [open, setOpen] = useState(false);
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeOrderId, setActiveOrderId] = useState(null);
  const [pickerOpen, setPickerOpen] = useState(false);

  useEffect(() => {
    if (!user || profile?.role === "manager") {
      setLoading(false);
      return;
    }
    let cancelled = false;
    async function load() {
      try {
        const data = await getOrdersByCustomer(user.uid);
        if (!cancelled) {
          setOrders(data);
          if (data.length > 0) setActiveOrderId(data[0].id);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [user, profile]);

  // Not logged in, is a manager, still loading, or has no orders — nothing
  // sensible to show, so render nothing rather than an empty/broken bubble.
  if (!user || profile?.role === "manager" || loading || orders.length === 0) {
    return null;
  }

  const activeOrder = orders.find((o) => o.id === activeOrderId) || orders[0];

  function orderLabel(order) {
    return (
      order.orderCode ||
      `${order.configurations?.[0]?.furnitureName || "Order"} — Draft ${order.id.slice(0, 6)}`
    );
  }

  return (
    <div className="floating-chat">
      {open && (
        <div className="floating-chat-panel">
          <div className="floating-chat-header">
            <div className="floating-chat-header-info">
              <strong>Messages</strong>
              {orders.length > 1 ? (
                <button
                  type="button"
                  className="floating-chat-order-switch"
                  onClick={() => setPickerOpen((v) => !v)}
                >
                  {orderLabel(activeOrder)} ▾
                </button>
              ) : (
                <span className="floating-chat-order-fixed">{orderLabel(activeOrder)}</span>
              )}
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

          {pickerOpen && orders.length > 1 && (
            <div className="floating-chat-order-list">
              {orders.map((o) => (
                <button
                  key={o.id}
                  type="button"
                  className={
                    "floating-chat-order-item" +
                    (o.id === activeOrderId ? " floating-chat-order-item-active" : "")
                  }
                  onClick={() => {
                    setActiveOrderId(o.id);
                    setPickerOpen(false);
                  }}
                >
                  <span>{orderLabel(o)}</span>
                  <span className={`status-pill status-pill-${o.status}`}>
                    {STATUS_LABELS[o.status]}
                  </span>
                </button>
              ))}
            </div>
          )}

          <div className="floating-chat-body">
            {activeOrder && <ChatThread orderId={activeOrder.id} />}
          </div>

          <Link
            to={`/orders/${activeOrder.id}`}
            className="floating-chat-view-order"
            onClick={() => setOpen(false)}
          >
            View full order →
          </Link>
        </div>
      )}

      <button
        type="button"
        className="floating-chat-bubble"
        onClick={() => setOpen((v) => !v)}
        aria-label={open ? "Close chat" : "Open chat"}
      >
        {open ? "✕" : "💬"}
      </button>
    </div>
  );
}