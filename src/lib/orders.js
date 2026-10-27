import { db } from "./firebase";
import {
  collection,
  doc,
  getDocs,
  getDoc,
  query,
  where,
  orderBy,
  addDoc,
  updateDoc,
  serverTimestamp,
  arrayUnion,
  Timestamp,
} from "firebase/firestore";
import { sendSystemMessage } from "./messages";

const COLLECTION = "orders";

// Fallback only — the live, admin-adjustable rate lives in Firestore
// (settings/general.hardwareInstallationRate, see lib/settings.js).
// Pages fetch the live value via getSettings() and fall back to this
// constant if that doc doesn't exist yet or fails to load.
export const HARDWARE_INSTALLATION_RATE = 0.10;

// Where to send manual payments. MDP takes payments by bank deposit only
// (confirmed in Interviews 1 and 2), so the bank is the one and only method.
// Plain constants for now — move to a Settings doc in Firestore later if
// this needs to be admin-editable.
export const PAYMENT_METHODS = {
  bank: {
    label: "Bank Deposit (BDO)",
    name: "MDP Modular Systems",
    accountNumber: "0000-0000-0000", // TODO: replace with real account number
  },
};

export const DEFAULT_PAYMENT_METHOD = "bank";

// Orders paid before GCash was removed still say "gcash" — show them
// honestly instead of printing the raw key.
export function paymentMethodLabel(key) {
  if (PAYMENT_METHODS[key]) return PAYMENT_METHODS[key].label;
  if (key === "gcash") return "GCash (earlier order)";
  return key || "";
}

// ---------- Deposit window ----------
// The owners give a client two weeks after the quotation is agreed (the
// contract is signed) to pay the downpayment. No materials are bought and no
// work starts until it is paid. The clock starts when the customer presses
// "Accept Quotation"; MDP can extend it, or close the order if it lapses.
export const DEPOSIT_WINDOW_DAYS = 14;
export const DEPOSIT_EXTENSION_DAYS = 7;
export const DEPOSIT_WARN_DAYS = 3; // banner turns amber at this many days left
const DAY_MS = 24 * 60 * 60 * 1000;

function toMillis(v) {
  if (!v) return null;
  if (typeof v.toMillis === "function") return v.toMillis();
  if (typeof v.toDate === "function") return v.toDate().getTime();
  if (typeof v === "number") return v;
  const t = new Date(v).getTime();
  return Number.isNaN(t) ? null : t;
}

export function getDepositDueMillis(order) {
  return toMillis(order?.depositDueDate);
}

export function getQuoteAcceptedMillis(order) {
  return toMillis(order?.quoteAcceptedAt);
}

// Whole days left (rounded up). Negative once overdue; null if no window yet.
export function getDepositDaysLeft(order, now = Date.now()) {
  const due = getDepositDueMillis(order);
  if (due == null) return null;
  return Math.ceil((due - now) / DAY_MS);
}

// Where the order is in the deposit step:
//   "waiting_price"  – MDP has not issued a final price yet
//   "needs_accept"   – price issued, customer has not accepted it
//   "window_open"    – accepted, inside the 2-week window
//   "overdue"        – accepted, window passed, nothing paid
//   "submitted"      – customer submitted payment, MDP verifying
//   "paid"           – deposit verified by MDP
//   "closed"         – cancelled or rejected
export function getDepositStage(order, now = Date.now()) {
  if (!order) return "waiting_price";
  if (order.status === "cancelled" || order.status === "rejected") return "closed";
  if (order.depositConfirmed) return "paid";
  if (order.paymentReference) return "submitted";
  if (!order.finalPrice) return "waiting_price";
  if (!order.quoteAcceptedAt) return "needs_accept";
  const left = getDepositDaysLeft(order, now);
  if (left != null && getDepositDueMillis(order) < now) return "overdue";
  return "window_open";
}

// Single source of truth for the status lifecycle (see architecture-plan.md)
export const ORDER_STATUSES = [
  "request_received",
  "under_review",
  "est_price_issued",
  "approved",
  "in_production",
  "ready_for_delivery",
  "completed",
];

export const TERMINAL_STATUSES = ["rejected", "cancelled"];

// Order types. "catalog" = built from the showroom (50% deposit).
// "pure_custom" = a from-scratch commission for a company, priced by MDP
// after review (30% deposit). depositRate is stored on the order when it is
// created so the rule never changes retroactively.
export const DEPOSIT_RATE_STANDARD = 0.5;
export const DEPOSIT_RATE_COMPANY = 0.3;

// Payment schedule (confirmed in Interviews 1 and 2):
//   residential  50% downpayment, 40% progress billing, 10% at turnover
//   company      30% downpayment, 60% progress billing (one billing or two),
//                10% at turnover
// The 10% is the last cut of the contract, collected once turnover is done.
export const FINAL_PAYMENT_RATE = 0.1;

// Statuses from which MDP can bill the final 10%: the work is installed and
// being turned over, or the order is complete.
export const TURNOVER_STATUSES = ["ready_for_delivery", "completed"];

export function isPureCustom(order) {
  return order?.orderType === "pure_custom";
}

export function getDepositRate(order) {
  const r = Number(order?.depositRate);
  return r > 0 && r < 1 ? r : DEPOSIT_RATE_STANDARD;
}

export function depositPercentLabel(order) {
  return Math.round(getDepositRate(order) * 100) + "%";
}

// Once an order reaches one of these, materials have been bought and/or
// fabrication has started. Change requests from here on can only touch
// finish/hardware-level details — never dimensions — and are always an
// ADDITIONAL cost (new materials + labor), never a reduction.
export const POST_PRODUCTION_STATUSES = ["in_production", "ready_for_delivery", "completed"];

// Change-request sub-states — independent of the order's main status.
export const CHANGE_REQUEST_STATUSES = ["pending", "quoted", "accepted", "rejected", "declined_by_admin"];

export const CHANGE_REQUEST_LABELS = {
  pending: "Pending Review",
  quoted: "Awaiting Your Response",
  accepted: "Accepted",
  rejected: "Declined by You",
  declined_by_admin: "Declined by MDP",
};

export const STATUS_LABELS = {
  request_received: "Request Received",
  under_review: "Under Review",
  est_price_issued: "Est. Price Issued",
  approved: "Approved",
  in_production: "In Production",
  ready_for_delivery: "Ready for Delivery",
  completed: "Completed",
  rejected: "Rejected",
  cancelled: "Cancelled",
};

export async function createOrder(orderData) {
  const ref = await addDoc(collection(db, COLLECTION), {
    ...orderData,
    orderCode: null, // assigned later by admin, per plan
    status: "request_received",
    finalPrice: null, // admin-confirmed price — null until Est. Price Issued
    finalDepositAmount: null,
    adjustmentsTotal: 0, // sum of every ACCEPTED change-request delta (+/-)
    changeRequests: [],
    adminNotes: [],
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  return ref.id;
}

// What the customer actually owes/has been charged, all-in: the originally
// issued price plus every accepted change-request adjustment. Both
// OrderTicket.jsx and OrderDetail.jsx should read price off this helper
// (not order.finalPrice alone) so they can never drift apart.
export function getPayableTotal(order) {
  const base = order.finalPrice ?? order.provisionalTotal ?? 0;
  return base + (order.adjustmentsTotal || 0);
}

function localId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

export async function getOrderById(orderId) {
  const ref = doc(db, COLLECTION, orderId);
  const snap = await getDoc(ref);
  if (!snap.exists()) return null;
  return { id: snap.id, ...snap.data() };
}

export async function getOrdersByCustomer(customerId) {
  const q = query(
    collection(db, COLLECTION),
    where("customerId", "==", customerId),
    orderBy("createdAt", "desc")
  );
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

export async function getAllOrders() {
  const q = query(collection(db, COLLECTION), orderBy("createdAt", "desc"));
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

// --- Admin actions ---

export async function updateOrderStatus(orderId, newStatus) {
  const ref = doc(db, COLLECTION, orderId);
  await updateDoc(ref, {
    status: newStatus,
    statusBeforeChange: null, // a manual status change ends any pending "go back to" from a change request
    updatedAt: serverTimestamp(),
  });

  // Let the customer know their order moved. Posted into the same thread as
  // Messages. Deliberately NOT awaited: the status change already succeeded,
  // and waiting on this second write is what made the button hang whenever
  // the connection was slow.
  sendSystemMessage(
    orderId,
    `Your order status changed to "${STATUS_LABELS[newStatus] || newStatus}".`
  ).catch((err) => {
    console.error("Failed to post status-change system message:", err);
  });
}

// Admin manually assigns the human-readable code (e.g. "CR-701")
// once the deposit is approved. Free text, no auto-counter (per plan).
export async function assignOrderCode(orderId, orderCode) {
  const ref = doc(db, COLLECTION, orderId);
  await updateDoc(ref, {
    orderCode,
    updatedAt: serverTimestamp(),
  });
}

// Admin reviews the system's provisional total and issues the real,
// binding price the customer will actually pay a deposit against.
// This is what turns an auto-calculated estimate into a confirmed quote,
// and is the action behind the "Est. Price Issued" status.
//
// If the customer has ALREADY submitted their deposit (e.g. the order was
// bounced back to Under Review by a change request and the price is being
// re-issued), the status must not slide back to "Est. Price Issued" — the
// payment is in, so the order goes to (or stays at) Approved or later.
export async function issueFinalPrice(orderId, finalPrice) {
  const ref = doc(db, COLLECTION, orderId);
  const snap = await getDoc(ref);
  const current = snap.exists() ? snap.data() : {};
  const alreadyPaid = Boolean(current.paymentReference);
  const finalDepositAmount = Math.round(finalPrice * getDepositRate(current));

  let nextStatus = "est_price_issued";
  if (alreadyPaid) {
    nextStatus = ["request_received", "under_review", "est_price_issued"].includes(current.status)
      ? "approved"
      : current.status;
  }

  // A different price before any payment means the customer must agree to
  // the NEW price: clear the acceptance so the two-week clock restarts when
  // they accept it.
  const priceChanged = !alreadyPaid && current.finalPrice != null && current.finalPrice !== finalPrice;

  await updateDoc(ref, {
    finalPrice,
    finalDepositAmount,
    status: nextStatus,
    statusBeforeChange: null,
    ...(priceChanged ? { quoteAcceptedAt: null, depositDueDate: null } : {}),
    updatedAt: serverTimestamp(),
  });

  try {
    await sendSystemMessage(
      orderId,
      alreadyPaid
        ? `Your price has been updated to ₱${finalPrice.toLocaleString()}. Your deposit has already been received, so there's nothing more to pay right now.`
        : `Your final price has been issued: ₱${finalPrice.toLocaleString()} (deposit due: ₱${finalDepositAmount.toLocaleString()}). Please accept the quotation on your order page; you then have ${DEPOSIT_WINDOW_DAYS} days to pay the deposit.`
    );
  } catch (err) {
    console.error("Failed to post price-issued system message:", err);
  }
}

// --- Customer actions ---

// Customer submits proof of a bank deposit: the method and
// reference number. The screenshots themselves are saved as a receipt
// (lib/receipts.js, orders/{id}/receipts) just before this is called.
// This is evidence for the admin to check against their actual bank
// bank account, NOT an automatic confirmation — depositConfirmed stays false
// until an admin verifies it in OrderDetail.jsx. Only valid once admin has
// issued a final price (status: est_price_issued), since the customer is
// paying against the CONFIRMED price, not the system's provisional guess.
export async function customerSubmitPayment(
  orderId,
  { paymentMethod = DEFAULT_PAYMENT_METHOD, paymentReference, paymentProofImage = "" }
) {
  const ref = doc(db, COLLECTION, orderId);
  const snap = await getDoc(ref);
  if (snap.exists() && !snap.data().quoteAcceptedAt && !snap.data().paymentReference) {
    throw new Error("Please accept the quotation first, then pay the deposit.");
  }
  await updateDoc(ref, {
    status: "approved",
    statusBeforeChange: null,
    depositConfirmed: false, // customer submitted proof — admin still needs to verify
    paymentMethod,
    paymentReference,
    paymentProofImage, // legacy single-image field; new payments leave it empty
    paymentSubmittedAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
}

// Customer agrees to the final quotation. This starts the two-week window to
// pay the downpayment. It does not move the order status — "Approved" still
// means the deposit has been submitted. Only valid once MDP has issued a
// final price, and only once.
export async function customerAcceptQuote(orderId) {
  const ref = doc(db, COLLECTION, orderId);
  const snap = await getDoc(ref);
  if (!snap.exists()) throw new Error("Order not found.");
  const current = snap.data();
  if (!current.finalPrice) {
    throw new Error("MDP hasn't issued the final price yet.");
  }
  if (current.quoteAcceptedAt) return; // already accepted — keep the original clock
  const due = Timestamp.fromMillis(Date.now() + DEPOSIT_WINDOW_DAYS * DAY_MS);
  await updateDoc(ref, {
    quoteAcceptedAt: serverTimestamp(),
    depositDueDate: due,
    updatedAt: serverTimestamp(),
  });

  try {
    await sendSystemMessage(
      orderId,
      `You accepted the quotation. Your downpayment is due within ${DEPOSIT_WINDOW_DAYS} days, by ${due
        .toDate()
        .toLocaleDateString("en-PH", { year: "numeric", month: "long", day: "numeric" })}. We only buy materials and start work once it is paid.`
    );
  } catch (err) {
    console.error("Failed to post quote-accepted system message:", err);
  }
}

// Admin gives the client more time. The new deadline counts from the later
// of "now" and the current deadline, so an extension never shortens it.
export async function adminExtendDeposit(orderId, days = DEPOSIT_EXTENSION_DAYS) {
  const ref = doc(db, COLLECTION, orderId);
  const snap = await getDoc(ref);
  if (!snap.exists()) throw new Error("Order not found.");
  const current = snap.data();
  if (current.paymentReference) {
    throw new Error("The customer has already submitted payment for this order.");
  }
  const base = Math.max(Date.now(), getDepositDueMillis(current) || 0);
  const due = Timestamp.fromMillis(base + days * DAY_MS);
  await updateDoc(ref, {
    // If MDP extends before the customer ever accepted, start the window too.
    quoteAcceptedAt: current.quoteAcceptedAt || serverTimestamp(),
    depositDueDate: due,
    depositExtensions: (current.depositExtensions || 0) + 1,
    updatedAt: serverTimestamp(),
  });

  try {
    await sendSystemMessage(
      orderId,
      `We've extended your downpayment deadline to ${due
        .toDate()
        .toLocaleDateString("en-PH", { year: "numeric", month: "long", day: "numeric" })}.`
    );
  } catch (err) {
    console.error("Failed to post deposit-extended system message:", err);
  }
}

// Admin closes an order whose deposit window lapsed. Only before any payment
// has been submitted — nothing to refund, no materials bought.
export async function adminCloseUnpaidOrder(orderId) {
  const ref = doc(db, COLLECTION, orderId);
  const snap = await getDoc(ref);
  if (!snap.exists()) throw new Error("Order not found.");
  const current = snap.data();
  if (current.paymentReference || current.depositConfirmed) {
    throw new Error("A payment has already been submitted for this order, so it can't be closed this way.");
  }
  await updateDoc(ref, {
    status: "cancelled",
    cancelReason: "deposit_not_paid",
    statusBeforeChange: null,
    updatedAt: serverTimestamp(),
  });

  try {
    await sendSystemMessage(
      orderId,
      "This order was closed because the downpayment wasn't received within the agreed time. You're welcome to send a new request or message us if you'd like to reopen it."
    );
  } catch (err) {
    console.error("Failed to post order-closed system message:", err);
  }
}

// ---------- Progress billings and the final 10% ----------
// order.billings is a small array only MDP can write (Firestore rules stop a
// customer's update from touching it):
//   { id, kind: "progress" | "final", label, amount, note, issuedAt (ISO),
//     paidAt (ISO | null), paidBy }
// A customer pays by saving a "billing_payment" receipt that carries the
// billing's id (lib/receipts.js). MDP then marks the billing paid, which also
// locks those receipts.

// How the contract splits, from the CURRENT payable total (a raise or deduction
// from an accepted change shows up in the progress pool, never in the 10%).
export function getBillingPlan(order) {
  const base = order.finalPrice ?? order.provisionalTotal ?? 0;
  const payable = base + (order.adjustmentsTotal || 0);
  const depositRate = getDepositRate(order);
  const rawDeposit = order.finalDepositAmount ?? order.depositAmount ?? 0;
  const deposit =
    (order.adjustmentsTotal || 0) < 0
      ? Math.min(rawDeposit, Math.round(payable * depositRate))
      : rawDeposit;
  const finalAmount = Math.round(payable * FINAL_PAYMENT_RATE);
  const progressPool = Math.max(0, payable - deposit - finalAmount);
  const billings = order.billings || [];
  const progressIssued = billings
    .filter((b) => b.kind === "progress")
    .reduce((n, b) => n + (Number(b.amount) || 0), 0);
  const progressPaid = billings
    .filter((b) => b.kind === "progress" && b.paidAt)
    .reduce((n, b) => n + (Number(b.amount) || 0), 0);
  const finalBilling = billings.find((b) => b.kind === "final") || null;
  return {
    payable,
    deposit,
    depositPercent: Math.round(depositRate * 100),
    progressPool,
    progressPercent: Math.round((1 - depositRate - FINAL_PAYMENT_RATE) * 100),
    progressIssued,
    progressPaid,
    progressToIssue: Math.max(0, progressPool - progressIssued),
    finalAmount,
    finalBilling,
    finalPaid: Boolean(finalBilling?.paidAt),
    finalPercent: Math.round(FINAL_PAYMENT_RATE * 100),
  };
}

// Shown state of one billing, given the receipts on the order.
export function getBillingState(billing, receipts = []) {
  if (billing.paidAt) return "paid";
  const sent = receipts.some((r) => r.kind === "billing_payment" && r.billingId === billing.id);
  return sent ? "submitted" : "issued";
}

export const BILLING_STATE_LABELS = {
  issued: "Awaiting payment",
  submitted: "Payment sent, being verified",
  paid: "Paid",
};

function peso(n) {
  return "\u20b1" + Math.round(n).toLocaleString();
}

// MDP issues a bill. Progress billings can't exceed the progress pool; the
// final billing (one per order) is only available at turnover.
export async function issueBilling(orderId, { kind, label, amount, note = "" }) {
  const ref = doc(db, COLLECTION, orderId);
  const snap = await getDoc(ref);
  if (!snap.exists()) throw new Error("Order not found.");
  const order = { id: snap.id, ...snap.data() };
  if (!order.depositConfirmed) {
    throw new Error("Verify the downpayment first. Billing starts after it.");
  }
  if (order.status === "cancelled" || order.status === "rejected") {
    throw new Error("This order is closed.");
  }
  const amt = Math.round(Number(amount) || 0);
  if (amt <= 0) throw new Error("Enter the amount to bill.");
  const plan = getBillingPlan(order);

  if (kind === "progress") {
    if (amt > plan.progressToIssue) {
      throw new Error(
        `Only ${peso(plan.progressToIssue)} of the ${plan.progressPercent}% progress billing is left to bill.`
      );
    }
  } else if (kind === "final") {
    if (plan.finalBilling) throw new Error("The final billing was already issued.");
    if (!TURNOVER_STATUSES.includes(order.status)) {
      throw new Error("The final 10% is billed at turnover. Move the order to Ready for Delivery first.");
    }
  } else {
    throw new Error("Unknown billing type.");
  }

  const billing = {
    id: localId(),
    kind,
    label: (label || "").trim() || (kind === "final" ? "Final payment (10% at turnover)" : "Progress billing"),
    amount: amt,
    note: note.trim(),
    issuedAt: new Date().toISOString(),
    paidAt: null,
    paidBy: null,
  };
  await updateDoc(ref, {
    billings: [...(order.billings || []), billing],
    updatedAt: serverTimestamp(),
  });

  try {
    await sendSystemMessage(
      orderId,
      kind === "final"
        ? `Your order is at turnover. The final payment of ${peso(amt)} (the last ${plan.finalPercent}% of the contract) is now due. Pay it from the Billing card on your order page.`
        : `A progress billing of ${peso(amt)} (${billing.label}) was issued. Pay it from the Billing card on your order page.`
    );
  } catch (err) {
    console.error("Failed to post billing system message:", err);
  }
  return billing;
}

// MDP verifies (or un-verifies) the payment for one billing.
export async function setBillingPaid(orderId, billingId, paid, adminUid) {
  const ref = doc(db, COLLECTION, orderId);
  const snap = await getDoc(ref);
  if (!snap.exists()) throw new Error("Order not found.");
  const billings = (snap.data().billings || []).map((b) =>
    b.id === billingId
      ? { ...b, paidAt: paid ? new Date().toISOString() : null, paidBy: paid ? adminUid : null }
      : b
  );
  await updateDoc(ref, { billings, updatedAt: serverTimestamp() });
  const b = billings.find((x) => x.id === billingId);
  if (paid && b) {
    try {
      await sendSystemMessage(
        orderId,
        b.kind === "final"
          ? `\u2713 Your final payment of ${peso(b.amount)} was received and verified. Thank you!`
          : `\u2713 Your payment of ${peso(b.amount)} (${b.label}) was received and verified.`
      );
    } catch (err) {
      console.error("Failed to post billing-paid system message:", err);
    }
  }
}

// Remove a bill that was issued by mistake. Only before any payment is
// attached to it.
export async function deleteBilling(orderId, billingId) {
  const ref = doc(db, COLLECTION, orderId);
  const snap = await getDoc(ref);
  if (!snap.exists()) throw new Error("Order not found.");
  const target = (snap.data().billings || []).find((b) => b.id === billingId);
  if (target?.paidAt) throw new Error("This billing is already paid.");
  await updateDoc(ref, {
    billings: (snap.data().billings || []).filter((b) => b.id !== billingId),
    updatedAt: serverTimestamp(),
  });
}

// Only cancellable before a deposit is submitted — once approved (or
// further along), production may already be underway, so self-cancel is
// blocked here as the source of truth (not just hidden in the UI).
const CANCELLABLE_STATUSES = ["request_received", "under_review", "est_price_issued"];

export async function cancelOrder(orderId) {
  const ref = doc(db, COLLECTION, orderId);
  const snap = await getDoc(ref);
  if (!snap.exists()) {
    throw new Error("Order not found.");
  }
  const current = snap.data();
  if (!CANCELLABLE_STATUSES.includes(current.status)) {
    throw new Error("This order can no longer be cancelled — it's already past the review stage.");
  }
  await updateDoc(ref, {
    status: "cancelled",
    updatedAt: serverTimestamp(),
  });
}

// --- Admin deposit verification ---

export async function confirmDeposit(orderId, adminUid) {
  const ref = doc(db, COLLECTION, orderId);
  await updateDoc(ref, {
    depositConfirmed: true,
    depositConfirmedBy: adminUid,
    depositConfirmedAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });

  try {
    await sendSystemMessage(
      orderId,
      "✓ Your deposit payment has been verified. We'll begin production soon."
    );
  } catch (err) {
    console.error("Failed to post deposit-verified system message:", err);
  }
}

export async function unconfirmDeposit(orderId) {
  const ref = doc(db, COLLECTION, orderId);
  await updateDoc(ref, {
    depositConfirmed: false,
    depositConfirmedBy: null,
    depositConfirmedAt: null,
    updatedAt: serverTimestamp(),
  });
}

// ---------- Site visit ----------
//
// Mirrors the real-world process (see Business Profile): after an inquiry,
// the owners visit the client's site to verify actual measurements and
// conditions before finalizing a quotation. The customer's preferred date
// (contact.preferredVisitDate, collected at quote-request time) was already
// being stored but never surfaced back to them — this closes that loop by
// letting admin confirm an actual date, visible on both sides.
export async function confirmSiteVisit(orderId, confirmedDate) {
  const ref = doc(db, COLLECTION, orderId);
  await updateDoc(ref, {
    confirmedVisitDate: confirmedDate,
    updatedAt: serverTimestamp(),
  });

  try {
    await sendSystemMessage(
      orderId,
      `A site visit has been scheduled for ${confirmedDate}. We'll see you then to confirm measurements and finalize your quotation.`
    );
  } catch (err) {
    console.error("Failed to post site-visit system message:", err);
  }
}

export async function clearSiteVisit(orderId) {
  const ref = doc(db, COLLECTION, orderId);
  await updateDoc(ref, {
    confirmedVisitDate: null,
    updatedAt: serverTimestamp(),
  });
}

// ---------- Delivery / installation scheduling ----------
//
// Once an order is built and ready, the business schedules a delivery and
// installation date at the client's site. Nothing in the original design
// tracked this — orders would sit at "Ready for Delivery" with no visible
// next step for the customer. This gives admin a date field that, once set,
// shows on the customer's order ticket.
export async function scheduleDelivery(orderId, scheduledDate) {
  const ref = doc(db, COLLECTION, orderId);
  await updateDoc(ref, {
    scheduledDeliveryDate: scheduledDate,
    updatedAt: serverTimestamp(),
  });

  try {
    await sendSystemMessage(
      orderId,
      `Your delivery and installation has been scheduled for ${scheduledDate}. We'll see you then!`
    );
  } catch (err) {
    console.error("Failed to post delivery-scheduled system message:", err);
  }
}

export async function clearScheduledDelivery(orderId) {
  const ref = doc(db, COLLECTION, orderId);
  await updateDoc(ref, {
    scheduledDeliveryDate: null,
    updatedAt: serverTimestamp(),
  });
}

// Internal staff-only log — separate from the customer-facing chat thread
// (messages.js / ChatThread.jsx). Used for admin-to-admin context on an order.
export async function addAdminNote(orderId, authorId, note) {
  const ref = doc(db, COLLECTION, orderId);
  await updateDoc(ref, {
    adminNotes: arrayUnion({
      authorId,
      note,
      type: "admin_note",
      createdAt: new Date().toISOString(), // arrayUnion can't use serverTimestamp()
    }),
    updatedAt: serverTimestamp(),
  });
}

// ---------- Change-request tracker ----------
//
// A change request is its own small state machine (pending -> quoted ->
// accepted/rejected), separate from the order's main status field. This is
// deliberately NOT a full re-quote: resolving a request never overwrites
// finalPrice. Instead it adds a signed delta (adjustmentAmount, + or -) to
// order.adjustmentsTotal, so the customer only ever owes/is refunded the
// DIFFERENCE — never pays for the whole order again — and the full history
// of what changed and why stays on the order for both sides to see.
//
// Submitting a request while the order is still pre-production (materials
// not yet bought) bounces the main order status back to "under_review", so
// the admin re-evaluates it the same way they would a fresh quote. The
// status it came from is remembered in `statusBeforeChange`, and once the
// LAST open request is resolved (accepted, declined by either side) the
// order returns to that status — so it doesn't stay stuck on "Under
// Review" after the change is settled. Once the order is past that point
// (in_production or later), the status does NOT bounce back — production
// is already committed — but the request is still tracked and quoted the
// same way, and can ONLY be a finish/hardware-level change, never a
// dimension change (enforced below).

// After a request is resolved: if nothing is left open and the order was
// parked on Under Review by a change request, put it back.
function statusRestoreUpdate(order, changeRequests) {
  const stillOpen = changeRequests.some((cr) => cr.status === "pending" || cr.status === "quoted");
  if (stillOpen) return null;
  if (order.status !== "under_review" || !order.statusBeforeChange) return null;
  return { status: order.statusBeforeChange, statusBeforeChange: null };
}

async function postRestoreMessage(orderId, restore) {
  if (!restore) return;
  try {
    await sendSystemMessage(
      orderId,
      `Your order status returned to "${STATUS_LABELS[restore.status] || restore.status}".`
    );
  } catch (err) {
    console.error("Failed to post status-restored system message:", err);
  }
}

// `notice` is the customer's letter of notice (required by the UI): the
// chat message it was sent in and that message's attachment metadata, so
// the request can link to the files (the files themselves live in the chat).
export async function addChangeRequest(orderId, customerId, note, { notice = null } = {}) {
  const order = await getOrderById(orderId);
  if (!order) throw new Error("Order not found.");
  if (TERMINAL_STATUSES.includes(order.status)) {
    throw new Error("This order is no longer active.");
  }

  const isPostProduction = POST_PRODUCTION_STATUSES.includes(order.status);
  const changeRequest = {
    id: localId(),
    note,
    type: isPostProduction ? "post_production" : "pre_production",
    status: "pending",
    adjustmentAmount: null,
    adminResponse: "",
    proof: null,
    notice: notice
      ? {
          messageId: notice.messageId,
          attachments: notice.attachments,
          sentAt: new Date().toISOString(),
        }
      : null,
    files: [], // extra files either side adds later (see attachChangeRequestFiles)
    createdAt: new Date().toISOString(),
    resolvedAt: null,
  };

  const ref = doc(db, COLLECTION, orderId);
  const updates = {
    changeRequests: arrayUnion(changeRequest),
    // Still logged into the existing adminNotes feed too, so it shows up
    // in the chronological note history admin already relies on — the
    // changeRequests array above is the source of truth for its STATE.
    adminNotes: arrayUnion({
      authorId: customerId,
      note,
      type: "change_request",
      createdAt: new Date().toISOString(),
    }),
    updatedAt: serverTimestamp(),
  };

  if (!isPostProduction && order.status !== "under_review" && order.status !== "request_received") {
    updates.status = "under_review";
    updates.statusBeforeChange = order.status; // remembered so it can go back
  }

  await updateDoc(ref, updates);

  try {
    await sendSystemMessage(
      orderId,
      isPostProduction
        ? "A change request was submitted. Since production has already started, only finish/hardware changes are possible, and this will be quoted as an additional cost for materials and labor."
        : "A change request was submitted and your order has been moved back to Under Review while we re-evaluate it."
    );
  } catch (err) {
    console.error("Failed to post change-request system message:", err);
  }

  return changeRequest.id;
}

// Admin recomputes and issues a priced response to a pending request.
// adjustmentAmount is signed: positive = additional cost, negative = a
// credit/reduction. (Post-production requests should only ever be quoted
// with a positive amount — the UI enforces this, matching the business
// rule that built/bought work is never "refunded" by requesting a change.)
export async function quoteChangeRequest(orderId, changeRequestId, { adjustmentAmount, adminResponse }) {
  const order = await getOrderById(orderId);
  if (!order) throw new Error("Order not found.");

  const changeRequests = (order.changeRequests || []).map((cr) =>
    cr.id === changeRequestId
      ? { ...cr, status: "quoted", adjustmentAmount, adminResponse: adminResponse || "" }
      : cr
  );

  const ref = doc(db, COLLECTION, orderId);
  await updateDoc(ref, { changeRequests, updatedAt: serverTimestamp() });

  try {
    const sign = adjustmentAmount > 0 ? "+" : adjustmentAmount < 0 ? "−" : "";
    await sendSystemMessage(
      orderId,
      `We've reviewed your requested change: ${sign}₱${Math.abs(adjustmentAmount).toLocaleString()} to your total. Please review and accept or decline it in your order.`
    );
  } catch (err) {
    console.error("Failed to post change-quoted system message:", err);
  }
}

// Customer accepts a quoted change — the only path that actually moves
// money: adjustmentAmount is added to the order's running adjustmentsTotal
// exactly once, here.
export async function acceptChangeRequest(orderId, changeRequestId) {
  const order = await getOrderById(orderId);
  if (!order) throw new Error("Order not found.");

  const target = (order.changeRequests || []).find((cr) => cr.id === changeRequestId);
  if (!target || target.status !== "quoted") {
    throw new Error("This change request isn't ready to accept.");
  }

  const changeRequests = order.changeRequests.map((cr) =>
    cr.id === changeRequestId
      ? { ...cr, status: "accepted", resolvedAt: new Date().toISOString() }
      : cr
  );
  const newAdjustmentsTotal = (order.adjustmentsTotal || 0) + target.adjustmentAmount;
  const restore = statusRestoreUpdate(order, changeRequests);

  const ref = doc(db, COLLECTION, orderId);
  await updateDoc(ref, {
    changeRequests,
    adjustmentsTotal: newAdjustmentsTotal,
    ...(restore || {}),
    updatedAt: serverTimestamp(),
  });

  try {
    await sendSystemMessage(orderId, "You accepted the requested change. Your order total has been updated.");
  } catch (err) {
    console.error("Failed to post change-accepted system message:", err);
  }
  await postRestoreMessage(orderId, restore);
}

// Customer rejects a quoted change — order simply continues as the last
// agreed configuration; nothing about pricing changes. This is the
// customer's "just go with the current project" escape hatch.
export async function rejectChangeRequest(orderId, changeRequestId) {
  const order = await getOrderById(orderId);
  if (!order) throw new Error("Order not found.");

  const changeRequests = (order.changeRequests || []).map((cr) =>
    cr.id === changeRequestId
      ? { ...cr, status: "rejected", resolvedAt: new Date().toISOString() }
      : cr
  );
  const restore = statusRestoreUpdate(order, changeRequests);

  const ref = doc(db, COLLECTION, orderId);
  await updateDoc(ref, { changeRequests, ...(restore || {}), updatedAt: serverTimestamp() });

  try {
    await sendSystemMessage(orderId, "You declined the proposed change. Your order continues as currently configured.");
  } catch (err) {
    console.error("Failed to post change-rejected system message:", err);
  }
  await postRestoreMessage(orderId, restore);
}

// Admin declines a request outright (e.g. a post-production DIMENSION
// change, which is never allowed) without issuing a priced quote first.
export async function adminDeclineChangeRequest(orderId, changeRequestId, adminResponse) {
  const order = await getOrderById(orderId);
  if (!order) throw new Error("Order not found.");

  const changeRequests = (order.changeRequests || []).map((cr) =>
    cr.id === changeRequestId
      ? { ...cr, status: "declined_by_admin", adminResponse: adminResponse || "", resolvedAt: new Date().toISOString() }
      : cr
  );
  const restore = statusRestoreUpdate(order, changeRequests);

  const ref = doc(db, COLLECTION, orderId);
  await updateDoc(ref, { changeRequests, ...(restore || {}), updatedAt: serverTimestamp() });

  try {
    await sendSystemMessage(orderId, "We're unable to accommodate the requested change. See details in your order.");
  } catch (err) {
    console.error("Failed to post change-declined system message:", err);
  }
  await postRestoreMessage(orderId, restore);
}

// Legacy: admin proof attached to a change request. New proof goes in the
// order's Receipts (lib/receipts.js); this is kept so nothing that still
// imports it breaks, and old proofs stored this way still display.
export async function attachChangeRequestProof(orderId, changeRequestId, { referenceNumber, screenshotBase64, note }) {
  const order = await getOrderById(orderId);
  if (!order) throw new Error("Order not found.");

  const changeRequests = (order.changeRequests || []).map((cr) =>
    cr.id === changeRequestId
      ? {
          ...cr,
          proof: {
            referenceNumber: referenceNumber || "",
            screenshotBase64: screenshotBase64 || "",
            note: note || "",
            submittedAt: new Date().toISOString(),
          },
        }
      : cr
  );

  const ref = doc(db, COLLECTION, orderId);
  await updateDoc(ref, { changeRequests, updatedAt: serverTimestamp() });
}

// Either side adds files to an existing change request. The files
// themselves were already sent as a chat message (lib/messages.js
// sendMessage); this links that message to the request so the files show
// on the request itself too.
export async function attachChangeRequestFiles(orderId, changeRequestId, { messageId, attachments, by, byName }) {
  const order = await getOrderById(orderId);
  if (!order) throw new Error("Order not found.");

  const changeRequests = (order.changeRequests || []).map((cr) =>
    cr.id === changeRequestId
      ? {
          ...cr,
          files: [
            ...(cr.files || []),
            { messageId, attachments, by, byName: byName || "", uploadedAt: new Date().toISOString() },
          ],
        }
      : cr
  );

  const ref = doc(db, COLLECTION, orderId);
  await updateDoc(ref, { changeRequests, updatedAt: serverTimestamp() });
}