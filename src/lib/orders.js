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
} from "firebase/firestore";
import { sendSystemMessage } from "./messages";

const COLLECTION = "orders";

// Fallback only — the live, admin-adjustable rate lives in Firestore
// (settings/general.hardwareInstallationRate, see lib/settings.js).
// Pages fetch the live value via getSettings() and fall back to this
// constant if that doc doesn't exist yet or fails to load.
export const HARDWARE_INSTALLATION_RATE = 0.10;

// Where to send manual payments. Plain constants for now — move to a
// Settings doc in Firestore later if this needs to be admin-editable.
export const PAYMENT_METHODS = {
  gcash: {
    label: "GCash",
    name: "MDP Modular Systems",
    number: "0917-000-0000", // TODO: replace with real GCash number
  },
  bank: {
    label: "Bank Transfer (BDO)",
    name: "MDP Modular Systems",
    accountNumber: "0000-0000-0000", // TODO: replace with real account number
  },
};

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
    updatedAt: serverTimestamp(),
  });

  // Let the customer know their order moved, without them needing to
  // keep checking back. Posted into the same thread as Messages.
  try {
    await sendSystemMessage(
      orderId,
      `Your order status changed to "${STATUS_LABELS[newStatus] || newStatus}".`
    );
  } catch (err) {
    // Status change itself already succeeded above — don't fail the whole
    // action just because the notification message couldn't be posted.
    console.error("Failed to post status-change system message:", err);
  }
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
export async function issueFinalPrice(orderId, finalPrice) {
  const ref = doc(db, COLLECTION, orderId);
  const finalDepositAmount = Math.round(finalPrice * 0.5);
  await updateDoc(ref, {
    finalPrice,
    finalDepositAmount,
    status: "est_price_issued",
    updatedAt: serverTimestamp(),
  });

  try {
    await sendSystemMessage(
      orderId,
      `Your final price has been issued: ₱${finalPrice.toLocaleString()} (deposit due: ₱${finalDepositAmount.toLocaleString()}). You can now approve and pay the deposit from your order page.`
    );
  } catch (err) {
    console.error("Failed to post price-issued system message:", err);
  }
}

// --- Customer actions ---

// Customer submits proof of a manual GCash/bank transfer: the reference
// number from their receipt, plus a compressed screenshot (base64 data URL,
// resized/re-encoded client-side in OrderTicket.jsx to stay well under
// Firestore's 1 MiB document limit). This is evidence for the admin to
// check against their actual GCash/bank account, NOT an automatic
// confirmation — depositConfirmed stays false until an admin verifies it
// in OrderDetail.jsx. Only valid once admin has issued a final price
// (status: est_price_issued), since the customer is paying against the
// CONFIRMED price, not the system's provisional guess.
export async function customerSubmitPayment(
  orderId,
  { paymentMethod, paymentReference, paymentProofImage }
) {
  const ref = doc(db, COLLECTION, orderId);
  await updateDoc(ref, {
    status: "approved",
    depositConfirmed: false, // customer submitted proof — admin still needs to verify
    paymentMethod,
    paymentReference,
    paymentProofImage, // base64 data URL string
    paymentSubmittedAt: serverTimestamp(),
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
// the admin re-evaluates it the same way they would a fresh quote. Once the
// order is past that point (in_production or later), the status does NOT
// bounce back — production is already committed — but the request is still
// tracked and quoted the same way, and can ONLY be a finish/hardware-level
// change, never a dimension change (enforced below).

export async function addChangeRequest(orderId, customerId, note) {
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

  const ref = doc(db, COLLECTION, orderId);
  await updateDoc(ref, {
    changeRequests,
    adjustmentsTotal: newAdjustmentsTotal,
    updatedAt: serverTimestamp(),
  });

  try {
    await sendSystemMessage(orderId, "You accepted the requested change. Your order total has been updated.");
  } catch (err) {
    console.error("Failed to post change-accepted system message:", err);
  }
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

  const ref = doc(db, COLLECTION, orderId);
  await updateDoc(ref, { changeRequests, updatedAt: serverTimestamp() });

  try {
    await sendSystemMessage(orderId, "You declined the proposed change. Your order continues as currently configured.");
  } catch (err) {
    console.error("Failed to post change-rejected system message:", err);
  }
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

  const ref = doc(db, COLLECTION, orderId);
  await updateDoc(ref, { changeRequests, updatedAt: serverTimestamp() });

  try {
    await sendSystemMessage(orderId, "We're unable to accommodate the requested change. See details in your order.");
  } catch (err) {
    console.error("Failed to post change-declined system message:", err);
  }
}

// Admin attaches proof (screenshot + reference number) to an already-
// resolved request — used for deductions/refunds so the customer can see
// evidence it was actually processed, mirroring the customer's own
// payment-proof flow but in reverse (business -> customer).
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

  try {
    await sendSystemMessage(orderId, "Proof of a refund/deduction was attached to your change request. Check your order for details.");
  } catch (err) {
    console.error("Failed to post proof-attached system message:", err);
  }
}