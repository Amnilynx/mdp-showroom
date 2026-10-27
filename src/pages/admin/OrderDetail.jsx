import { checkFutureDate, todayISO } from "../../lib/validators";
import { useEffect, useState } from "react";
import { useParams, useNavigate, useLocation } from "react-router-dom";
import AdminLayout from "../../components/AdminLayout";
import ChatThread from "../../components/ChatThread";
import PaymentSummary from "../../components/PaymentSummary";
import ReceiptsPanel from "../../components/ReceiptsPanel";
import BillingPanel from "../../components/BillingPanel";
import QuoteFiles from "../../components/QuoteFiles";
import ChangeRequestFiles from "../../components/ChangeRequestFiles";
import { useUnread } from "../../lib/chatPresence";
import { getPaymentSummary } from "../../lib/refunds";
import { sendQuoteFile } from "../../lib/quotes";
import {
  getReceipts,
  subscribeToOrder,
  subscribeToReceipts,
  confirmDepositReceipts,
  clearDepositReceiptConfirmations,
} from "../../lib/receipts";
import { validateAttachments, MAX_FILES_PER_SEND } from "../../lib/messages";
import { useAuth } from "../../context/AuthContext";
import {
  getOrderById,
  updateOrderStatus,
  assignOrderCode,
  addAdminNote,
  confirmDeposit,
  unconfirmDeposit,
  issueFinalPrice,
  quoteChangeRequest,
  adminDeclineChangeRequest,
  confirmSiteVisit,
  clearSiteVisit,
  scheduleDelivery,
  clearScheduledDelivery,
  getPayableTotal,
  isPureCustom,
  depositPercentLabel,
  getDepositRate,
  ORDER_STATUSES,
  TERMINAL_STATUSES,
  STATUS_LABELS,
  paymentMethodLabel,
  adminExtendDeposit,
  adminCloseUnpaidOrder,
  getDepositStage,
  getBillingPlan,
  getDepositDaysLeft,
  getDepositDueMillis,
  getQuoteAcceptedMillis,
  DEPOSIT_EXTENSION_DAYS,
  POST_PRODUCTION_STATUSES,
  CHANGE_REQUEST_LABELS,
} from "../../lib/orders";
import { generateOrderReceipt } from "../../lib/invoicePdf";

const ALL_STATUSES = [...ORDER_STATUSES, ...TERMINAL_STATUSES];

// Turns a Firestore/Firebase error into text the admin can act on.
function errMsg(err) {
  const code = err?.code ? String(err.code).replace("firestore/", "") : "";
  const hints = {
    "permission-denied": "You don't have permission (are you signed in as a manager? Have the latest Firestore rules been published?).",
    "unavailable": "Can't reach the server. Check the internet connection and try again.",
    "unauthenticated": "Your session expired. Sign in again.",
    "not-found": "This order no longer exists.",
    "failed-precondition": "The database rejected the change (a required index or rule is missing).",
    "deadline-exceeded": "The server took too long to answer.",
    "resource-exhausted": "The database quota has been used up for now.",
  };
  const base = hints[code] || err?.message || "Unknown error.";
  return code ? `${base} (${code})` : base;
}

export default function AdminOrderDetail() {
  const { orderId } = useParams();
  const { user, profile } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const unreadHere = useUnread(orderId);

  const [order, setOrder] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [statusDraft, setStatusDraft] = useState("");
  const [statusMsg, setStatusMsg] = useState(null); // { type: "ok" | "error" | "wait", text }
  const [codeDraft, setCodeDraft] = useState("");
  const [noteDraft, setNoteDraft] = useState("");
  const [priceDraft, setPriceDraft] = useState("");
  // Quote document (PDF/Word/Excel) that must go out with every new price.
  const [receipts, setReceipts] = useState([]);
  const [quoteFiles, setQuoteFiles] = useState([]); // up to 5 files
  const [crQuoteFiles, setCrQuoteFiles] = useState({}); // { [crId]: File[] }
  const [visitDateDraft, setVisitDateDraft] = useState("");
  const [deliveryDateDraft, setDeliveryDateDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [activeTab, setActiveTab] = useState(() =>
    new URLSearchParams(window.location.search).get("tab") === "messages" ? "messages" : "details"
  );

  // Change-request quoting state — keyed by change request id so each row
  // in the tracker has its own independent draft.
  const [quoteDrafts, setQuoteDrafts] = useState({}); // { [crId]: { amount, response } }
  const [declineDrafts, setDeclineDrafts] = useState({}); // { [crId]: responseText }
  const [crBusy, setCrBusy] = useState(null); // crId currently submitting

  async function load() {
    setLoading(true);
    setError("");
    try {
      const [data, rcpts] = await Promise.all([
        getOrderById(orderId),
        getReceipts(orderId).catch(() => []),
      ]);
      if (!data) {
        setError("Order not found.");
      } else {
        setOrder(data);
        setReceipts(rcpts);
        setStatusDraft(data.status);
        setCodeDraft(data.orderCode || "");
        setPriceDraft(data.finalPrice ?? (data.provisionalTotal || "") ?? "");
        setVisitDateDraft(data.confirmedVisitDate || "");
        setDeliveryDateDraft(data.scheduledDeliveryDate || "");
      }
    } catch (err) {
      setError("Couldn't load this order.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, [orderId]);

  // Live updates: the order (status, deposit, change requests) and its
  // receipts refresh the moment the customer acts — no reload needed.
  useEffect(() => {
    const stopOrder = subscribeToOrder(orderId, (o) => setOrder(o));
    const stopReceipts = subscribeToReceipts(orderId, setReceipts);
    return () => {
      stopOrder();
      stopReceipts();
    };
  }, [orderId]);

  // A chat pop-up links here with ?tab=messages.
  useEffect(() => {
    if (new URLSearchParams(location.search).get("tab") === "messages") {
      setActiveTab("messages");
    }
  }, [location.search]);

  async function handleStatusUpdate() {
    try {
      await runStatusUpdate();
    } catch (err) {
      console.error(err);
      setBusy(false);
      setStatusMsg({ type: "error", text: "Couldn't update the status. " + errMsg(err) });
    }
  }

  async function runStatusUpdate() {
    setStatusMsg(null);
    if (!order) return;
    if (statusDraft === order.status) return;

    // Cancelling or rejecting is a hard stop for the order — if a deposit
    // was already paid, this is the moment admin needs to remember a real
    // refund is now owed to the customer. Worth a loud, specific warning
    // rather than treating this the same as any other status change.
    if (statusDraft === "cancelled" || statusDraft === "rejected") {
      const verb = statusDraft === "cancelled" ? "Cancel" : "Reject";
      const depositWarning = order.depositConfirmed
        ? `\n\n⚠ A deposit of ₱${(order.finalDepositAmount ?? order.depositAmount ?? 0).toLocaleString()} was already received and verified for this order. ${verb}ing it does NOT refund the customer automatically — you are responsible for processing that refund manually (bank transfer) outside this system. Afterwards, attach the receipt in the Refunds card so the customer can see it.`
        : order.paymentReference
        ? `\n\nThe customer submitted a payment reference (${order.paymentReference}) that was not yet verified. If they did pay, you are responsible for refunding them manually.`
        : "";
      const confirmed = window.confirm(
        `${verb} this order?\n\nThis drops the order entirely and cannot be undone from here.${depositWarning}`
      );
      if (!confirmed) return;
    }

    // Completing an order while a bill is still unpaid, or before the final
    // 10% was ever billed, is almost always a slip — say so.
    if (statusDraft === "completed") {
      const plan = getBillingPlan(order);
      const unpaid = (order.billings || []).filter((b) => !b.paidAt);
      let warn = "";
      if (!plan.finalBilling) {
        warn = `The final ${plan.finalPercent}% (${"₱" + plan.finalAmount.toLocaleString()}) has not been billed yet.`;
      } else if (unpaid.length) {
        warn = `${unpaid.length} billing${unpaid.length === 1 ? " is" : "s are"} not yet verified as paid.`;
      }
      if (warn && !window.confirm(`${warn}\n\nMark the order Completed anyway?`)) return;
    }

    setBusy(true);
    setStatusMsg({ type: "wait", text: "Saving…" });
    // If the save is still waiting after 12 s, say so instead of freezing
    // silently (usually a dropped connection; the change is queued and will
    // apply once the connection returns).
    const slow = setTimeout(
      () =>
        setStatusMsg({
          type: "wait",
          text: "Still saving… this is taking longer than usual. Check your internet connection. The change is queued and will apply when you're back online.",
        }),
      12000
    );
    try {
      await updateOrderStatus(orderId, statusDraft);
      setStatusMsg({ type: "ok", text: `Status updated to "${STATUS_LABELS[statusDraft] || statusDraft}".` });
    } catch (err) {
      console.error("updateOrderStatus failed:", err);
      setStatusMsg({ type: "error", text: "Couldn't update the status. " + errMsg(err) });
    } finally {
      clearTimeout(slow);
      setBusy(false);
    }
  }

  async function handleAssignCode() {
    const code = codeDraft.trim().toUpperCase();
    if (!code) return;
    if (!/^[A-Z0-9][A-Z0-9-]{1,18}[A-Z0-9]$/.test(code)) {
      alert("The order code must be 3 to 20 characters: letters, numbers and dashes only, like CR-701.");
      return;
    }
    setBusy(true);
    try {
      await assignOrderCode(orderId, code);
      await load();
    } catch (err) {
      alert(`Failed to assign order code. ${errMsg(err)}`);
    } finally {
      setBusy(false);
    }
  }

  async function handleConfirmVisit() {
    if (!visitDateDraft) return;
    const dateProblem = checkFutureDate(visitDateDraft, "site visit date");
    if (dateProblem) { alert(dateProblem); return; }
    setBusy(true);
    try {
      await confirmSiteVisit(orderId, visitDateDraft);
      await load();
    } catch (err) {
      alert(`Failed to confirm site visit date. ${errMsg(err)}`);
    } finally {
      setBusy(false);
    }
  }

  async function handleClearVisit() {
    setBusy(true);
    try {
      await clearSiteVisit(orderId);
      setVisitDateDraft("");
      await load();
    } catch (err) {
      alert(`Failed to clear site visit date. ${errMsg(err)}`);
    } finally {
      setBusy(false);
    }
  }

  async function handleScheduleDelivery() {
    if (!deliveryDateDraft) return;
    const dateProblem = checkFutureDate(deliveryDateDraft, "delivery date");
    if (dateProblem) { alert(dateProblem); return; }
    setBusy(true);
    try {
      await scheduleDelivery(orderId, deliveryDateDraft);
      await load();
    } catch (err) {
      alert(`Failed to schedule delivery. ${errMsg(err)}`);
    } finally {
      setBusy(false);
    }
  }

  async function handleClearDelivery() {
    setBusy(true);
    try {
      await clearScheduledDelivery(orderId);
      setDeliveryDateDraft("");
      await load();
    } catch (err) {
      alert(`Failed to clear delivery date. ${errMsg(err)}`);
    } finally {
      setBusy(false);
    }
  }

  async function handleAddNote(e) {
    e.preventDefault();
    if (!noteDraft.trim()) return;
    setBusy(true);
    try {
      await addAdminNote(orderId, user.uid, noteDraft.trim());
      setNoteDraft("");
      await load();
    } catch (err) {
      alert(`Failed to add note. ${errMsg(err)}`);
    } finally {
      setBusy(false);
    }
  }

  async function handleExtendDeposit() {
    if (!window.confirm(`Give the client ${DEPOSIT_EXTENSION_DAYS} more days to pay the downpayment?`)) return;
    setBusy(true);
    try {
      await adminExtendDeposit(orderId);
      await load();
    } catch (err) {
      alert(err.message || "Couldn't extend the deadline. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  async function handleCloseUnpaid() {
    if (
      !window.confirm(
        "Close this order because the downpayment wasn't received? No payment has been submitted, so nothing is refunded. The customer is told in Messages."
      )
    )
      return;
    setBusy(true);
    try {
      await adminCloseUnpaidOrder(orderId);
      await load();
    } catch (err) {
      alert(err.message || "Couldn't close the order. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  async function handleToggleDeposit() {
    // Guard against approving a deposit that was never actually
    // submitted — the checkbox itself is disabled in this state too,
    // but this is the real enforcement point so it can't be bypassed
    // (e.g. a stale disabled attribute, dev tools, etc).
    if (!order.depositConfirmed && !order.paymentReference && !order.paymentProofImage) {
      alert("The customer hasn't submitted any payment proof yet — there's nothing to verify.");
      return;
    }
    setBusy(true);
    try {
      if (order.depositConfirmed) {
        await unconfirmDeposit(orderId);
        await clearDepositReceiptConfirmations(orderId, receipts);
      } else {
        await confirmDeposit(orderId, user.uid);
        // Verifying the payment also locks the customer's receipts.
        await confirmDepositReceipts(orderId, receipts, user.uid);
      }
      await load();
    } catch (err) {
      alert(`Failed to update deposit status. ${errMsg(err)}`);
    } finally {
      setBusy(false);
    }
  }

  // Adds the picked files to `current` (max 5 total) and passes the new
  // list to `onPick`.
  function pickQuoteFiles(e, current, onPick) {
    const picked = Array.from(e.target.files || []);
    e.target.value = "";
    if (!picked.length) return;
    const combined = [...current, ...picked];
    const problem = validateAttachments(combined, "manager");
    if (problem) {
      alert(problem);
      return;
    }
    onPick(combined);
  }

  function QuoteFilePicker({ files, onChange, label }) {
    return (
      <div className="quote-file-picker">
        <span>
          {label} <strong>— required</strong>
        </span>
        <input
          type="file"
          multiple
          accept=".pdf,.doc,.docx,.xls,.xlsx,.csv"
          onChange={(e) => pickQuoteFiles(e, files, onChange)}
        />
        {files.map((f, i) => (
          <em key={f.name + i} className="quote-file-chip">
            {f.name}{" "}
            <button
              type="button"
              onClick={() => onChange(files.filter((_, j) => j !== i))}
              aria-label={`Remove ${f.name}`}
            >
              ✕
            </button>
          </em>
        ))}
        <small>Up to {MAX_FILES_PER_SEND} files, 2 MB each.</small>
      </div>
    );
  }

  const senderName = profile?.fullName || user?.email || "MDP Modular Systems";

  async function handleIssueFinalPrice() {
    const price = Number(priceDraft);
    if (String(priceDraft).trim() === "" || !Number.isFinite(price) || price <= 0) {
      alert("Enter the final price as a number above 0.");
      return;
    }
    if (price > 100000000) {
      alert("That price looks too large. Check the number of zeros.");
      return;
    }
    if (!Number.isInteger(price * 100)) {
      alert("Use at most two decimal places for the price.");
      return;
    }
    if (quoteFiles.length === 0) {
      alert("Attach the quote file (PDF, Word or Excel) to send to the customer with this price.");
      return;
    }
    if (
      !window.confirm(
        `Issue ₱${price.toLocaleString()} as the final price and send ${quoteFiles.length} quote file${quoteFiles.length === 1 ? "" : "s"} to the customer? They will be asked to approve and pay a ${depositPercentLabel(order)} deposit (₱${Math.round(
          price * getDepositRate(order)
        ).toLocaleString()}) against this amount.`
      )
    )
      return;
    setBusy(true);
    try {
      // File first: if it fails, no price goes out without its quote.
      await sendQuoteFile(orderId, quoteFiles, {
        senderId: user.uid,
        senderName,
        amountLabel: `₱${price.toLocaleString()}`,
        kind: "final_price",
      });
      await issueFinalPrice(orderId, price);
      setQuoteFiles([]);
      await load();
    } catch (err) {
      alert(err?.message || "Failed to issue final price.");
    } finally {
      setBusy(false);
    }
  }

  function setQuoteDraft(crId, patch) {
    setQuoteDrafts((d) => ({ ...d, [crId]: { ...d[crId], ...patch } }));
  }

  async function handleQuoteChange(cr) {
    const draft = quoteDrafts[cr.id] || {};
    const amount = Number(draft.amount);
    if (!amount) {
      alert("Enter a non-zero adjustment amount (positive for additional cost, negative for a credit).");
      return;
    }
    if (cr.type === "post_production" && amount < 0) {
      if (
        !window.confirm(
          "This is a post-production request with a negative (credit) amount. Built/bought work is normally never credited — are you sure?"
        )
      )
        return;
    }
    const crFiles = crQuoteFiles[cr.id] || [];
    if (crFiles.length === 0) {
      alert("Attach the quote file (PDF, Word or Excel) to send to the customer with this change.");
      return;
    }
    setCrBusy(cr.id);
    try {
      await sendQuoteFile(orderId, crFiles, {
        senderId: user.uid,
        senderName,
        amountLabel: `${amount > 0 ? "+" : "−"}₱${Math.abs(amount).toLocaleString()} change`,
        kind: "change_request",
        changeRequestId: cr.id,
      });
      await quoteChangeRequest(orderId, cr.id, { adjustmentAmount: amount, adminResponse: draft.response || "" });
      setQuoteDrafts((d) => ({ ...d, [cr.id]: { amount: "", response: "" } }));
      setCrQuoteFiles((f) => ({ ...f, [cr.id]: [] }));
      await load();
    } catch (err) {
      alert(err?.message || "Failed to send quote.");
    } finally {
      setCrBusy(null);
    }
  }

  async function handleDeclineChange(cr) {
    const response = declineDrafts[cr.id] || "";
    if (!response.trim()) {
      alert("Add a short reason so the customer understands why.");
      return;
    }
    setCrBusy(cr.id);
    try {
      await adminDeclineChangeRequest(orderId, cr.id, response.trim());
      setDeclineDrafts((d) => ({ ...d, [cr.id]: "" }));
      await load();
    } catch (err) {
      alert(`Failed to decline request. ${errMsg(err)}`);
    } finally {
      setCrBusy(null);
    }
  }

  if (loading) {
    return (
      <AdminLayout title="Order">
        <p>Loading…</p>
      </AdminLayout>
    );
  }

  if (error || !order) {
    return (
      <AdminLayout title="Order">
        <p className="form-error">{error || "Order not found."}</p>
      </AdminLayout>
    );
  }

  const currentIndex = ORDER_STATUSES.indexOf(order.status);

  // Deposit can only be marked received once the customer has actually
  // submitted something (a reference number and/or a proof screenshot).
  // Before that, there's nothing for admin to verify against.
  const hasPaymentProof = Boolean(order.paymentReference || order.paymentProofImage);
  const depositCheckboxDisabled = busy || (!order.depositConfirmed && !hasPaymentProof);

  return (
    <AdminLayout>
      <div className="ticket-header-row">
        <h1 className="admin-page-title">
          {order.configurations?.[0]?.furnitureName || "Order"}
        </h1>
        <button
          type="button"
          className="btn btn-secondary ticket-download-btn"
          onClick={() => generateOrderReceipt(order)}
        >
          ⬇ Download Receipt
        </button>
      </div>

      <div className="ticket-tabs">
        <button
          className={"ticket-tab" + (activeTab === "details" ? " ticket-tab-active" : "")}
          onClick={() => setActiveTab("details")}
        >
          Order Details
        </button>
        <button
          className={
            "ticket-tab" +
            (activeTab === "messages" ? " ticket-tab-active" : "") +
            (unreadHere > 0 && activeTab !== "messages" ? " ticket-tab-alert" : "")
          }
          onClick={() => setActiveTab("messages")}
        >
          💬 Messages
          {unreadHere > 0 && activeTab !== "messages" && (
            <span className="tab-unread-badge">{unreadHere} NEW</span>
          )}
        </button>
      </div>

      {activeTab === "messages" ? (
        <div className="ticket-card ticket-chat-card">
          <ChatThread orderId={orderId} />
        </div>
      ) : (
      <div className="order-detail-layout">
        <div className="order-detail-main">
          {/* Money overview + anything the admin still has to do (refund
              receipts, proof for accepted credits). Sits first so it is the
              first thing seen after a change request is accepted. */}
          <PaymentSummary order={order} receipts={receipts} />

          {/* Every quote file already sent on this order */}
          <QuoteFiles order={order} orderId={orderId} title="Quotes sent" />

          {/* Journey tracker */}
          <div className="ticket-card">
            <h4>Journey</h4>
            <div className="journey-tracker">
              {ORDER_STATUSES.map((s, i) => (
                <span
                  key={s}
                  className={
                    "journey-dot" +
                    (i < currentIndex
                      ? " journey-dot-done"
                      : i === currentIndex
                      ? " journey-dot-active"
                      : "")
                  }
                  title={STATUS_LABELS[s]}
                >
                  {i + 1}
                </span>
              ))}
            </div>
          </div>

          {/* Pure custom brief */}
          {isPureCustom(order) && (
            <div className="ticket-card custom-brief-card">
              <h4>Pure Custom Request</h4>
              <p className="custom-brief-company">
                <span className="custom-badge">PURE CUSTOM · COMPANY</span>{" "}
                <strong>{order.companyName}</strong>
              </p>
              <p className="custom-brief-text">{order.projectDetails}</p>
              <p className="price-pending-note">
                Company order: {depositPercentLabel(order)} deposit. Review the brief
                (and any files the customer sends in Messages), then issue the price below.
              </p>
            </div>
          )}

          {/* Configurations */}
          <div className="ticket-card">
            <h4>{isPureCustom(order) ? "Price" : "Configurations"}</h4>
            {(isPureCustom(order) ? [] : order.configurations).map((c, i) => (
              <div className="ticket-config-row" key={i}>
                <span>
                  {c.furnitureName} — {c.shapeType} · {c.finish} ·{" "}
                  {c.hardware}
                  {c.customRequest && (
                    <>
                      {" "}
                      <em>
                        ({c.customRequest.part}: {c.customRequest.note})
                      </em>
                    </>
                  )}
                </span>
                <span>₱{c.subtotal.toLocaleString()}</span>
              </div>
            ))}
            <div className="ticket-config-row ticket-config-total">
              <span>{isPureCustom(order) ? "System estimate" : "Provisional Total"}</span>
              <span>
                {isPureCustom(order) ? "None (quote manually)" : "₱" + order.provisionalTotal.toLocaleString()}
              </span>
            </div>
            {order.adjustmentsTotal ? (
              <>
                <div className="ticket-config-row">
                  <span>Accepted changes (net)</span>
                  <span className={order.adjustmentsTotal > 0 ? "adjustment-positive" : "adjustment-negative"}>
                    {order.adjustmentsTotal > 0 ? "+" : "−"}₱{Math.abs(order.adjustmentsTotal).toLocaleString()}
                  </span>
                </div>
                <div className="ticket-config-row ticket-config-total">
                  <span>Current Payable Total</span>
                  <span>₱{getPayableTotal(order).toLocaleString()}</span>
                </div>
              </>
            ) : null}
          </div>

          {/* Change request tracker */}
          {(order.changeRequests || []).length > 0 && (
            <div className="ticket-card change-request-tracker">
              <h4>Change Requests</h4>
              {order.changeRequests
                .slice()
                .reverse()
                .map((cr) => (
                  <div key={cr.id} className={`change-request-item change-request-item-${cr.status}`}>
                    <div className="change-request-item-header">
                      <span className={`change-request-status-pill change-request-status-${cr.status}`}>
                        {CHANGE_REQUEST_LABELS[cr.status]}
                      </span>
                      {cr.type === "post_production" && (
                        <span className="change-request-type-tag">
                          ⚠ Post-production — finish/hardware only, no dimension changes
                        </span>
                      )}
                      <span className="change-request-date">
                        {new Date(cr.createdAt).toLocaleString("en-PH")}
                      </span>
                    </div>
                    <p className="change-request-note">{cr.note}</p>

                    {/* Customer's letter of notice + any files either side added */}
                    <ChangeRequestFiles
                      orderId={orderId}
                      cr={cr}
                      role="admin"
                      user={user}
                      userName={senderName}
                      canUpload
                    />

                    {cr.status === "pending" && (
                      <div className="change-request-admin-form">
                        <div className="inline-form-row">
                          <input
                            type="number"
                            placeholder="Amount (+5000 or -2000)"
                            value={quoteDrafts[cr.id]?.amount ?? ""}
                            onChange={(e) => setQuoteDraft(cr.id, { amount: e.target.value })}
                          />
                          <button
                            className="btn btn-primary"
                            onClick={() => handleQuoteChange(cr)}
                            disabled={crBusy === cr.id}
                          >
                            Send Quote
                          </button>
                        </div>
                        <QuoteFilePicker
                          label="Quote files for this change (PDF, Word or Excel)"
                          files={crQuoteFiles[cr.id] || []}
                          onChange={(list) => setCrQuoteFiles((st) => ({ ...st, [cr.id]: list }))}
                        />
                        <textarea
                          rows={2}
                          placeholder="Optional note explaining the recomputed amount…"
                          value={quoteDrafts[cr.id]?.response ?? ""}
                          onChange={(e) => setQuoteDraft(cr.id, { response: e.target.value })}
                        />
                        <div className="inline-form-row">
                          <input
                            placeholder="Reason to decline outright (e.g. dimension change after production)"
                            value={declineDrafts[cr.id] ?? ""}
                            onChange={(e) => setDeclineDrafts((d) => ({ ...d, [cr.id]: e.target.value }))}
                          />
                          <button
                            className="btn btn-secondary"
                            onClick={() => handleDeclineChange(cr)}
                            disabled={crBusy === cr.id}
                          >
                            Decline
                          </button>
                        </div>
                      </div>
                    )}

                    {cr.status === "quoted" && (
                      <p className="change-request-resolved-note">
                        Quoted {cr.adjustmentAmount > 0 ? "+" : "−"}₱
                        {Math.abs(cr.adjustmentAmount).toLocaleString()} — waiting on customer response.
                      </p>
                    )}
                    {cr.status === "accepted" && (
                      <p className="change-request-resolved-note">
                        ✓ Customer accepted — {cr.adjustmentAmount > 0 ? "+" : "−"}₱
                        {Math.abs(cr.adjustmentAmount).toLocaleString()} applied.
                      </p>
                    )}
                    {cr.status === "rejected" && (
                      <p className="change-request-resolved-note">Customer declined — order unchanged.</p>
                    )}
                    {cr.status === "declined_by_admin" && cr.adminResponse && (
                      <p className="change-request-resolved-note change-request-resolved-note-declined">
                        You declined: {cr.adminResponse}
                      </p>
                    )}
                  </div>
                ))}
            </div>
          )}

          {/* Admin notes — internal staff log, plus customer-submitted
              "Request Changes" entries flagged with a badge so they stand out. */}
          <div className="ticket-card">
            <h4>Admin Notes</h4>
            <div className="notes-log">
              {(order.adminNotes || []).length === 0 && (
                <p className="notes-empty">No notes yet.</p>
              )}
              {(order.adminNotes || [])
                .slice()
                .reverse()
                .map((n, i) => (
                  <div
                    className={
                      "note-item" +
                      (n.type === "change_request" ? " note-item-change-request" : "")
                    }
                    key={i}
                  >
                    {n.type === "change_request" && (
                      <span className="change-request-badge">Customer request</span>
                    )}
                    <p>{n.note}</p>
                    <span>{new Date(n.createdAt).toLocaleString()}</span>
                  </div>
                ))}
            </div>
            <form className="note-form" onSubmit={handleAddNote}>
              <input
                placeholder="Write a note…"
                value={noteDraft}
                onChange={(e) => setNoteDraft(e.target.value)}
              />
              <button type="submit" disabled={busy || !noteDraft.trim()}>
                Add
              </button>
            </form>
          </div>
        </div>

        <div className="order-detail-side">
          {/* Review & issue final price */}
          <div
            className={
              "ticket-card price-review-card" +
              (order.finalPrice ? " price-review-issued" : "")
            }
          >
            <h4>Review &amp; Issue Final Price</h4>
            <p className="price-review-provisional">
              {isPureCustom(order)
                ? `Pure custom order: no system estimate. Quote it from the customer's brief (deposit ${depositPercentLabel(order)}).`
                : `System estimate: ₱${order.provisionalTotal?.toLocaleString()}`}
            </p>
            <div className="inline-form-row">
              <input
                type="number"
                min="1"
                step="0.01"
                value={priceDraft}
                onChange={(e) => setPriceDraft(e.target.value)}
                disabled={order.status !== "request_received" && order.status !== "under_review"}
              />
              <button
                className="btn btn-primary"
                onClick={handleIssueFinalPrice}
                disabled={
                  busy ||
                  (order.status !== "request_received" &&
                    order.status !== "under_review")
                }
              >
                {order.finalPrice ? "Re-issue" : "Issue Price"}
              </button>
            </div>
            {(order.status === "request_received" || order.status === "under_review") && (
              <QuoteFilePicker
                label="Quote files to send with this price (PDF, Word or Excel)"
                files={quoteFiles}
                onChange={setQuoteFiles}
              />
            )}
            {order.finalPrice ? (
              <p className="price-review-confirmed">
                ✓ Final price issued: ₱{order.finalPrice.toLocaleString()}{" "}
                (deposit ₱{order.finalDepositAmount?.toLocaleString()}). Customer
                can now approve.
              </p>
            ) : (
              <p className="price-review-note">
                Confirm or adjust the system estimate, then issue it as the
                binding price. This unlocks the customer's Approve &amp; Pay
                Deposit action.
              </p>
            )}
          </div>

          {/* Deposit verification */}
          {order.status !== "request_received" && order.status !== "under_review" && (
            <div
              className={
                "ticket-card deposit-card" +
                (order.depositConfirmed ? " deposit-card-confirmed" : "")
              }
            >
              <h4>Deposit</h4>
              <p className="deposit-amount">
                ₱{getPaymentSummary(order, receipts).adjustedDeposit.toLocaleString()}
              </p>
              {getPaymentSummary(order, receipts).adjustedDeposit !== (order.finalDepositAmount ?? order.depositAmount) && (
                <p className="deposit-note">
                  Lowered from ₱{(order.finalDepositAmount ?? order.depositAmount)?.toLocaleString()} —
                  an accepted change reduced the total, so the deposit is {depositPercentLabel(order)} of the new total.
                </p>
              )}

              {(() => {
                const stage = getDepositStage(order);
                if (stage === "closed" || stage === "paid") return null;
                const dueMs = getDepositDueMillis(order);
                const accMs = getQuoteAcceptedMillis(order);
                const left = getDepositDaysLeft(order);
                const fmt = (ms) =>
                  new Date(ms).toLocaleDateString("en-PH", { year: "numeric", month: "long", day: "numeric" });
                if (stage === "waiting_price") {
                  return <p className="deposit-note">No final price issued yet, so no deposit window has started.</p>;
                }
                if (stage === "needs_accept") {
                  return (
                    <div className="deposit-window deposit-window-accept">
                      <strong>Waiting for the customer to accept the quotation.</strong>
                      <span>The two-week deposit window starts when they accept.</span>
                    </div>
                  );
                }
                return (
                  <div
                    className={
                      "deposit-window " +
                      (stage === "overdue"
                        ? "deposit-window-overdue"
                        : stage === "submitted"
                        ? "deposit-window-ok"
                        : left != null && left <= 3
                        ? "deposit-window-warn"
                        : "deposit-window-ok")
                    }
                  >
                    <strong>
                      {stage === "overdue"
                        ? `Deposit overdue — was due ${dueMs ? fmt(dueMs) : ""}`
                        : stage === "submitted"
                        ? `Payment submitted — deposit was due ${dueMs ? fmt(dueMs) : ""}`
                        : `Deposit due ${dueMs ? fmt(dueMs) : ""} (${left} day${left === 1 ? "" : "s"} left)`}
                    </strong>
                    <span>
                      Quotation accepted {accMs ? fmt(accMs) : "—"}
                      {order.depositExtensions ? ` · extended ${order.depositExtensions}×` : ""}
                    </span>
                    {stage !== "submitted" && (
                      <span className="deposit-window-actions">
                        <button type="button" className="btn btn-secondary" onClick={handleExtendDeposit} disabled={busy}>
                          Extend {DEPOSIT_EXTENSION_DAYS} days
                        </button>
                        <button type="button" className="btn btn-cancel" onClick={handleCloseUnpaid} disabled={busy}>
                          Close order (unpaid)
                        </button>
                      </span>
                    )}
                  </div>
                );
              })()}

              {order.paymentReference ? (
                <div className="payment-proof-block">
                  <p className="payment-detail-line">
                    <strong>{paymentMethodLabel(order.paymentMethod)}</strong>
                    {" "}· Ref: <strong>{order.paymentReference}</strong>
                  </p>
                  {order.paymentSubmittedAt?.toDate && (
                    <p className="deposit-timestamp">
                      Submitted {order.paymentSubmittedAt.toDate().toLocaleString("en-PH")}
                    </p>
                  )}
                  <p className="deposit-note">
                    The payment screenshots are under Receipts. Check them
                    against your actual bank account before marking
                    it verified below.
                  </p>
                </div>
              ) : (
                <p className="deposit-note">
                  Customer hasn't submitted payment proof yet — verification
                  will unlock once they do.
                </p>
              )}

              <label className="checkbox-label deposit-checkbox">
                <input
                  type="checkbox"
                  checked={!!order.depositConfirmed}
                  onChange={handleToggleDeposit}
                  disabled={depositCheckboxDisabled}
                  title={
                    !order.depositConfirmed && !hasPaymentProof
                      ? "Waiting on the customer's payment proof before this can be verified"
                      : undefined
                  }
                />
                {order.depositConfirmed
                  ? "Deposit received & verified"
                  : "Mark deposit as received"}
              </label>
              {order.depositConfirmed && order.depositConfirmedAt?.toDate && (
                <p className="deposit-timestamp">
                  Confirmed{" "}
                  {order.depositConfirmedAt.toDate().toLocaleString("en-PH")}
                </p>
              )}
            </div>
          )}

          {/* Progress billings and the final 10% at turnover. */}
          <BillingPanel
            order={order}
            orderId={orderId}
            receipts={receipts}
            role="admin"
            userId={user.uid}
            onChange={load}
          />

          {/* Every proof in one place: deposit payment screenshots, billing
              payments, refund receipts and deduction proof. */}
          <ReceiptsPanel
            order={order}
            orderId={orderId}
            receipts={receipts}
            role="admin"
            userId={user.uid}
            onVerifyDeposit={handleToggleDeposit}
          />

          {/* Contact card */}
          <div className="ticket-card">
            <h4>Customer Contact</h4>
            <p className="contact-name">{order.contact?.name}</p>
            <p className="contact-line">{order.contact?.email}</p>
            <p className="contact-line">{order.contact?.phone}</p>
            {order.location && <p className="contact-line">{order.location}</p>}
            {order.siteAddress && (
              <p className="contact-line">{order.siteAddress}</p>
            )}
          </div>

          {/* Site visit */}
          <div className="ticket-card">
            <h4>Site Visit</h4>
            {order.contact?.preferredVisitDate && (
              <p className="deposit-note">
                Customer's preferred date:{" "}
                <strong>{order.contact.preferredVisitDate}</strong>
              </p>
            )}
            <div className="inline-form-row">
              <input
                type="date"
                min={todayISO()}
                value={visitDateDraft}
                onChange={(e) => setVisitDateDraft(e.target.value)}
              />
              <button
                className="btn btn-primary"
                onClick={handleConfirmVisit}
                disabled={busy || !visitDateDraft}
              >
                {order.confirmedVisitDate ? "Update" : "Confirm"}
              </button>
            </div>
            {order.confirmedVisitDate ? (
              <p className="price-review-confirmed">
                ✓ Confirmed for {order.confirmedVisitDate}
                {" · "}
                <button
                  className="btn-link"
                  onClick={handleClearVisit}
                  disabled={busy}
                >
                  Clear
                </button>
              </p>
            ) : (
              <p className="price-review-note">
                Pick a date to confirm the site visit. The customer will be
                notified.
              </p>
            )}
          </div>

          {/* Delivery scheduling */}
          <div className="ticket-card">
            <h4>Delivery &amp; Installation</h4>
            <div className="inline-form-row">
              <input
                type="date"
                min={todayISO()}
                value={deliveryDateDraft}
                onChange={(e) => setDeliveryDateDraft(e.target.value)}
              />
              <button
                className="btn btn-primary"
                onClick={handleScheduleDelivery}
                disabled={busy || !deliveryDateDraft}
              >
                {order.scheduledDeliveryDate ? "Update" : "Schedule"}
              </button>
            </div>
            {order.scheduledDeliveryDate ? (
              <p className="price-review-confirmed">
                ✓ Scheduled for {order.scheduledDeliveryDate}
                {" · "}
                <button
                  className="btn-link"
                  onClick={handleClearDelivery}
                  disabled={busy}
                >
                  Clear
                </button>
              </p>
            ) : (
              <p className="price-review-note">
                Pick a date once the order is ready. The customer will be
                notified.
              </p>
            )}
          </div>

          {/* Order code */}
          <div className="ticket-card">
            <h4>Order Code</h4>
            <div className="inline-form-row">
              <input
                placeholder="e.g. CR-701"
                value={codeDraft}
                maxLength={20}
                onChange={(e) => setCodeDraft(e.target.value)}
              />
              <button
                className="btn btn-primary"
                onClick={handleAssignCode}
                disabled={busy || !codeDraft.trim()}
              >
                Assign
              </button>
            </div>
          </div>

          {/* Update status */}
          <div className="ticket-card">
            <h4>Update Status</h4>
            <select
              value={statusDraft}
              onChange={(e) => setStatusDraft(e.target.value)}
            >
              {ALL_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {TERMINAL_STATUSES.includes(s) ? `⚠ ${STATUS_LABELS[s]}` : STATUS_LABELS[s]}
                </option>
              ))}
            </select>

            {(statusDraft === "cancelled" || statusDraft === "rejected") && (
              <div className="cancel-warning-banner">
                <strong>⚠ This drops the order entirely.</strong>
                <p>
                  {order.depositConfirmed
                    ? `A verified deposit of ₱${(order.finalDepositAmount ?? order.depositAmount ?? 0).toLocaleString()} was already received. You must refund the customer manually — this system does not process refunds, but you can attach the receipt afterwards in the Refunds card so the customer can see it.`
                    : order.paymentReference
                    ? "A payment reference was submitted but not yet verified. If the customer did pay, you'll need to refund them manually."
                    : "No deposit has been recorded for this order yet."}
                </p>
              </div>
            )}

            <button
              className={
                "btn status-update-btn " +
                (statusDraft === "cancelled" || statusDraft === "rejected"
                  ? "btn-cancel"
                  : "btn-primary")
              }
              onClick={handleStatusUpdate}
              disabled={busy || statusDraft === order.status}
            >
              {statusDraft === "cancelled" || statusDraft === "rejected"
                ? `⚠ ${STATUS_LABELS[statusDraft]} This Order`
                : "Update"}
            </button>
            {statusMsg && (
              <div
                role={statusMsg.type === "error" ? "alert" : "status"}
                style={{
                  marginTop: 10,
                  padding: "8px 12px",
                  borderRadius: 6,
                  fontSize: 14,
                  background: statusMsg.type === "error" ? "#fde8e8" : statusMsg.type === "ok" ? "#e6f4ea" : "#fff6dd",
                  color: statusMsg.type === "error" ? "#9b1c1c" : statusMsg.type === "ok" ? "#1e6b34" : "#7a5b00",
                  border: "1px solid " + (statusMsg.type === "error" ? "#f5b5b5" : statusMsg.type === "ok" ? "#b7dfc2" : "#ecd48a"),
                }}
              >
                {statusMsg.text}
              </div>
            )}
          </div>
        </div>
      </div>
      )}
    </AdminLayout>
  );
}