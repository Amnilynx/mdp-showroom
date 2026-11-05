// Works out the numbers behind the Reports export. Pure functions, no Firebase,
// so the same figures feed the PDF, the Excel file and (if wanted) the screen.
//
// Money definitions (also printed in the PDF so nobody has to guess):
//   Confirmed value  payable total of an order MDP has priced (finalPrice set),
//                    including accepted changes. Rejected / cancelled orders = 0.
//   Estimated        system estimate of orders not yet priced by MDP. Kept apart
//                    so unconfirmed money never inflates the real figures.
//   Received         verified deposit + progress/final billings marked paid,
//                    minus refunds already sent back. Active orders only.
//   Still to collect confirmed value - received (never below 0), active orders only.
//   To refund        verified money of a rejected/cancelled order not yet sent back.
import { ORDER_STATUSES, TERMINAL_STATUSES } from "./orders";
import { getPaymentSummary } from "./refunds";

export const ALL_STATUSES = [...ORDER_STATUSES, ...TERMINAL_STATUSES];

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

const blank = () => ({ orders: 0, value: 0, received: 0, toCollect: 0, estimated: 0, toRefund: 0 });

export function orderMoney(order, receipts = []) {
  const s = getPaymentSummary(order, receipts);
  const terminal = s.terminal;
  const paidBillings = (order.billings || [])
    .filter((b) => b.paidAt)
    .reduce((n, b) => n + (Number(b.amount) || 0), 0);
  const held = Math.max(0, s.depositPaid + paidBillings - s.refunded);
  // Money on a rejected/cancelled order is not earned: it is held to be refunded.
  const received = terminal ? 0 : held;
  const priced = order.finalPrice != null && Number(order.finalPrice) > 0;
  const value = !terminal && priced ? s.payable : 0;
  const estimated = !terminal && !priced ? Number(order.provisionalTotal) || 0 : 0;
  return {
    value,
    estimated,
    received,
    toCollect: !terminal && priced ? Math.max(0, value - received) : 0,
    toRefund: terminal ? held : 0,
  };
}

function add(row, m) {
  row.orders += 1;
  row.value += m.value;
  row.received += m.received;
  row.toCollect += m.toCollect;
  row.estimated += m.estimated;
  row.toRefund += m.toRefund;
}

// from / to are "YYYY-MM-DD" strings or "". Compared on the order's created date.
export function inRange(order, from, to) {
  const d = order.createdAt?.toDate ? order.createdAt.toDate() : order.createdAt instanceof Date ? order.createdAt : null;
  if (!from && !to) return true;
  if (!d) return false;
  if (from && d < new Date(from + "T00:00:00")) return false;
  if (to && d > new Date(to + "T23:59:59.999")) return false;
  return true;
}

export function buildEarningsReport(orders, receiptsByOrder = {}, { from = "", to = "" } = {}) {
  const picked = orders.filter((o) => inRange(o, from, to));
  const byStatus = {};
  ALL_STATUSES.forEach((s) => (byStatus[s] = blank()));
  const months = new Map();
  const total = blank();

  picked.forEach((o) => {
    const m = orderMoney(o, receiptsByOrder[o.id] || []);
    if (!byStatus[o.status]) byStatus[o.status] = blank();
    add(byStatus[o.status], m);
    add(total, m);
    const d = o.createdAt?.toDate ? o.createdAt.toDate() : null;
    if (d) {
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      if (!months.has(key)) months.set(key, { key, label: `${MONTHS[d.getMonth()]} ${d.getFullYear()}`, ...blank() });
      add(months.get(key), m);
    }
  });

  return {
    from,
    to,
    generatedAt: new Date(),
    total,
    statuses: Object.keys(byStatus).map((s) => ({ status: s, ...byStatus[s] })),
    months: [...months.values()].sort((a, b) => a.key.localeCompare(b.key)),
  };
}

// Which orders need their receipts read (refunds live there). Only orders that
// ever had money verified can have a refund.
export function ordersNeedingReceipts(orders, from, to) {
  return orders.filter((o) => inRange(o, from, to) && (o.depositConfirmed || (o.billings || []).some((b) => b.paidAt)));
}
