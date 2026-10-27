import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import AdminLayout from "../../components/AdminLayout";
import {
  getAllOrders,
  ORDER_STATUSES,
  TERMINAL_STATUSES,
  STATUS_LABELS,
} from "../../lib/orders";

const ALL_STATUSES = [...ORDER_STATUSES, ...TERMINAL_STATUSES];

// Lowercase, strip accents, and collapse punctuation so "P12,000", "₱12000",
// "qa.test" and "QA Test" all compare sensibly.
function norm(v) {
  return String(v ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();
}

function formatDate(ts) {
  if (!ts?.toDate) return "—";
  return ts.toDate().toLocaleDateString("en-PH", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

// Everything an admin might reasonably type to find an order.
function buildHaystack(o) {
  const configs = o.configurations || [];
  const total = o.provisionalTotal;
  return norm(
    [
      o.contact?.name,
      o.contact?.email,
      o.contact?.phone,
      o.companyName,
      o.orderCode,
      o.id,
      o.id?.slice(0, 8),
      o.location,
      o.siteAddress,
      STATUS_LABELS[o.status],
      o.status,
      o.orderType === "pure_custom" ? "pure custom company" : "catalog showroom",
      formatDate(o.createdAt),
      total != null ? `${total} ${total.toLocaleString()}` : "",
      ...configs.flatMap((c) => [c.furnitureName, c.shapeType, c.finish]),
    ]
      .filter((x) => x !== undefined && x !== null && x !== "")
      .join(" ")
  );
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

  // Built once per data load, not on every keystroke.
  const indexed = useMemo(
    () => orders.map((o) => ({ order: o, haystack: buildHaystack(o) })),
    [orders]
  );

  // Every word typed must match somewhere (AND), in any order, so
  // "lyna white" finds Lyna Amell's White Closet order.
  const tokens = useMemo(
    () =>
      norm(search)
        .replace(/[₱,]/g, "")
        .split(/\s+/)
        .filter(Boolean),
    [search]
  );

  const filtered = useMemo(
    () =>
      indexed
        .filter(({ order }) => statusFilter === "all" || order.status === statusFilter)
        .filter(({ haystack }) => tokens.every((t) => haystack.includes(t)))
        .map(({ order }) => order),
    [indexed, statusFilter, tokens]
  );

  const filtering = statusFilter !== "all" || tokens.length > 0;

  return (
    <AdminLayout>
      <h1 className="admin-page-title">
        Keep the
        <br />
        Line Moving
      </h1>

      <div className="orders-toolbar">
        <input
          type="search"
          placeholder="Search name, email, phone, order code, furniture, company, status…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="orders-search"
          aria-label="Search orders"
          autoComplete="off"
        />
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          aria-label="Filter by status"
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

      {filtering && !loading && (
        <p className="orders-table-subtext" role="status">
          {filtered.length} of {orders.length} order{orders.length !== 1 ? "s" : ""}
        </p>
      )}

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
            {filtering
              ? "No orders match your search/filter."
              : "No orders yet."}
          </p>
        )}
      </div>
    </AdminLayout>
  );
}