import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import Navbar from "../../components/Navbar";
import Footer from "../../components/Footer";
import Breadcrumb from "../../components/Breadcrumb";
import ChatThread from "../../components/ChatThread";
import { useAuth } from "../../context/AuthContext";
import { getOrdersByCustomer, STATUS_LABELS } from "../../lib/orders";

export default function MyOrders() {
  const { user } = useAuth();
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [activeTab, setActiveTab] = useState("orders");
  const [openChatOrderId, setOpenChatOrderId] = useState(null);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    async function load() {
      try {
        const data = await getOrdersByCustomer(user.uid);
        if (!cancelled) {
          setOrders(data);
          if (data.length > 0) setOpenChatOrderId(data[0].id);
        }
      } catch (err) {
        console.error("MyOrders load failed:", err);
        if (!cancelled) setError("Couldn't load your orders right now.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [user]);

  function formatDate(ts) {
    if (!ts?.toDate) return "—";
    return ts.toDate().toLocaleDateString("en-PH", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  }

  function orderLabel(order) {
    return (
      order.orderCode ||
      `${order.configurations?.[0]?.furnitureName || "Order"} — Draft ${order.id.slice(0, 6)}`
    );
  }

  return (
    <div className="showroom-page">
      <Navbar />

      <div className="showroom-inner">
        <Breadcrumb crumbs={[{ label: "Home", to: "/" }, { label: "Order Status" }]} />

        <h1>Your Orders</h1>
        <p className="showroom-subtitle">
          Track the status of every quote request you've submitted, and
          message our team about any of them.
        </p>

        <div className="ticket-tabs">
          <button
            className={"ticket-tab" + (activeTab === "orders" ? " ticket-tab-active" : "")}
            onClick={() => setActiveTab("orders")}
          >
            Orders
          </button>
          <button
            className={"ticket-tab" + (activeTab === "messages" ? " ticket-tab-active" : "")}
            onClick={() => setActiveTab("messages")}
          >
            💬 Messages
          </button>
        </div>

        {loading && <p>Loading…</p>}
        {error && <p className="form-error">{error}</p>}

        {!loading && orders.length === 0 && (
          <p>
            You haven't submitted any quote requests yet.{" "}
            <Link to="/showroom">Browse the showroom</Link> to get started.
          </p>
        )}

        {!loading && orders.length > 0 && activeTab === "orders" && (
          <div className="my-orders-list">
            {orders.map((order) => (
              <Link
                to={`/orders/${order.id}`}
                key={order.id}
                className="my-order-row"
              >
                <div>
                  <strong>{orderLabel(order)}</strong>
                  <p>{order.configurations?.[0]?.furnitureName || "Order"}</p>
                </div>
                <span className={`status-pill status-pill-${order.status}`}>
                  {STATUS_LABELS[order.status]}
                </span>
                <span className="my-order-date">{formatDate(order.createdAt)}</span>
                <span className="my-order-price">
                  ₱{(order.finalPrice ?? order.provisionalTotal)?.toLocaleString()}
                </span>
                <span className="my-order-arrow">→</span>
              </Link>
            ))}
          </div>
        )}

        {!loading && orders.length > 0 && activeTab === "messages" && (
          <div className="messages-tab-layout">
            <div className="messages-order-list">
              {orders.map((order) => (
                <button
                  key={order.id}
                  className={
                    "messages-order-item" +
                    (openChatOrderId === order.id ? " messages-order-item-active" : "")
                  }
                  onClick={() => setOpenChatOrderId(order.id)}
                >
                  <strong>{orderLabel(order)}</strong>
                  <span className={`status-pill status-pill-${order.status}`}>
                    {STATUS_LABELS[order.status]}
                  </span>
                </button>
              ))}
            </div>
            <div className="ticket-card ticket-chat-card messages-chat-panel">
              {openChatOrderId && <ChatThread orderId={openChatOrderId} />}
            </div>
          </div>
        )}
      </div>

      <Footer />
    </div>
  );
}