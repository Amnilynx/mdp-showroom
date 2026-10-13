import { useEffect, useState } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import Navbar from "../../components/Navbar";
import Footer from "../../components/Footer";
import Breadcrumb from "../../components/Breadcrumb";
import StepProgress from "../../components/StepProgress";
import ChatThread from "../../components/ChatThread";
import ProofImage from "../../components/ProofImage";
import { useAuth } from "../../context/AuthContext";
import {
  getOrderById,
  customerSubmitPayment,
  addChangeRequest,
  acceptChangeRequest,
  rejectChangeRequest,
  cancelOrder,
  getPayableTotal,
  ORDER_STATUSES,
  STATUS_LABELS,
  PAYMENT_METHODS,
  POST_PRODUCTION_STATUSES,
  CHANGE_REQUEST_LABELS,
} from "../../lib/orders";
import { compressImageToDataUrl } from "../../lib/imageCompress";
import { generateOrderReceipt } from "../../lib/invoicePdf";

// Cancellation only makes sense before a deposit is paid and production
// starts — once the order is "approved" (deposit submitted) or further
// along, the customer can no longer self-cancel (they'd need to contact
// the team directly, e.g. via Messages).
const CANCELLABLE_STATUSES = ["request_received", "under_review", "est_price_issued"];

export default function OrderTicket() {
  const { orderId } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [order, setOrder] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [actionBusy, setActionBusy] = useState(false);
  const [activeTab, setActiveTab] = useState("details");

  // Payment modal state
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState("gcash");
  const [paymentReference, setPaymentReference] = useState("");
  const [proofFile, setProofFile] = useState(null);
  const [proofPreview, setProofPreview] = useState("");
  const [proofError, setProofError] = useState("");
  const [submittingPayment, setSubmittingPayment] = useState(false);

  // Request Changes form state
  const [showChangeForm, setShowChangeForm] = useState(false);
  const [changeNote, setChangeNote] = useState("");
  const [submittingChange, setSubmittingChange] = useState(false);
  const [changeError, setChangeError] = useState("");
  const [changeSent, setChangeSent] = useState(false);
  const [resolvingId, setResolvingId] = useState(null); // change-request id currently being accepted/rejected

  async function load() {
    setLoading(true);
    setError("");
    try {
      const data = await getOrderById(orderId);
      if (!data) {
        setError("Order not found.");
      } else {
        setOrder(data);
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

  async function handleProofFileChange(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    setProofError("");
    try {
      const compressed = await compressImageToDataUrl(file);
      setProofFile(file);
      setProofPreview(compressed);
    } catch (err) {
      setProofError(err.message || "Couldn't process that image.");
      setProofFile(null);
      setProofPreview("");
    }
  }

  function resetPaymentForm() {
    setPaymentMethod("gcash");
    setPaymentReference("");
    setProofFile(null);
    setProofPreview("");
    setProofError("");
  }

  async function handleSubmitPayment(e) {
    e.preventDefault();
    if (!paymentReference.trim()) {
      setProofError("Please enter the reference number from your receipt.");
      return;
    }
    if (!proofPreview) {
      setProofError("Please attach a screenshot of your payment receipt.");
      return;
    }
    setSubmittingPayment(true);
    try {
      await customerSubmitPayment(orderId, {
        paymentMethod,
        paymentReference: paymentReference.trim(),
        paymentProofImage: proofPreview,
      });
      setShowPaymentModal(false);
      resetPaymentForm();
      await load();
    } catch (err) {
      setProofError("Something went wrong submitting your payment. Please try again.");
    } finally {
      setSubmittingPayment(false);
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

  async function handleSubmitChangeRequest(e) {
    e.preventDefault();
    if (!changeNote.trim()) {
      setChangeError("Please describe the change you'd like.");
      return;
    }
    setChangeError("");
    setSubmittingChange(true);
    try {
      await addChangeRequest(orderId, user.uid, changeNote.trim());
      setChangeNote("");
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
  const depositAmount = order.finalDepositAmount ?? order.depositAmount ?? 0;

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
            className={"ticket-tab" + (activeTab === "messages" ? " ticket-tab-active" : "")}
            onClick={() => setActiveTab("messages")}
          >
            💬 Messages
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

            {/* Selected configurations */}
            <div className="ticket-card">
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
              {!order.finalPrice && (
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
                  <tr className="ticket-price-total-row">
                    <td>
                      {order.finalPrice
                        ? "Confirmed Total"
                        : "Provisional Total (estimate)"}
                    </td>
                    <td>
                      ₱
                      {(order.finalPrice ?? order.provisionalTotal).toLocaleString()}
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
                      50% deposit {order.finalPrice ? "to approve" : "(pending confirmation)"}
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
                  {PAYMENT_METHODS[order.paymentMethod]?.label || order.paymentMethod} ·
                  Ref: <strong>{order.paymentReference}</strong>
                </p>
                <p className={order.depositConfirmed ? "payment-verified-note" : "payment-pending-note"}>
                  {order.depositConfirmed
                    ? "✓ Verified by our team."
                    : "Awaiting verification by our team — this usually takes a few hours."}
                </p>
              </div>
            )}

            {!isTerminal && (
              <div className="ticket-actions">
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
                  {order.paymentReference ? "Resubmit Payment" : "Approve & Pay Deposit"}
                </button>
                <button
                  className="btn btn-secondary"
                  onClick={() => setShowChangeForm((v) => !v)}
                  disabled={actionBusy}
                >
                  Request Changes
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
                <form onSubmit={handleSubmitChangeRequest}>
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
                  {changeError && <p className="form-error">{changeError}</p>}
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

                    {cr.proof && (
                      <div className="change-request-proof-block">
                        <p className="change-request-proof-label">
                          Proof of {cr.adjustmentAmount < 0 ? "refund" : "deduction"} from MDP:
                        </p>
                        {cr.proof.referenceNumber && (
                          <p className="payment-detail-line">Ref: <strong>{cr.proof.referenceNumber}</strong></p>
                        )}
                        {cr.proof.note && <p className="change-request-proof-note">{cr.proof.note}</p>}
                        <ProofImage
                          src={cr.proof.screenshotBase64}
                          alt="Proof of refund/deduction"
                          fileName={`${orderId}_${cr.id}_proof.jpg`}
                        />
                      </div>
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
                <strong>Approve</strong>
                <p>Confirm your design and pay the deposit.</p>
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
                <p>We schedule installation at your home.</p>
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

            <div className="payment-method-tabs">
              {Object.entries(PAYMENT_METHODS).map(([key, m]) => (
                <button
                  key={key}
                  type="button"
                  className={"payment-method-tab" + (paymentMethod === key ? " payment-method-tab-active" : "")}
                  onClick={() => setPaymentMethod(key)}
                >
                  {m.label}
                </button>
              ))}
            </div>

            <div className="payment-instructions">
              {paymentMethod === "gcash" ? (
                <>
                  <p>Send your deposit via GCash to:</p>
                  <p className="payment-detail-line">
                    <strong>{PAYMENT_METHODS.gcash.name}</strong>
                  </p>
                  <p className="payment-detail-line">
                    {PAYMENT_METHODS.gcash.number}
                  </p>
                </>
              ) : (
                <>
                  <p>Send your deposit via bank transfer to:</p>
                  <p className="payment-detail-line">
                    <strong>{PAYMENT_METHODS.bank.name}</strong>
                  </p>
                  <p className="payment-detail-line">
                    {PAYMENT_METHODS.bank.accountNumber}
                  </p>
                </>
              )}
              <p className="payment-instructions-note">
                After sending, fill in the details below so our team can
                verify it against your order.
              </p>
            </div>

            <form onSubmit={handleSubmitPayment}>
              <label>
                Reference number (from your receipt)
                <input
                  value={paymentReference}
                  onChange={(e) => setPaymentReference(e.target.value)}
                  placeholder="e.g. 1234 5678 9012"
                  required
                />
              </label>

              <label>
                Screenshot of your receipt
                <input
                  type="file"
                  accept="image/*"
                  onChange={handleProofFileChange}
                />
              </label>

              {proofPreview && (
                <img src={proofPreview} alt="Payment proof preview" className="payment-proof-preview" />
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