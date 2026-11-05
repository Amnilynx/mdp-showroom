import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import AdminLayout from "../../components/AdminLayout";
import {
  getAllOrders,
  ORDER_STATUSES,
  TERMINAL_STATUSES,
  STATUS_LABELS,
} from "../../lib/orders";
import { getReceipts } from "../../lib/receipts";
import { buildEarningsReport, ordersNeedingReceipts } from "../../lib/earningsReport";
import { exportEarningsPdf, exportEarningsXlsx } from "../../lib/earningsExport";

const ALL_STATUSES = [...ORDER_STATUSES, ...TERMINAL_STATUSES];

const MONTH_LABELS = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

export default function AdminReports() {
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  // Export controls. Empty dates = all time.
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [exporting, setExporting] = useState("");
  const [exportError, setExportError] = useState("");
  const rangeInvalid = Boolean(from && to && from > to);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const data = await getAllOrders();
        if (!cancelled) setOrders(data);
      } catch (err) {
        if (!cancelled) setError("Couldn't load report data.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, []);

  // Reads refund receipts only for orders that ever had money verified,
  // then builds the figures and hands them to the PDF / Excel writer.
  async function handleExport(kind) {
    if (rangeInvalid || exporting) return;
    setExporting(kind);
    setExportError("");
    try {
      const needed = ordersNeedingReceipts(orders, from, to);
      const receiptsByOrder = {};
      await Promise.all(
        needed.map(async (o) => {
          receiptsByOrder[o.id] = await getReceipts(o.id);
        })
      );
      const report = buildEarningsReport(orders, receiptsByOrder, { from, to });
      if (kind === "pdf") exportEarningsPdf(report);
      else await exportEarningsXlsx(report);
    } catch (err) {
      console.error(err);
      setExportError("Couldn't create the export. Please try again.");
    } finally {
      setExporting("");
    }
  }

  // Monthly volume — last 6 months including the current one, oldest first.
  const monthlyVolume = useMemo(() => {
    const now = new Date();
    const buckets = [];
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      buckets.push({
        key: `${d.getFullYear()}-${d.getMonth()}`,
        label: MONTH_LABELS[d.getMonth()],
        count: 0,
      });
    }
    orders.forEach((order) => {
      const created = order.createdAt?.toDate?.();
      if (!created) return;
      const key = `${created.getFullYear()}-${created.getMonth()}`;
      const bucket = buckets.find((b) => b.key === key);
      if (bucket) bucket.count += 1;
    });
    return buckets;
  }, [orders]);

  // Status mix — count per status, in a sensible display order.
  const statusCounts = useMemo(() => {
    const counts = {};
    ALL_STATUSES.forEach((s) => (counts[s] = 0));
    orders.forEach((o) => {
      if (counts[o.status] !== undefined) counts[o.status] += 1;
    });
    return counts;
  }, [orders]);

  const maxStatusCount = Math.max(1, ...Object.values(statusCounts));

  return (
    <AdminLayout>
      <h1 className="admin-page-title">
        The monthly
        <br />
        shape of work
      </h1>

      {loading && <p>Loading…</p>}
      {error && <p className="form-error">{error}</p>}

      <div className="ticket-card export-card">
        <div className="export-head">
          <div>
            <p className="section-eyebrow-dark">EXPORT</p>
            <h3>Orders &amp; earnings summary</h3>
            <p className="export-help">
              Totals per status and earnings month by month: confirmed value,
              money received and still to collect. Filtered by the date the
              order was created. Leave the dates empty for all time.
            </p>
          </div>
        </div>
        <div className="export-controls">
          <label className="export-field">
            <span>From</span>
            <input type="date" value={from} max={to || undefined} onChange={(e) => setFrom(e.target.value)} />
          </label>
          <label className="export-field">
            <span>To</span>
            <input type="date" value={to} min={from || undefined} onChange={(e) => setTo(e.target.value)} />
          </label>
          {(from || to) && (
            <button type="button" className="export-clear" onClick={() => { setFrom(""); setTo(""); }}>
              Clear dates
            </button>
          )}
        </div>
        {rangeInvalid && <p className="form-error">“From” must be on or before “To”.</p>}
        {exportError && <p className="form-error">{exportError}</p>}
        <div className="export-actions">
          <button
            type="button"
            className="btn btn-primary"
            disabled={loading || rangeInvalid || Boolean(exporting)}
            onClick={() => handleExport("pdf")}
          >
            {exporting === "pdf" ? "Preparing PDF…" : "Export PDF"}
          </button>
          <button
            type="button"
            className="btn btn-secondary"
            disabled={loading || rangeInvalid || Boolean(exporting)}
            onClick={() => handleExport("xlsx")}
          >
            {exporting === "xlsx" ? "Preparing Excel…" : "Export Excel (.xlsx)"}
          </button>
        </div>
      </div>

      <div className="reports-grid">
        <div className="ticket-card reports-chart-card">
          <p className="section-eyebrow-dark">ORDERS OVER TIME</p>
          <h3>Monthly Volume</h3>
          <div className="reports-chart-wrap">
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={monthlyVolume}>
                <XAxis
                  dataKey="label"
                  axisLine={false}
                  tickLine={false}
                  tick={{ fontSize: 12, fill: "#6b6b6b" }}
                />
                <YAxis hide allowDecimals={false} />
                <Tooltip
                  cursor={{ fill: "rgba(200,150,62,0.08)" }}
                  contentStyle={{
                    fontSize: 12,
                    borderRadius: 6,
                    border: "1px solid #e9e0cf",
                  }}
                />
                <Bar dataKey="count" fill="#8a5a3b" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="ticket-card reports-status-card">
          <p className="section-eyebrow-dark">STATUS MIX</p>
          <h3>Where things stand</h3>

          <div className="status-bars">
            <div className="status-bar-row status-bar-total">
              <span>Orders</span>
              <span>{orders.length}</span>
            </div>
            {ALL_STATUSES.map((s) => (
              <div className="status-bar-row" key={s}>
                <span>{STATUS_LABELS[s]}</span>
                <div className="status-bar-track">
                  <div
                    className="status-bar-fill"
                    style={{
                      width: `${(statusCounts[s] / maxStatusCount) * 100}%`,
                    }}
                  />
                </div>
                <span className="status-bar-count">{statusCounts[s]}</span>
              </div>
            ))}
          </div>

          <Link to="/admin/orders" className="btn btn-secondary reports-inspect-btn">
            Inspect order queue →
          </Link>
        </div>
      </div>
    </AdminLayout>
  );
}
