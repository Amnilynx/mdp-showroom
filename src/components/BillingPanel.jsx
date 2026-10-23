import { useState } from "react";
import {
  getBillingPlan,
  getBillingState,
  BILLING_STATE_LABELS,
  issueBilling,
  setBillingPaid,
  deleteBilling,
  isPureCustom,
  TURNOVER_STATUSES,
  PAYMENT_METHODS,
} from "../lib/orders";
import {
  addReceipt,
  confirmBillingReceipts,
  clearBillingReceiptConfirmations,
  MAX_RECEIPT_FILES,
} from "../lib/receipts";
import { sendSystemMessage } from "../lib/messages";

const peso = (n) => "₱" + Math.round(Math.abs(n)).toLocaleString();

function fmtDate(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  return isNaN(d) ? "" : d.toLocaleDateString("en-PH", { month: "short", day: "numeric", year: "numeric" });
}

// The money after the downpayment, in one card on both order pages:
//   downpayment  ->  progress billing(s)  ->  the final 10% at turnover
//
//   role="admin"     issues bills, verifies payments
//   role="customer"  pays a bill by sending a bank-deposit slip
export default function BillingPanel({ order, orderId, receipts = [], role, userId, onChange }) {
  const isAdmin = role === "admin";
  const plan = getBillingPlan(order);
  const billings = order.billings || [];
  const closed = order.status === "cancelled" || order.status === "rejected";

  const [busyId, setBusyId] = useState(null);
  const [error, setError] = useState("");

  // admin: issue form  { kind, label, amount, note } | null
  const [issuing, setIssuing] = useState(null);
  const [issueBusy, setIssueBusy] = useState(false);

  // customer: which billing is being paid + the form
  const [payingId, setPayingId] = useState(null);
  const [reference, setReference] = useState("");
  const [files, setFiles] = useState([]);
  const [payError, setPayError] = useState("");
  const [payBusy, setPayBusy] = useState(false);

  // Nothing to show until MDP has put a price on the order.
  if (!order.finalPrice) return null;

  const atTurnover = TURNOVER_STATUSES.includes(order.status);
  const sorted = billings.slice().sort((a, b) => (a.issuedAt || "").localeCompare(b.issuedAt || ""));
  const progressBillings = sorted.filter((b) => b.kind === "progress");
  const finalBilling = plan.finalBilling;
  const owedNow = sorted
    .filter((b) => !b.paidAt)
    .reduce((n, b) => n + (Number(b.amount) || 0), 0);

  function startIssue(kind) {
    setError("");
    setIssuing({
      kind,
      label: kind === "final" ? "Final payment (10% at turnover)" : `Progress billing ${progressBillings.length + 1}`,
      amount: String(kind === "final" ? plan.finalAmount : plan.progressToIssue),
      note: "",
    });
  }

  async function handleIssue(e) {
    e.preventDefault();
    setError("");
    setIssueBusy(true);
    try {
      await issueBilling(orderId, issuing);
      setIssuing(null);
      await onChange?.();
    } catch (err) {
      setError(err.message || "Couldn't issue the billing.");
    } finally {
      setIssueBusy(false);
    }
  }

  async function handleMarkPaid(b, paid) {
    setError("");
    setBusyId(b.id);
    try {
      await setBillingPaid(orderId, b.id, paid, userId);
      if (paid) await confirmBillingReceipts(orderId, receipts, b.id, userId);
      else await clearBillingReceiptConfirmations(orderId, receipts, b.id);
      await onChange?.();
    } catch (err) {
      setError(err.message || "Couldn't update the billing.");
    } finally {
      setBusyId(null);
    }
  }

  async function handleDelete(b) {
    if (!window.confirm(`Delete "${b.label}" (${peso(b.amount)})? The customer will no longer see it.`)) return;
    setError("");
    setBusyId(b.id);
    try {
      await deleteBilling(orderId, b.id);
      await onChange?.();
    } catch (err) {
      setError(err.message || "Couldn't delete the billing.");
    } finally {
      setBusyId(null);
    }
  }

  function pickFiles(e) {
    const picked = Array.from(e.target.files || []);
    e.target.value = "";
    if (!picked.length) return;
    if (picked.some((f) => !f.type.startsWith("image/"))) {
      setPayError("Please attach photos or screenshots only.");
      return;
    }
    if (files.length + picked.length > MAX_RECEIPT_FILES) {
      setPayError(`You can attach up to ${MAX_RECEIPT_FILES} photos.`);
      return;
    }
    setPayError("");
    setFiles((p) => [...p, ...picked]);
  }

  function openPay(b) {
    setPayingId(b.id);
    setReference("");
    setFiles([]);
    setPayError("");
  }

  async function handlePay(e, b) {
    e.preventDefault();
    if (!reference.trim()) {
      setPayError("Please enter the reference or deposit slip number.");
      return;
    }
    if (files.length === 0) {
      setPayError("Please attach at least one photo of your deposit slip or receipt.");
      return;
    }
    setPayBusy(true);
    setPayError("");
    try {
      await addReceipt(orderId, {
        kind: "billing_payment",
        amount: b.amount,
        referenceNumber: reference.trim(),
        note: `${b.label} · ${PAYMENT_METHODS.bank.label}`,
        files,
        createdBy: userId,
        notify: false,
        billingId: b.id,
      });
      try {
        await sendSystemMessage(
          orderId,
          `Payment proof sent for "${b.label}" (${peso(b.amount)}). We'll verify it shortly.`
        );
      } catch (err) {
        console.error("Failed to post billing-payment message:", err);
      }
      setPayingId(null);
      setFiles([]);
      setReference("");
      await onChange?.();
    } catch (err) {
      setPayError(err?.message || "Something went wrong sending your payment. Please try again.");
    } finally {
      setPayBusy(false);
    }
  }

  function row(label, sub, amount, state) {
    return (
      <div className="billing-plan-row">
        <div>
          <span className="billing-plan-label">{label}</span>
          {sub && <span className="billing-plan-sub">{sub}</span>}
        </div>
        <div className="billing-plan-right">
          <span className="billing-plan-amount">{amount}</span>
          {state}
        </div>
      </div>
    );
  }

  const depositState = order.depositConfirmed ? (
    <span className="billing-pill billing-pill-paid">Paid</span>
  ) : order.paymentReference ? (
    <span className="billing-pill billing-pill-submitted">Being verified</span>
  ) : (
    <span className="billing-pill billing-pill-issued">Awaiting payment</span>
  );

  function billingRow(b) {
    const state = getBillingState(b, receipts);
    const paying = payingId === b.id;
    const hasProof = receipts.some((r) => r.kind === "billing_payment" && r.billingId === b.id);
    return (
      <div className={"billing-item billing-item-" + state} key={b.id}>
        <div className="billing-item-head">
          <div>
            <strong>{b.label}</strong>
            <span className="billing-item-date">Issued {fmtDate(b.issuedAt)}</span>
          </div>
          <div className="billing-plan-right">
            <span className="billing-plan-amount">{peso(b.amount)}</span>
            <span className={"billing-pill billing-pill-" + state}>{BILLING_STATE_LABELS[state]}</span>
          </div>
        </div>
        {b.note && <p className="billing-item-note">{b.note}</p>}
        {state === "paid" && b.paidAt && <p className="billing-item-note">Verified {fmtDate(b.paidAt)}</p>}

        {isAdmin && !closed && (
          <div className="billing-item-actions">
            {state !== "paid" && (
              <button
                type="button"
                className="btn btn-approve btn-small"
                disabled={busyId === b.id}
                onClick={() => handleMarkPaid(b, true)}
                title={hasProof ? undefined : "No payment proof attached yet. Only mark it paid if you received the deposit."}
              >
                {busyId === b.id ? "Saving…" : hasProof ? "Verify payment" : "Mark as paid"}
              </button>
            )}
            {state === "paid" && (
              <button type="button" className="btn btn-secondary btn-small" disabled={busyId === b.id} onClick={() => handleMarkPaid(b, false)}>
                Undo verification
              </button>
            )}
            {state === "issued" && (
              <button type="button" className="btn btn-cancel btn-small" disabled={busyId === b.id} onClick={() => handleDelete(b)}>
                Delete
              </button>
            )}
            {hasProof && state !== "paid" && (
              <span className="billing-item-hint">Proof is under Receipts.</span>
            )}
          </div>
        )}

        {!isAdmin && !closed && state !== "paid" && !paying && (
          <div className="billing-item-actions">
            <button type="button" className="btn btn-approve btn-small" onClick={() => openPay(b)}>
              {state === "submitted" ? "Send proof again" : "Pay this billing"}
            </button>
          </div>
        )}

        {!isAdmin && paying && (
          <form className="billing-pay-form" onSubmit={(e) => handlePay(e, b)}>
            <p className="payment-instructions-note">
              Deposit <strong>{peso(b.amount)}</strong> to <strong>{PAYMENT_METHODS.bank.label}</strong>, account name{" "}
              <strong>{PAYMENT_METHODS.bank.name}</strong>, account number{" "}
              <strong>{PAYMENT_METHODS.bank.accountNumber}</strong>. Then send us the slip below.
            </p>
            <label>
              Reference or deposit slip number
              <input value={reference} onChange={(e) => setReference(e.target.value)} placeholder="e.g. 1234 5678 9012" />
            </label>
            <label>
              Photos of your deposit slip or receipt (up to {MAX_RECEIPT_FILES})
              <input type="file" accept="image/*" multiple onChange={pickFiles} />
            </label>
            {files.length > 0 && (
              <div className="receipt-previews">
                {files.map((f, i) => (
                  <div className="receipt-preview" key={f.name + i}>
                    <img src={URL.createObjectURL(f)} alt={f.name} />
                    <button
                      type="button"
                      onClick={() => setFiles((p) => p.filter((_, j) => j !== i))}
                      aria-label={`Remove ${f.name}`}
                      disabled={payBusy}
                    >
                      ✕
                    </button>
                  </div>
                ))}
              </div>
            )}
            {payError && <p className="form-error">{payError}</p>}
            <div className="admin-form-actions">
              <button className="btn btn-primary" type="submit" disabled={payBusy}>
                {payBusy ? "Sending…" : "Send payment"}
              </button>
              <button className="btn btn-secondary" type="button" disabled={payBusy} onClick={() => setPayingId(null)}>
                Cancel
              </button>
            </div>
          </form>
        )}
      </div>
    );
  }

  return (
    <div className="ticket-card billing-card">
      <h4>Billing &amp; Payments</h4>
      <p className="billing-intro">
        {isPureCustom(order) ? "Company orders" : "Residential orders"} pay in three parts: a{" "}
        <strong>{plan.depositPercent}% downpayment</strong>, <strong>{plan.progressPercent}% in progress billing</strong>
        {plan.progressPercent >= 60 ? " (in one or two billings)" : ""} as the work moves forward, and the last{" "}
        <strong>{plan.finalPercent}% at turnover</strong>. All payments are bank deposits.
      </p>

      {row(
        `Downpayment (${plan.depositPercent}%)`,
        null,
        peso(plan.deposit),
        depositState
      )}
      {row(
        `Progress billing (${plan.progressPercent}%)`,
        `${peso(plan.progressIssued)} billed so far · ${peso(plan.progressToIssue)} still to bill`,
        peso(plan.progressPool),
        null
      )}
      {progressBillings.length > 0 && <div className="billing-list">{progressBillings.map(billingRow)}</div>}
      {row(
        `Final payment (${plan.finalPercent}% at turnover)`,
        finalBilling ? null : "Billed once the work is turned over",
        peso(finalBilling ? finalBilling.amount : plan.finalAmount),
        finalBilling ? null : <span className="billing-pill billing-pill-later">Not billed yet</span>
      )}
      {finalBilling && <div className="billing-list">{billingRow(finalBilling)}</div>}

      {owedNow > 0 && (
        <p className="billing-owed">
          {isAdmin ? "Billed and not yet verified: " : "You currently owe: "}
          <strong>{peso(owedNow)}</strong>
        </p>
      )}

      {error && <p className="form-error">{error}</p>}

      {isAdmin && !closed && (
        <div className="billing-admin">
          {!order.depositConfirmed && (
            <p className="deposit-note">Billing opens after you verify the downpayment.</p>
          )}
          {order.depositConfirmed && !issuing && (
            <div className="admin-form-actions">
              {plan.progressToIssue > 0 && (
                <button type="button" className="btn btn-secondary" onClick={() => startIssue("progress")}>
                  + Issue progress billing
                </button>
              )}
              {!finalBilling && (
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => startIssue("final")}
                  disabled={!atTurnover}
                  title={atTurnover ? undefined : "Available once the order is Ready for Delivery (turnover)."}
                >
                  + Issue final {plan.finalPercent}% billing
                </button>
              )}
            </div>
          )}
          {order.depositConfirmed && !finalBilling && !atTurnover && (
            <p className="deposit-note">The final {plan.finalPercent}% can be billed once the order reaches Ready for Delivery.</p>
          )}
          {issuing && (
            <form className="billing-issue-form" onSubmit={handleIssue}>
              <label>
                Label
                <input value={issuing.label} onChange={(e) => setIssuing({ ...issuing, label: e.target.value })} />
              </label>
              <label>
                Amount (₱)
                <input
                  type="number"
                  min="1"
                  value={issuing.amount}
                  onChange={(e) => setIssuing({ ...issuing, amount: e.target.value })}
                />
              </label>
              <label>
                Note for the customer (optional)
                <input
                  value={issuing.note}
                  onChange={(e) => setIssuing({ ...issuing, note: e.target.value })}
                  placeholder="e.g. Fabrication complete, ready for installation"
                />
              </label>
              <div className="admin-form-actions">
                <button className="btn btn-primary" type="submit" disabled={issueBusy}>
                  {issueBusy ? "Issuing…" : "Send billing"}
                </button>
                <button className="btn btn-secondary" type="button" onClick={() => setIssuing(null)} disabled={issueBusy}>
                  Cancel
                </button>
              </div>
            </form>
          )}
        </div>
      )}
    </div>
  );
}