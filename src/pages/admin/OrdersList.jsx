import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import AdminLayout from "../../components/AdminLayout";
import {
  getAllOrders,
  ORDER_STATUSES,
  TERMINAL_STATUSES,
  STATUS_LABELS,
} from "../../lib/orders";
import { useThreadAttention } from "../../lib/chatPresence";

const ALL_STATUSES = [...ORDER_STATUSES, ...TERMINAL_STATUSES];

// Blinking red dot on the left of an order row while that order has a
// customer message nobody has opened yet. Clears when its Messages tab is
// opened, or when the owners reply.
function MessageDot({ orderId }) {
  const needsLook = useThreadAttention(orderId);
  if (!needsLook) return null;
  return <i className="row-dot" role="img" aria-label="New message on this order" title="New message" />;
}

export default function AdminOrdersList() {
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [search, setSearch] = useState("");
  const navigate = useNavigate();

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const data = await getAllOrders();
        if (!cancelled) setOrders(data);
      } catch (err) {
        if (!cancelled) setError("Couldn't load orders.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, []);

  const searchTerm = search.trim().toLowerCase();

  const filtered = orders
    .filter((o) => statusFilter === "all" || o.status === statusFilter)
    .filter((o) => {
      if (!searchTerm) return true;
      const haystack = [
        o.contact?.name,
        o.contact?.email,
        o.orderCode,
        o.id,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return haystack.includes(searchTerm);
    });

  function formatDate(ts) {
    if (!ts?.toDate) return "—";
    return ts.toDate().toLocaleDateString("en-PH", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  }

  return (
    <AdminLayout>
      <h1 className="admin-page-title">
        Keep the
        <br />
        Line Moving
      </h1>

      <div className="orders-toolbar">
        <input
          type="text"
          placeholder="Search by name, email, or order code…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="orders-search"
        />
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
        >
          <option value="all">All Status</option>
          {ALL_STATUSES.map((s) => (
            <option key={s} value={s}>
              {STATUS_LABELS[s]}
            </option>
          ))}
        </select>
        {(statusFilter !== "all" || search) && (
          <button
            className="clear-filter-btn"
            onClick={() => {
              setStatusFilter("all");
              setSearch("");
            }}
          >
            Clear
          </button>
        )}
      </div>

      {loading && <p>Loading…</p>}
      {error && <p className="form-error">{error}</p>}

      <div className="orders-table">
        <div className="orders-table-header">
          <span>Orders</span>
          <span>Customer</span>
          <span>Date Ordered</span>
          <span>Value</span>
          <span>Status</span>
        </div>
        {filtered.map((order) => (
          <div
            className="orders-table-row"
            key={order.id}
            onClick={() => navigate(`/admin/orders/${order.id}`)}
          >
            <MessageDot orderId={order.id} />
            <span>
              <strong>{order.configurations?.[0]?.furnitureName || "Order"}</strong>
              <br />
              <span className="orders-table-subtext">
                {order.orderCode || order.id.slice(0, 8)}
              </span>
            </span>
            <span>
              {order.contact?.name}
              <br />
              <span className="orders-table-subtext">{order.contact?.email}</span>
            </span>
            <span>{formatDate(order.createdAt)}</span>
            <span>₱{order.provisionalTotal?.toLocaleString()}</span>
            <span className={`status-pill status-pill-${order.status}`}>
              {STATUS_LABELS[order.status]}
            </span>
          </div>
        ))}
        {!loading && filtered.length === 0 && (
          <p className="orders-empty">
            {search || statusFilter !== "all"
              ? "No orders match your search/filter."
              : "No orders yet."}
          </p>
        )}
      </div>
    </AdminLayout>
  );
}