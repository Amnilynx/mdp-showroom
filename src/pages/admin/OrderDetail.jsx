import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import AdminLayout from "../../components/AdminLayout";
import ChatThread from "../../components/ChatThread";
import ProofImage from "../../components/ProofImage";
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
  attachChangeRequestProof,
  confirmSiteVisit,
  clearSiteVisit,
  scheduleDelivery,
  clearScheduledDelivery,
  getPayableTotal,
  ORDER_STATUSES,
  TERMINAL_STATUSES,
  STATUS_LABELS,
  PAYMENT_METHODS,
  POST_PRODUCTION_STATUSES,
  CHANGE_REQUEST_LABELS,
} from "../../lib/orders";
import { compressImageToDataUrl } from "../../lib/imageCompress";
import { generateOrderReceipt } from "../../lib/invoicePdf";

const ALL_STATUSES = [...ORDER_STATUSES, ...TERMINAL_STATUSES];

export default function AdminOrderDetail() {
  const { orderId } = useParams();
  const { user } = useAuth();
  const navigate = useNavigate();

  const [order, setOrder] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [statusDraft, setStatusDraft] = useState("");
  const [codeDraft, setCodeDraft] = useState("");
  const [noteDraft, setNoteDraft] = useState("");
  const [priceDraft, setPriceDraft] = useState("");
  const [visitDateDraft, setVisitDateDraft] = useState("");
  const [deliveryDateDraft, setDeliveryDateDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [activeTab, setActiveTab] = useState("details");

  // Change-request quoting state — keyed by change request id so each row
  // in the tracker has its own independent draft.
  const [quoteDrafts, setQuoteDrafts] = useState({}); // { [crId]: { amount, response } }
  const [declineDrafts, setDeclineDrafts] = useState({}); // { [crId]: responseText }
  const [proofDrafts, setProofDrafts] = useState({}); // { [crId]: { referenceNumber, note, screenshotBase64 } }
  const [openProofFor, setOpenProofFor] = useState(null); // crId currently showing the proof-attach form
  const [crBusy, setCrBusy] = useState(null); // crId currently submitting

  async function load() {
    setLoading(true);
    setError("");
    try {
      const data = await getOrderById(orderId);
      if (!data) {
        setError("Order not found.");
      } else {
        setOrder(data);
        setStatusDraft(data.status);
        setCodeDraft(data.orderCode || "");
        setPriceDraft(data.finalPrice ?? data.provisionalTotal ?? "");
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

  async function handleStatusUpdate() {
    if (statusDraft === order.status) return;

    // Cancelling or rejecting is a hard stop for the order — if a deposit
    // was already paid, this is the moment admin needs to remember a real
    // refund is now owed to the customer. Worth a loud, specific warning
    // rather than treating this the same as any other status change.
    if (statusDraft === "cancelled" || statusDraft === "rejected") {
      const verb = statusDraft === "cancelled" ? "Cancel" : "Reject";
      const depositWarning = order.depositConfirmed
        ? `\n\n⚠ A deposit of ₱${(order.finalDepositAmount ?? order.depositAmount ?? 0).toLocaleString()} was already received and verified for this order. ${verb}ing it does NOT refund the customer automatically — you are responsible for processing that refund manually (GCash/bank transfer) outside this system.`
        : order.paymentReference
        ? `\n\nThe customer submitted a payment reference (${order.paymentReference}) that was not yet verified. If they did pay, you are responsible for refunding them manually.`
        : "";
      const confirmed = window.confirm(
        `${verb} this order?\n\nThis drops the order entirely and cannot be undone from here.${depositWarning}`
      );
      if (!confirmed) return;
    }

    setBusy(true);
    try {
      await updateOrderStatus(orderId, statusDraft);
      await load();
    } catch (err) {
      alert("Failed to update status.");
    } finally {
      setBusy(false);
    }
  }

  async function handleAssignCode() {
    if (!codeDraft.trim()) return;
    setBusy(true);
    try {
      await assignOrderCode(orderId, codeDraft.trim());
      await load();
    } catch (err) {
      alert("Failed to assign order code.");
    } finally {
      setBusy(false);
    }
  }

  async function handleConfirmVisit() {
    if (!visitDateDraft) return;
    setBusy(true);
    try {
      await confirmSiteVisit(orderId, visitDateDraft);
      await load();
    } catch (err) {
      alert("Failed to confirm site visit date.");
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
      alert("Failed to clear site visit date.");
    } finally {
      setBusy(false);
    }
  }

  async function handleScheduleDelivery() {
    if (!deliveryDateDraft) return;
    setBusy(true);
    try {
      await scheduleDelivery(orderId, deliveryDateDraft);
      await load();
    } catch (err) {
      alert("Failed to schedule delivery.");
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
      alert("Failed to clear delivery date.");
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
      alert("Failed to add note.");
    } finally {
      setBusy(false);
    }
  }

  async function handleToggleDeposit() {
    setBusy(true);
    try {
      if (order.depositConfirmed) {
        await unconfirmDeposit(orderId);
      } else {
        await confirmDeposit(orderId, user.uid);
      }
      await load();
    } catch (err) {
      alert("Failed to update deposit status.");
    } finally {
      setBusy(false);
    }
  }

  async function handleIssueFinalPrice() {
    const price = Number(priceDraft);
    if (!price || price <= 0) {
      alert("Enter a valid price.");
      return;
    }
    if (
      !window.confirm(
        `Issue ₱${price.toLocaleString()} as the final price? The customer will be asked to approve and pay a 50% deposit (₱${Math.round(
          price * 0.5
        ).toLocaleString()}) against this amount.`
      )
    )
      return;
    setBusy(true);
    try {
      await issueFinalPrice(orderId, price);
      await load();
    } catch (err) {
      alert("Failed to issue final price.");
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
    setCrBusy(cr.id);
    try {
      await quoteChangeRequest(orderId, cr.id, { adjustmentAmount: amount, adminResponse: draft.response || "" });
      setQuoteDrafts((d) => ({ ...d, [cr.id]: { amount: "", response: "" } }));
      await load();
    } catch (err) {
      alert("Failed to send quote.");
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
      alert("Failed to decline request.");
    } finally {
      setCrBusy(null);
    }
  }

  async function handleProofFileChange(crId, e) {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const compressed = await compressImageToDataUrl(file);
      setProofDrafts((d) => ({ ...d, [crId]: { ...d[crId], screenshotBase64: compressed } }));
    } catch (err) {
      alert(err.message || "Couldn't process that image.");
    }
  }

  async function handleAttachProof(cr) {
    const draft = proofDrafts[cr.id] || {};
    if (!draft.referenceNumber?.trim() && !draft.screenshotBase64) {
      alert("Add a reference number or a screenshot as proof.");
      return;
    }
    setCrBusy(cr.id);
    try {
      await attachChangeRequestProof(orderId, cr.id, {
        referenceNumber: draft.referenceNumber?.trim() || "",
        screenshotBase64: draft.screenshotBase64 || "",
        note: draft.note?.trim() || "",
      });
      setProofDrafts((d) => ({ ...d, [cr.id]: {} }));
      setOpenProofFor(null);
      await load();
    } catch (err) {
      alert("Failed to attach proof.");
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
      <div className="order-detail-layout">
        <div className="order-detail-main">
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

          {/* Configurations */}
          <div className="ticket-card">
            <h4>Configurations</h4>
            {order.configurations.map((c, i) => (
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
              <span>Provisional Total</span>
              <span>₱{order.provisionalTotal.toLocaleString()}</span>
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

                    {/* Proof of refund/deduction — relevant once a negative
                        (credit) adjustment was accepted, or at admin's
                        discretion for any resolved request. */}
                    {(cr.status === "accepted" || cr.status === "declined_by_admin") && (
                      <div className="change-request-proof-section">
                        {cr.proof ? (
                          <div className="change-request-proof-block">
                            <p className="change-request-proof-label">
                              Proof attached {cr.proof.submittedAt && `· ${new Date(cr.proof.submittedAt).toLocaleString("en-PH")}`}
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
                        ) : openProofFor === cr.id ? (
                          <div className="change-request-admin-form">
                            <input
                              placeholder="Reference number"
                              value={proofDrafts[cr.id]?.referenceNumber ?? ""}
                              onChange={(e) =>
                                setProofDrafts((d) => ({ ...d, [cr.id]: { ...d[cr.id], referenceNumber: e.target.value } }))
                              }
                            />
                            <input type="file" accept="image/*" onChange={(e) => handleProofFileChange(cr.id, e)} />
                            {proofDrafts[cr.id]?.screenshotBase64 && (
                              <img
                                src={proofDrafts[cr.id].screenshotBase64}
                                alt="Proof preview"
                                className="payment-proof-preview"
                              />
                            )}
                            <input
                              placeholder="Optional note (e.g. refunded via GCash)"
                              value={proofDrafts[cr.id]?.note ?? ""}
                              onChange={(e) =>
                                setProofDrafts((d) => ({ ...d, [cr.id]: { ...d[cr.id], note: e.target.value } }))
                              }
                            />
                            <div className="admin-form-actions">
                              <button
                                className="btn btn-primary"
                                onClick={() => handleAttachProof(cr)}
                                disabled={crBusy === cr.id}
                              >
                                Attach Proof
                              </button>
                              <button className="btn btn-secondary" onClick={() => setOpenProofFor(null)}>
                                Close
                              </button>
                            </div>
                          </div>
                        ) : (
                          <button className="btn btn-secondary btn-small" onClick={() => setOpenProofFor(cr.id)}>
                            + Attach proof of refund/deduction
                          </button>
                        )}
                      </div>
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
              System estimate: ₱{order.provisionalTotal?.toLocaleString()}
            </p>
            <div className="inline-form-row">
              <input
                type="number"
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
                ₱{(order.finalDepositAmount ?? order.depositAmount)?.toLocaleString()}
              </p>

              {order.paymentReference ? (
                <div className="payment-proof-block">
                  <p className="payment-detail-line">
                    <strong>{PAYMENT_METHODS[order.paymentMethod]?.label || order.paymentMethod}</strong>
                    {" "}· Ref: <strong>{order.paymentReference}</strong>
                  </p>
                  {order.paymentSubmittedAt?.toDate && (
                    <p className="deposit-timestamp">
                      Submitted {order.paymentSubmittedAt.toDate().toLocaleString("en-PH")}
                    </p>
                  )}
                  <ProofImage
                    src={order.paymentProofImage}
                    alt="Payment proof"
                    fileName={`${orderId}_payment_proof.jpg`}
                  />
                  <p className="deposit-note">
                    Check this reference/amount against your actual GCash or
                    bank account before marking it verified below.
                  </p>
                </div>
              ) : (
                <p className="deposit-note">
                  Customer hasn't submitted payment proof yet.
                </p>
              )}

              <label className="checkbox-label deposit-checkbox">
                <input
                  type="checkbox"
                  checked={!!order.depositConfirmed}
                  onChange={handleToggleDeposit}
                  disabled={busy}
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
                    ? `A verified deposit of ₱${(order.finalDepositAmount ?? order.depositAmount ?? 0).toLocaleString()} was already received. You must refund the customer manually — this system does not process refunds.`
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
          </div>
        </div>
      </div>
      )}
    </AdminLayout>
  );
}