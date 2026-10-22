import { getPaymentSummary } from "../lib/refunds";
import { depositPercentLabel, isPureCustom } from "../lib/orders";

const peso = (n) => "₱" + Math.abs(n).toLocaleString();

// Admin-only overview of the money on an order. Reads the same numbers the
// customer sees (getPayableTotal logic) but also shows what is still owed
// each way, and lists anything the admin still has to do — most importantly
// after a change request is accepted or an order is cancelled/rejected.
export default function PaymentSummary({ order, receipts = [] }) {
  const s = getPaymentSummary(order, receipts);

  return (
    <>
      {s.actions.length > 0 && (
        <div className="action-needed-banner">
          <strong>⚠ Action needed</strong>
          <ul>
            {s.actions.map((a, i) => (
              <li key={i}>{a}</li>
            ))}
          </ul>
        </div>
      )}

      <div className="ticket-card">
        <h4>Payment Summary</h4>

        <div className="ticket-config-row">
          <span>{order.finalPrice ? "Final price" : "System estimate"}</span>
          <span>
            {isPureCustom(order) && !order.finalPrice ? "Not quoted yet" : peso(s.base)}
          </span>
        </div>

        {s.acceptedChanges.map((cr) => (
          <div className="ticket-config-row summary-change-row" key={cr.id}>
            <span>
              ↳ Accepted change
              {cr.note ? `: ${cr.note.slice(0, 40)}${cr.note.length > 40 ? "…" : ""}` : ""}
            </span>
            <span className={cr.adjustmentAmount > 0 ? "adjustment-positive" : "adjustment-negative"}>
              {cr.adjustmentAmount > 0 ? "+" : "−"}
              {peso(cr.adjustmentAmount)}
            </span>
          </div>
        ))}

        <div className="ticket-config-row ticket-config-total">
          <span>Current payable total</span>
          <span>{peso(s.payable)}</span>
        </div>

        {s.adjustedDeposit !== s.deposit && (
          <div className="ticket-config-row">
            <span>Deposit now required ({depositPercentLabel(order)} of new total)</span>
            <span>{peso(s.adjustedDeposit)}</span>
          </div>
        )}

        <div className="ticket-config-row">
          <span>
            {order.depositConfirmed
              ? "Deposit received (verified)"
              : `Deposit (not yet verified) — ${peso(s.adjustedDeposit)}`}
          </span>
          <span>{order.depositConfirmed ? peso(s.depositPaid) : peso(s.adjustedDeposit)}</span>
        </div>

        {!s.terminal && (
          <div className="ticket-config-row ticket-config-total">
            <span>Remaining balance</span>
            <span>{peso(s.balance)}</span>
          </div>
        )}

        {s.refunded > 0 && (
          <div className="ticket-config-row">
            <span>Refunded to customer</span>
            <span>{peso(s.refunded)}</span>
          </div>
        )}
        {s.refundDue > 0 && (
          <div className="ticket-config-row summary-refund-due">
            <span>Refund still to send</span>
            <span>{peso(s.refundDue)}</span>
          </div>
        )}
      </div>
    </>
  );
}