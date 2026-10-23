import { useEffect, useState } from "react";
import { useParams, useNavigate, useLocation, Link } from "react-router-dom";
import Navbar from "../../components/Navbar";
import Footer from "../../components/Footer";
import Breadcrumb from "../../components/Breadcrumb";
import StepProgress from "../../components/StepProgress";
import ChatThread from "../../components/ChatThread";
import ReceiptsPanel from "../../components/ReceiptsPanel";
import BillingPanel from "../../components/BillingPanel";
import QuoteFiles from "../../components/QuoteFiles";
import ChangeRequestFiles from "../../components/ChangeRequestFiles";
import { sendMessage, validateAttachments, ALLOWED_EXTENSIONS, MAX_FILES_PER_SEND } from "../../lib/messages";
import { useUnread } from "../../lib/chatPresence";
import { getPaymentSummary } from "../../lib/refunds";
import {
  addReceipt,
  getReceipts,
  subscribeToOrder,
  subscribeToReceipts,
  MAX_RECEIPT_FILES,
} from "../../lib/receipts";
import { useAuth } from "../../context/AuthContext";
import {
  getOrderById,
  customerSubmitPayment,
  addChangeRequest,
  acceptChangeRequest,
  rejectChangeRequest,
  cancelOrder,
  customerAcceptQuote,
  getDepositStage,
  getDepositDaysLeft,
  getDepositDueMillis,
  getPayableTotal,
  isPureCustom,
  depositPercentLabel,
  ORDER_STATUSES,
  STATUS_LABELS,
  PAYMENT_METHODS,
  DEFAULT_PAYMENT_METHOD,
  DEPOSIT_WINDOW_DAYS,
  DEPOSIT_WARN_DAYS,
  paymentMethodLabel,
  POST_PRODUCTION_STATUSES,
  CHANGE_REQUEST_LABELS,
} from "../../lib/orders";
import { generateOrderReceipt } from "../../lib/invoicePdf";

// Cancellation only makes sense before a deposit is paid and production
// starts — once the order is "approved" (deposit submitted) or further
// along, the customer can no longer self-cancel (they'd need to contact
// the team directly, e.g. via Messages).
const CANCELLABLE_STATUSES = ["request_received", "under_review", "est_price_issued"];

export default function OrderTicket() {
  const { orderId } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const { user, profile } = useAuth();
  const [order, setOrder] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [actionBusy, setActionBusy] = useState(false);
  const [activeTab, setActiveTab] = useState(() =>
    new URLSearchParams(window.location.search).get("tab") === "messages" ? "messages" : "details"
  );

  // Payment modal state
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [paymentMethod] = useState(DEFAULT_PAYMENT_METHOD); // bank deposit is the only method
  const [accepting, setAccepting] = useState(false);
  const [acceptError, setAcceptError] = useState("");
  const [paymentReference, setPaymentReference] = useState("");
  const [receipts, setReceipts] = useState([]);
  const [proofFiles, setProofFiles] = useState([]); // up to 5 screenshots
  const [proofError, setProofError] = useState("");
  const [submittingPayment, setSubmittingPayment] = useState(false);

  // Request Changes form state
  const [showChangeForm, setShowChangeForm] = useState(false);
  const [changeNote, setChangeNote] = useState("");
  const [submittingChange, setSubmittingChange] = useState(false);
  const [changeError, setChangeError] = useState("");
  const [changeSent, setChangeSent] = useState(false);
  const [noticeFiles, setNoticeFiles] = useState([]); // the required letter of notice
  const [noticeNag, setNoticeNag] = useState(0); // bumps to replay the shake
  const unreadHere = useUnread(orderId);
  const [resolvingId, setResolvingId] = useState(null); // change-request id currently being accepted/rejected

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
      }
    } catch (err) {
      setError("Couldn't load this order right now.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, [orderId]);

  // Live updates: status, payment verification and receipts change on
  // this page the moment MDP acts — no reload needed.
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

  function handleProofFilesChange(e) {
    const picked = Array.from(e.target.files || []);
    e.target.value = "";
    if (!picked.length) return;
    if (picked.some((f) => !f.type.startsWith("image/"))) {
      setProofError("Please attach images (screenshots or photos) only.");
      return;
    }
    if (proofFiles.length + picked.length > MAX_RECEIPT_FILES) {
      setProofError(`You can attach up to ${MAX_RECEIPT_FILES} screenshots.`);
      return;
    }
    setProofError("");
    setProofFiles((prev) => [...prev, ...picked]);
  }

  function resetPaymentForm() {
    setPaymentReference("");
    setProofFiles([]);
    setProofError("");
  }

  async function handleSubmitPayment(e) {
    e.preventDefault();
    if (!paymentReference.trim()) {
      setProofError("Please enter the reference or deposit slip number.");
      return;
    }
    if (proofFiles.length === 0) {
      setProofError("Please attach at least one photo of your deposit slip or receipt.");
      return;
    }
    setSubmittingPayment(true);
    try {
      // Screenshots go in the order's Receipts; the order itself only
      // records the method and reference.
      await addReceipt(orderId, {
        kind: "deposit_payment",
        amount: depositAmount,
        referenceNumber: paymentReference.trim(),
        note: paymentMethodLabel(paymentMethod),
        files: proofFiles,
        createdBy: user.uid,
        notify: false,
      });
      await customerSubmitPayment(orderId, {
        paymentMethod,
        paymentReference: paymentReference.trim(),
        paymentProofImage: "",
      });
      setShowPaymentModal(false);
      resetPaymentForm();
      await load();
    } catch (err) {
      setProofError(err?.message || "Something went wrong submitting your payment. Please try again.");
    } finally {
      setSubmittingPayment(false);
    }
  }

  async function handleAcceptQuote() {
    setAcceptError("");
    setAccepting(true);
    try {
      await customerAcceptQuote(orderId);
      await load();
    } catch (err) {
      setAcceptError(err?.message || "Couldn't record your acceptance. Please try again.");
    } finally {
      setAccepting(false);
    }
  }

  async function handleCancel() {
    if (!CANCELLABLE_STATUSES.includes(order.status)) {
      alert("This order can no longer be cancelled — it's already past the review stage.");
      return;
    }
    if (!window.confirm("Cancel this inquiry? This can't be undone.")) return;
    setActionBusy(true);
    try {
      await cancelOrder(orderId);
      await load();
    } catch (err) {
      alert("Something went wrong. Please try again.");
    } finally {
      setActionBusy(false);
    }
  }

  function pickNoticeFiles(e) {
    const picked = Array.from(e.target.files || []);
    e.target.value = "";
    if (!picked.length) return;
    const combined = [...noticeFiles, ...picked];
    const problem = validateAttachments(combined, "customer");
    if (problem) {
      setChangeError(problem);
      return;
    }
    setChangeError("");
    setNoticeFiles(combined);
  }

  async function handleSubmitChangeRequest(e) {
    e.preventDefault();
    if (noticeFiles.length === 0) {
      setChangeError("STOP! You haven't attached your LETTER OF NOTICE. Your request can't be sent without it.");
      setNoticeNag((n) => n + 1);
      return;
    }
    if (!changeNote.trim()) {
      setChangeError("Please describe the change you'd like.");
      return;
    }
    setChangeError("");
    setSubmittingChange(true);
    try {
      const note = changeNote.trim();
      // The letter goes straight into the Messages tab (both sides see it)...
      const sent = await sendMessage(orderId, {
        senderId: user.uid,
        senderRole: "customer",
        senderName: profile?.fullName || user.email || "Customer",
        text: `📄 Letter of notice for my change request: "${note}"`,
        files: noticeFiles,
      });
      // ...and is linked to the request itself.
      await addChangeRequest(orderId, user.uid, note, {
        notice: { messageId: sent.id, attachments: sent.attachments },
      });
      setChangeNote("");
      setNoticeFiles([]);
      setShowChangeForm(false);
      setChangeSent(true);
      await load();
    } catch (err) {
      setChangeError(err.message || "Something went wrong sending your request. Please try again.");
    } finally {
      setSubmittingChange(false);
    }
  }

  async function handleAcceptChange(changeRequestId) {
    setResolvingId(changeRequestId);
    try {
      await acceptChangeRequest(orderId, changeRequestId);
      await load();
    } catch (err) {
      alert(err.message || "Something went wrong. Please try again.");
    } finally {
      setResolvingId(null);
    }
  }

  async function handleRejectChange(changeRequestId) {
    if (!window.confirm("Decline this change? Your order will continue exactly as currently configured.")) return;
    setResolvingId(changeRequestId);
    try {
      await rejectChangeRequest(orderId, changeRequestId);
      await load();
    } catch (err) {
      alert(err.message || "Something went wrong. Please try again.");
    } finally {
      setResolvingId(null);
    }
  }

  if (loading) {
    return (
      <div className="showroom-page">
        <Navbar />
        <div className="showroom-inner">
          <p>Loading…</p>
        </div>
        <Footer />
      </div>
    );
  }

  if (error || !order) {
    return (
      <div className="showroom-page">
        <Navbar />
        <div className="showroom-inner">
          <p className="form-error">{error || "Order not found."}</p>
          <Link to="/showroom" className="back-to-browse">
            ← Back to Showroom
          </Link>
        </div>
        <Footer />
      </div>
    );
  }

  const isTerminal = order.status === "rejected" || order.status === "cancelled";
  const currentStatusIndex = ORDER_STATUSES.indexOf(order.status);
  const displayCode = order.orderCode || `Draft — ${order.id.slice(0, 8)}`;
  // Deposit % (50% standard, 30% company) of the CURRENT total — drops when an accepted change lowers the
  // price (see getPaymentSummary in lib/refunds.js).
  const depositAmount = getPaymentSummary(order, receipts).adjustedDeposit;

  const depositStage = getDepositStage(order);
  const daysLeft = getDepositDaysLeft(order);
  const dueMs = getDepositDueMillis(order);
  const dueLabel = dueMs
    ? new Date(dueMs).toLocaleDateString("en-PH", { year: "numeric", month: "long", day: "numeric" })
    : "";
  const canCancel = CANCELLABLE_STATUSES.includes(order.status);
  const isPostProduction = POST_PRODUCTION_STATUSES.includes(order.status);
  const payableTotal = getPayableTotal(order);
  const changeRequests = (order.changeRequests || []).slice().reverse();
  const pendingOrQuotedCount = (order.changeRequests || []).filter(
    (cr) => cr.status === "pending" || cr.status === "quoted"
  ).length;

  const approveDisabled =
    actionBusy ||
    !order.finalPrice ||
    (!order.quoteAcceptedAt && !order.paymentReference) ||
    order.status === "approved" ||
    order.status === "in_production" ||
    order.status === "ready_for_delivery" ||
    order.status === "completed";

  return (
    <div className="showroom-page">
      <Navbar />

      <div className="showroom-inner">
        <Breadcrumb
          crumbs={[
            { label: "Home", to: "/" },
            { label: "Showroom", to: "/showroom" },
            { label: "Request Quote", to: "/quote-request" },
          ]}
        />
        <StepProgress currentStep={4} />

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
        <div className="ticket-layout">
          <div className="ticket-main">
            <div className="ticket-header-row">
              <div>
                <h1>{displayCode}</h1>
                {!order.orderCode && (
                  <span className="draft-badge">Draft</span>
                )}
              </div>
              <button
                type="button"
                className="btn btn-secondary ticket-download-btn"
                onClick={() => generateOrderReceipt(order)}
              >
                ⬇ Download Receipt
              </button>
            </div>

            {/* Status tracker */}
            {isTerminal ? (
              <p className={`status-terminal status-${order.status}`}>
                This inquiry was {STATUS_LABELS[order.status].toLowerCase()}.
              </p>
            ) : (
              <div className="ticket-tracker">
                {ORDER_STATUSES.map((status, i) => (
                  <div className="ticket-tracker-item" key={status}>
                    <div className="ticket-tracker-row">
                      <span
                        className={
                          "ticket-dot" +
                          (i < currentStatusIndex
                            ? " ticket-dot-done"
                            : i === currentStatusIndex
                            ? " ticket-dot-active"
                            : "")
                        }
                      >
                        {i < currentStatusIndex ? "✓" : ""}
                      </span>
                      {i < ORDER_STATUSES.length - 1 && (
                        <span
                          className={
                            "ticket-line" +
                            (i < currentStatusIndex ? " ticket-line-done" : "")
                          }
                        />
                      )}
                    </div>
                    <span className="ticket-tracker-label">
                      {STATUS_LABELS[status]}
                    </span>
                  </div>
                ))}
              </div>
            )}

            {/* Progress billings and the final 10% at turnover. */}
            {!isTerminal && (
              <BillingPanel
                order={order}
                orderId={orderId}
                receipts={receipts}
                role="customer"
                userId={user.uid}
                onChange={load}
              />
            )}

            {/* All proof in one place: your payment screenshots and any
                refund or deduction receipts from MDP. */}
            <ReceiptsPanel
              order={order}
              orderId={orderId}
              receipts={receipts}
              role="customer"
              userId={user.uid}
            />

            {/* Quote documents our team sent with each price. */}
            <QuoteFiles order={order} orderId={orderId} title="Your Quotations" />

            {/* Selected configurations (or the brief, for a pure custom order) */}
            {isPureCustom(order) && (
              <div className="ticket-card custom-brief-card">
                <h4>Pure Custom Request</h4>
                <p className="custom-brief-company">
                  <span className="custom-badge">PURE CUSTOM · COMPANY</span>{" "}
                  <strong>{order.companyName}</strong>
                </p>
                <p className="custom-brief-text">{order.projectDetails}</p>
                <p className="price-pending-note">
                  Our team will review your brief and send a quotation. The
                  deposit for company orders is {depositPercentLabel(order)}.
                </p>
              </div>
            )}
            <div className="ticket-card" style={isPureCustom(order) ? { display: "none" } : undefined}>
              <h4>Selected Configurations</h4>
              {order.configurations.map((c, i) => (
                <div className="ticket-config-row" key={i}>
                  <span>
                    {c.furnitureName} — {c.shapeType} · {c.finish}
                  </span>
                  <span>₱{c.subtotal.toLocaleString()}</span>
                </div>
              ))}
            </div>

            {/* Pricing details */}
            <div className="ticket-card">
              <h4>Customization Details &amp; Estimated Price</h4>
              {!order.finalPrice && !isPureCustom(order) && (
                <p className="price-pending-note">
                  This is a system estimate. Our team will review your
                  request and confirm the final price before you approve.
                </p>
              )}
              <table className="ticket-price-table">
                <tbody>
                  {order.configurations.map((c, i) => (
                    <tr key={i}>
                      <td>
                        {c.furnitureName} — {c.shapeType} · {c.finish}
                      </td>
                      <td>₱{c.subtotal.toLocaleString()}</td>
                    </tr>
                  ))}
                  {/* Older orders were created with a 10% hardware & installation
                      fee. New orders have none, so this row only appears when
                      the stored total is higher than the items. */}
                  {!isPureCustom(order) &&
                    order.provisionalTotal -
                      order.configurations.reduce((s, c) => s + c.subtotal, 0) >
                      0 && (
                      <tr>
                        <td>Hardware &amp; installation</td>
                        <td>
                          ₱
                          {(
                            order.provisionalTotal -
                            order.configurations.reduce((s, c) => s + c.subtotal, 0)
                          ).toLocaleString()}
                        </td>
                      </tr>
                    )}
                  <tr className="ticket-price-total-row">
                    <td>
                      {order.finalPrice
                        ? "Confirmed Total"
                        : "Provisional Total (estimate)"}
                    </td>
                    <td>
                      {isPureCustom(order) && !order.finalPrice
                        ? "To be quoted by MDP"
                        : "₱" + (order.finalPrice ?? order.provisionalTotal).toLocaleString()}
                    </td>
                  </tr>
                  {order.adjustmentsTotal ? (
                    <>
                      <tr className="ticket-price-adjustment-row">
                        <td>Accepted changes (net)</td>
                        <td className={order.adjustmentsTotal > 0 ? "adjustment-positive" : "adjustment-negative"}>
                          {order.adjustmentsTotal > 0 ? "+" : "−"}₱
                          {Math.abs(order.adjustmentsTotal).toLocaleString()}
                        </td>
                      </tr>
                      <tr className="ticket-price-payable-row">
                        <td>Current Payable Total</td>
                        <td>₱{payableTotal.toLocaleString()}</td>
                      </tr>
                    </>
                  ) : null}
                  <tr className="ticket-price-deposit-row">
                    <td>
                      {order.depositConfirmed
                        ? `${depositPercentLabel(order)} deposit (paid ✓)`
                        : `${depositPercentLabel(order)} deposit ${order.finalPrice ? "to approve" : "(pending confirmation)"}`}
                    </td>
                    <td>₱{depositAmount.toLocaleString()}</td>
                  </tr>
                </tbody>
              </table>
            </div>

            {/* Site visit / delivery schedule — only shown once admin has
                set a date, so this stays out of the way until relevant. */}
            {(order.confirmedVisitDate || order.scheduledDeliveryDate) && (
              <div className="ticket-card schedule-card">
                <h4>Schedule</h4>
                {order.confirmedVisitDate && (
                  <p className="schedule-line">
                    📍 Site visit confirmed for{" "}
                    <strong>{order.confirmedVisitDate}</strong>
                  </p>
                )}
                {order.scheduledDeliveryDate && (
                  <p className="schedule-line">
                    🚚 Delivery &amp; installation scheduled for{" "}
                    <strong>{order.scheduledDeliveryDate}</strong>
                  </p>
                )}
              </div>
            )}

            {/* Payment status (once submitted) */}
            {order.paymentReference && (
              <div
                className={
                  "ticket-card payment-status-card" +
                  (order.depositConfirmed ? " payment-status-verified" : "")
                }
              >
                <h4>Payment Submitted</h4>
                <p className="payment-status-line">
                  {paymentMethodLabel(order.paymentMethod)} ·
                  Ref: <strong>{order.paymentReference}</strong>
                </p>
                <p className={order.depositConfirmed ? "payment-verified-note" : "payment-pending-note"}>
                  {order.depositConfirmed
                    ? "✓ Verified by our team."
                    : "Awaiting verification by our team — this usually takes a few hours."}
                </p>
              </div>
            )}

            {!isTerminal && depositStage === "needs_accept" && (
              <div className="deposit-window deposit-window-accept" role="status">
                <strong>Next step: accept your quotation.</strong>
                <span>
                  Once you accept, you have {DEPOSIT_WINDOW_DAYS} days to pay the
                  downpayment by bank deposit. We only buy materials and start work
                  after it is paid.
                </span>
              </div>
            )}
            {!isTerminal && (depositStage === "window_open" || depositStage === "overdue") && (
              <div
                className={
                  "deposit-window " +
                  (depositStage === "overdue"
                    ? "deposit-window-overdue"
                    : daysLeft != null && daysLeft <= DEPOSIT_WARN_DAYS
                    ? "deposit-window-warn"
                    : "deposit-window-ok")
                }
                role="status"
              >
                <strong>
                  {depositStage === "overdue"
                    ? `Your downpayment was due ${dueLabel}.`
                    : `Downpayment due by ${dueLabel}`}
                </strong>
                <span>
                  {depositStage === "overdue"
                    ? "Please pay now, or message us if you need more time. Until the downpayment is received we can't buy materials or start work."
                    : daysLeft === 1
                    ? "1 day left."
                    : `${daysLeft} days left.`}
                </span>
              </div>
            )}
            {acceptError && <p className="form-error">{acceptError}</p>}

            {!isTerminal && (
              <div className="ticket-actions">
                {/* Once our team has verified the deposit there is nothing
                    left to submit — hide the button entirely. (A change
                    request can bounce the order status back to "Under
                    Review", and a credit/deduction changes the total, but
                    neither means the customer owes a new payment proof.) */}
                {depositStage === "needs_accept" && (
                  <button
                    className="btn btn-approve"
                    onClick={handleAcceptQuote}
                    disabled={accepting || actionBusy}
                  >
                    {accepting ? "Saving…" : "Accept Quotation"}
                  </button>
                )}
                {!order.depositConfirmed && depositStage !== "needs_accept" && (
                  <button
                    className="btn btn-approve"
                    onClick={() => setShowPaymentModal(true)}
                    disabled={approveDisabled}
                    title={
                      !order.finalPrice
                        ? "Waiting for our team to confirm the final price"
                        : undefined
                    }
                  >
                    {order.paymentReference
                      ? "Resubmit Payment"
                      : depositStage === "waiting_price"
                      ? "Pay Deposit (waiting for final price)"
                      : "Pay Deposit"}
                  </button>
                )}
                <button
                  className="btn btn-secondary"
                  onClick={() => setShowChangeForm((v) => !v)}
                  disabled={actionBusy}
                >
                  Request Changes
                  <span className="notice-pill">LETTER REQUIRED</span>
                  {pendingOrQuotedCount > 0 && (
                    <span className="change-request-count-badge">{pendingOrQuotedCount}</span>
                  )}
                </button>
                {canCancel && (
                  <button
                    className="btn btn-cancel"
                    onClick={handleCancel}
                    disabled={actionBusy}
                  >
                    Cancel Inquiry
                  </button>
                )}
              </div>
            )}

            {!isTerminal && !canCancel && (
              <p className="cancel-unavailable-note">
                This order can no longer be cancelled from here — the deposit
                has been submitted and work may already be underway. If you
                need to cancel, please reach out in Messages.
              </p>
            )}

            {showChangeForm && (
              <div className="ticket-card change-request-form">
                <h4>Request a Change</h4>
                {isPostProduction ? (
                  <p className="change-request-hint change-request-hint-warning">
                    ⚠ Your furniture has already entered production — materials
                    may already be purchased or built. From this point, we can
                    only adjust <strong>finishes or hardware</strong>, not
                    dimensions, and any change will come with an additional
                    cost for new materials and labor.
                  </p>
                ) : (
                  <p className="change-request-hint">
                    Tell us what you'd like adjusted — a finish, a dimension, or
                    anything else about this order. We'll review it and send
                    back an updated price for you to accept or decline before
                    anything changes.
                  </p>
                )}
                <div
                  key={noticeNag}
                  className={"notice-banner" + (noticeNag > 0 ? " notice-banner-nag" : "")}
                  role="alert"
                >
                  <span className="notice-banner-title">⚠ LETTER OF NOTICE REQUIRED ⚠</span>
                  <span className="notice-banner-text">
                    You MUST attach a signed letter of notice with every change request.
                    No letter, no request.
                  </span>
                </div>
                <details className="notice-help">
                  <summary>What should the letter say?</summary>
                  <ul>
                    <li>Your full name and your order code</li>
                    <li>Exactly what you want changed</li>
                    <li>The date, and your signature</li>
                    <li>That you understand the change may affect the price and schedule</li>
                  </ul>
                </details>
                <form onSubmit={handleSubmitChangeRequest}>
                  <label
                    className={
                      "notice-drop " + (noticeFiles.length === 0 ? "notice-drop-empty" : "notice-drop-ok")
                    }
                  >
                    <span className="notice-drop-title">
                      {noticeFiles.length === 0
                        ? "📄 ATTACH YOUR LETTER OF NOTICE HERE"
                        : `✔ ${noticeFiles.length} file${noticeFiles.length === 1 ? "" : "s"} attached`}
                    </span>
                    <span className="notice-drop-sub">
                      Photo or scan, PDF, Word or Excel · up to {MAX_FILES_PER_SEND} files
                    </span>
                    <input
                      type="file"
                      multiple
                      accept={ALLOWED_EXTENSIONS.map((x) => "." + x).join(",")}
                      onChange={pickNoticeFiles}
                      disabled={submittingChange}
                    />
                  </label>
                  {noticeFiles.length > 0 && (
                    <div className="cr-files-chips">
                      {noticeFiles.map((f, i) => (
                        <span className="quote-file-chip" key={f.name + i}>
                          {f.name}{" "}
                          <button
                            type="button"
                            onClick={() => setNoticeFiles((p) => p.filter((_, j) => j !== i))}
                            disabled={submittingChange}
                            aria-label={`Remove ${f.name}`}
                          >
                            ✕
                          </button>
                        </span>
                      ))}
                    </div>
                  )}
                  <textarea
                    rows={3}
                    placeholder={
                      isPostProduction
                        ? "e.g. Can we switch the cabinet doors to Dark Walnut instead?"
                        : "e.g. Can we switch the hardware to Push-open instead?"
                    }
                    value={changeNote}
                    onChange={(e) => setChangeNote(e.target.value)}
                  />
                  {changeError && (
                    <p key={noticeNag + "e"} className="form-error notice-error">
                      {changeError}
                    </p>
                  )}
                  <div className="admin-form-actions">
                    <button type="submit" className="btn btn-primary" disabled={submittingChange}>
                      {submittingChange ? "Sending…" : "Send Request"}
                    </button>
                    <button
                      type="button"
                      className="btn btn-secondary"
                      onClick={() => {
                        setShowChangeForm(false);
                        setChangeError("");
                        setNoticeFiles([]);
                      }}
                      disabled={submittingChange}
                    >
                      Close
                    </button>
                  </div>
                </form>
              </div>
            )}

            {changeSent && !showChangeForm && (
              <p className="change-request-confirmation">
                Your request was sent to our team.
              </p>
            )}

            {/* Change request tracker — history of every request on this
                order, each with its own pending/quoted/resolved state. */}
            {changeRequests.length > 0 && (
              <div className="ticket-card change-request-tracker">
                <h4>Change Requests</h4>
                {changeRequests.map((cr) => (
                  <div key={cr.id} className={`change-request-item change-request-item-${cr.status}`}>
                    <div className="change-request-item-header">
                      <span className={`change-request-status-pill change-request-status-${cr.status}`}>
                        {CHANGE_REQUEST_LABELS[cr.status]}
                      </span>
                      {cr.type === "post_production" && (
                        <span className="change-request-type-tag">Post-production</span>
                      )}
                      <span className="change-request-date">
                        {new Date(cr.createdAt).toLocaleDateString("en-PH", { month: "short", day: "numeric" })}
                      </span>
                    </div>
                    <p className="change-request-note">{cr.note}</p>
                    <ChangeRequestFiles
                      orderId={orderId}
                      cr={cr}
                      role="customer"
                      user={user}
                      userName={profile?.fullName || user.email || "Customer"}
                      canUpload={cr.status === "pending" || cr.status === "quoted"}
                    />

                    {cr.status === "quoted" && (
                      <div className="change-request-quote-box">
                        <p className="change-request-quote-amount">
                          {cr.adjustmentAmount > 0 ? "Additional cost: +" : "Credit: −"}₱
                          {Math.abs(cr.adjustmentAmount).toLocaleString()}
                        </p>
                        {cr.adminResponse && <p className="change-request-admin-response">{cr.adminResponse}</p>}
                        <div className="change-request-quote-actions">
                          <button
                            className="btn btn-approve"
                            onClick={() => handleAcceptChange(cr.id)}
                            disabled={resolvingId === cr.id}
                          >
                            Accept
                          </button>
                          <button
                            className="btn btn-secondary"
                            onClick={() => handleRejectChange(cr.id)}
                            disabled={resolvingId === cr.id}
                          >
                            Decline — keep current order
                          </button>
                        </div>
                      </div>
                    )}

                    {cr.status === "accepted" && (
                      <p className="change-request-resolved-note">
                        ✓ Accepted — {cr.adjustmentAmount > 0 ? "+" : "−"}₱
                        {Math.abs(cr.adjustmentAmount).toLocaleString()} applied to your order total.
                      </p>
                    )}
                    {cr.status === "rejected" && (
                      <p className="change-request-resolved-note">You declined this change. Your order was unaffected.</p>
                    )}
                    {cr.status === "declined_by_admin" && cr.adminResponse && (
                      <p className="change-request-resolved-note change-request-resolved-note-declined">
                        {cr.adminResponse}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* How it works sidebar */}
          <div className="ticket-sidebar">
            <h4>How it works:</h4>
            <div className="how-it-works-step">
              <span className="how-it-works-num">1</span>
              <div>
                <strong>Accept &amp; pay</strong>
                <p>Accept the quotation, then pay the deposit by bank deposit within {DEPOSIT_WINDOW_DAYS} days.</p>
              </div>
            </div>
            <div className="how-it-works-step">
              <span className="how-it-works-num">2</span>
              <div>
                <strong>In Production</strong>
                <p>We craft your modular pieces.</p>
              </div>
            </div>
            <div className="how-it-works-step">
              <span className="how-it-works-num">3</span>
              <div>
                <strong>Ready for Delivery</strong>
                <p>We schedule installation, then turn over. The last 10% is paid at turnover.</p>
              </div>
            </div>
          </div>
        </div>
        )}
      </div>

      {/* Payment modal */}
      {showPaymentModal && (
        <div className="modal-overlay" onClick={() => !submittingPayment && setShowPaymentModal(false)}>
          <div className="modal-card payment-modal" onClick={(e) => e.stopPropagation()}>
            <h3>Pay your deposit</h3>
            <p className="payment-modal-amount">
              Amount due: <strong>₱{depositAmount.toLocaleString()}</strong>
            </p>

            <div className="payment-instructions">
              <p>Deposit the amount to this bank account:</p>
              <p className="payment-detail-line">
                <strong>{PAYMENT_METHODS.bank.label}</strong>
              </p>
              <p className="payment-detail-line">
                Account name: <strong>{PAYMENT_METHODS.bank.name}</strong>
              </p>
              <p className="payment-detail-line">
                Account number: <strong>{PAYMENT_METHODS.bank.accountNumber}</strong>
              </p>
              <p className="payment-instructions-note">
                After depositing, fill in the details below. Attach a photo or
                screenshot of your deposit slip or online transfer receipt so our
                team can match it to your order.
              </p>
            </div>

            <form onSubmit={handleSubmitPayment}>
              <label>
                Reference or deposit slip number
                <input
                  value={paymentReference}
                  onChange={(e) => setPaymentReference(e.target.value)}
                  placeholder="e.g. 1234 5678 9012"
                  required
                />
              </label>

              <label>
                Photos of your deposit slip or receipt (up to {MAX_RECEIPT_FILES})
                <input
                  type="file"
                  accept="image/*"
                  multiple
                  onChange={handleProofFilesChange}
                />
              </label>

              {proofFiles.length > 0 && (
                <div className="receipt-previews">
                  {proofFiles.map((f, i) => (
                    <div className="receipt-preview" key={f.name + i}>
                      <img src={URL.createObjectURL(f)} alt={f.name} />
                      <button
                        type="button"
                        onClick={() => setProofFiles((p) => p.filter((_, j) => j !== i))}
                        aria-label={`Remove ${f.name}`}
                        disabled={submittingPayment}
                      >
                        ✕
                      </button>
                    </div>
                  ))}
                </div>
              )}

              {proofError && <p className="form-error">{proofError}</p>}

              <div className="admin-form-actions">
                <button type="submit" className="btn btn-primary" disabled={submittingPayment}>
                  {submittingPayment ? "Submitting…" : "Submit Payment"}
                </button>
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => {
                    setShowPaymentModal(false);
                    resetPaymentForm();
                  }}
                  disabled={submittingPayment}
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      <Footer />
    </div>
  );
}