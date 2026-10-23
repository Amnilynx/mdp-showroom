import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import AdminLayout from "../../components/AdminLayout";
import { getAllOrders, STATUS_LABELS } from "../../lib/orders";

export default function AdminOverview() {
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
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

  const total = orders.length;
  const pendingReview = orders.filter((o) =>
    ["request_received", "under_review", "est_price_issued"].includes(o.status)
  ).length;
  const inProduction = orders.filter((o) => o.status === "in_production").length;
  const completed = orders.filter((o) => o.status === "completed").length;

  const latest = orders.slice(0, 4);

  return (
    <AdminLayout>
      <div className="admin-header-row">
        <h1>
          The Work In
          <br />
          Motion
        </h1>
        <Link to="/admin/orders" className="btn btn-primary">
          Review Orders →
        </Link>
      </div>

      {error && <p className="form-error">{error}</p>}

      <div className="stat-cards">
        <div className="stat-card">
          <p className="stat-card-label">Total Orders</p>
          <p className="stat-card-value">{loading ? "…" : total}</p>
          <p className="stat-card-sub">All Time</p>
        </div>
        <div className="stat-card">
          <p className="stat-card-label">Pending Review</p>
          <p className="stat-card-value">{loading ? "…" : pendingReview}</p>
          <p className="stat-card-sub">Needs a look</p>
        </div>
        <div className="stat-card">
          <p className="stat-card-label">In Production</p>
          <p className="stat-card-value">{loading ? "…" : inProduction}</p>
          <p className="stat-card-sub">On the floor</p>
        </div>
        <div className="stat-card">
          <p className="stat-card-label">Completed</p>
          <p className="stat-card-value">{loading ? "…" : completed}</p>
          <p className="stat-card-sub">Shipped/Installed</p>
        </div>
      </div>

      <div className="overview-lower">
        <div className="overview-latest">
          <div className="overview-latest-header">
            <p className="section-eyebrow-dark">RECENT ACTIVITY</p>
            <Link to="/admin/orders">See all →</Link>
          </div>
          <h3>Latest Orders</h3>

          {loading && <p>Loading…</p>}
          {!loading && latest.length === 0 && <p>No orders yet.</p>}

          {latest.map((order) => (
            <div
              className="latest-order-row"
              key={order.id}
              onClick={() => navigate(`/admin/orders/${order.id}`)}
            >
              <span className="latest-order-icon">📦</span>
              <span className="latest-order-name">
                {order.configurations?.[0]?.furnitureName || "Order"}
              </span>
              <span className={`latest-order-status status-pill-${order.status}`}>
                {STATUS_LABELS[order.status]}
              </span>
              <span className="latest-order-price">
                ₱{order.provisionalTotal?.toLocaleString()}
              </span>
              <span className="latest-order-arrow">→</span>
            </div>
          ))}
        </div>

        <div className="overview-side-stack">
          <div className="overview-note">
            <p className="section-eyebrow-dark">STUDIO NOTE</p>
            <textarea
              placeholder="Jot a note for the team…"
              className="studio-note-area"
            />
            <Link to="/admin/reports" className="btn btn-primary studio-note-btn">
              Open Reports →
            </Link>
          </div>
        </div>
      </div>
    </AdminLayout>
  );
}