import { TERMINAL_STATUSES, getDepositRate } from "./orders";

// Refund receipts + the admin's payment summary.
//
// Payment maths for the admin summary and the Receipts card. Two kinds of
// money going back to a customer are worked out here (the receipts that
// prove them are stored by lib/receipts.js):
//   1. Deposit overpaid after an accepted DEDUCTION lowered the total.
//   2. The verified DEPOSIT of an order that was cancelled or rejected.

// Everything the admin summary card, the refund panel and the customer's
// order page need, computed from the order in one place so they can't
// disagree.
//
// Pricing rule: when an accepted change LOWERS the total, the whole price
// moves down — the deposit (50% standard, 30% for pure custom company
// orders) is recalculated on the new total, and any deposit the customer
// already paid above that new amount is owed back (it counts toward the
// refund). Increases don't change the deposit; the extra simply lands in
// the remaining balance.
//
// The new deposit is computed here, not written to finalDepositAmount:
// Firestore rules stop a customer's own update (accepting the change) from
// touching that field.
export function getPaymentSummary(order, receipts = []) {
  const originalDeposit = order.finalDepositAmount ?? order.depositAmount ?? 0;
  const depositPaid = order.depositConfirmed ? originalDeposit : 0;
  const base = order.finalPrice ?? order.provisionalTotal ?? 0;
  const adjustments = order.adjustmentsTotal || 0;
  const payable = base + adjustments;
  const terminal = TERMINAL_STATUSES.includes(order.status);
  const depositRate = getDepositRate(order);

  // Progress billings and the final 10% that MDP has verified as paid.
  const billingsPaid = (order.billings || [])
    .filter((b) => b.paidAt)
    .reduce((n, b) => n + (Number(b.amount) || 0), 0);
  const billingsIssued = (order.billings || []).reduce((n, b) => n + (Number(b.amount) || 0), 0);

  // Deposit actually required now (only ever moves DOWN with a deduction).
  const adjustedDeposit =
    adjustments < 0
      ? Math.min(originalDeposit, Math.round(payable * depositRate))
      : originalDeposit;
  const depositOverpaid = Math.max(0, depositPaid - adjustedDeposit);

  // Refunds recorded the old way (order.refunds) plus refund receipts
  // saved as their own documents (see lib/receipts.js).
  const refunds = [
    ...(order.refunds || []),
    ...receipts.filter((r) => r.kind === "refund"),
  ];
  const refunded = refunds.reduce((sum, r) => sum + (Number(r.amount) || 0), 0);

  // What is still owed back to the customer, and why.
  let refundDue = 0;
  let refundReason = null;
  if (terminal) {
    // Everything the customer paid on an order that ended (the owners deduct
    // the cost of bought materials by hand when they send the refund).
    refundDue = Math.max(0, depositPaid + billingsPaid - refunded);
    refundReason = refundDue > 0 ? "order_ended" : null;
  } else {
    refundDue = Math.max(0, depositOverpaid - refunded);
    refundReason = refundDue > 0 ? "deduction" : null;
  }

  const acceptedChanges = (order.changeRequests || []).filter(
    (cr) => cr.status === "accepted"
  );

  // Money the customer has effectively paid toward the new total: what
  // they paid, capped at the (possibly lowered) deposit, since anything
  // above that is on its way back.
  const paidCounted = terminal ? 0 : Math.min(depositPaid, adjustedDeposit) + billingsPaid;
  const balance = terminal ? 0 : Math.max(0, payable - paidCounted);

  const actions = [];
  if (refundReason === "order_ended") {
    actions.push(
      `This order was ${order.status}. Its verified payments of ₱${(depositPaid + billingsPaid).toLocaleString()} (deposit and billings) must go back to the customer — ₱${refundDue.toLocaleString()} is still unrefunded. Send it, then attach the receipt in the Refunds card.`
    );
  }
  if (refundReason === "deduction") {
    actions.push(
      `An accepted change lowered the total to ₱${payable.toLocaleString()}, so the deposit is now ₱${adjustedDeposit.toLocaleString()} but the customer paid ₱${depositPaid.toLocaleString()}. Refund ₱${refundDue.toLocaleString()}, then attach the receipt in the Refunds card.`
    );
  }

  return {
    deposit: originalDeposit,
    adjustedDeposit,
    depositPaid,
    billingsPaid,
    billingsIssued,
    totalPaid: terminal ? 0 : depositPaid + billingsPaid,
    depositOverpaid,
    base,
    adjustments,
    payable,
    balance,
    terminal,
    refunds,
    refunded,
    refundDue,
    refundReason,
    acceptedChanges,
    actions,
  };
}