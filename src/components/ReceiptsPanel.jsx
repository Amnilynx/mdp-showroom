import { useEffect, useMemo, useState } from "react";
import { checkImageFiles } from "../lib/validators";
import ProofImage from "./ProofImage";
import { getPaymentSummary } from "../lib/refunds";
import {
  addReceipt,
  updateReceipt,
  deleteReceipt,
  confirmReceipt,
  buildReceiptEntries,
  MAX_RECEIPT_FILES,
  RECEIPT_KIND_LABELS,
  RECEIPT_KIND_FROM,
} from "../lib/receipts";

// Payments the CUSTOMER sends (MDP verifies them) versus receipts MDP issues
// (the customer confirms them). billing_payment is verified from the Billing card.
const isCustomerKind = (k) => k === "deposit_payment" || k === "billing_payment";

const peso = (n) => "₱" + Math.abs(n).toLocaleString();

function fmtDate(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  return isNaN(d) ? "" : d.toLocaleString("en-PH", { dateStyle: "medium", timeStyle: "short" });
}

// Thumbnail of a File the person just picked (and frees its blob URL).
function FileThumb({ file, onRemove, disabled }) {
  const url = useMemo(() => URL.createObjectURL(file), [file]);
  useEffect(() => () => URL.revokeObjectURL(url), [url]);
  return (
    <div className="receipt-preview">
      <img src={url} alt={file.name} />
      <button type="button" onClick={onRemove} disabled={disabled} aria-label={`Remove ${file.name}`}>
        ✕
      </button>
    </div>
  );
}

// Add / edit form. `initial` is set when editing an existing receipt.
function ReceiptForm({ initial, allowedKinds, onSave, onCancel, busy, error }) {
  const editing = Boolean(initial);
  const [kind, setKind] = useState(initial?.kind || allowedKinds[0]);
  const [amount, setAmount] = useState(initial ? String(initial.amount || "") : "");
  const [reference, setReference] = useState(initial?.referenceNumber || "");
  const [note, setNote] = useState(initial?.note || "");
  const [keep, setKeep] = useState(initial?.images || []);
  const [files, setFiles] = useState([]);
  const [localError, setLocalError] = useState("");

  const total = keep.length + files.length;
  const showAmount = !isCustomerKind(kind);

  async function pick(e) {
    const picked = Array.from(e.target.files || []);
    e.target.value = "";
    if (!picked.length) return;
    if (total + picked.length > MAX_RECEIPT_FILES) {
      setLocalError(`You can attach up to ${MAX_RECEIPT_FILES} images per receipt.`);
      return;
    }
    const problem = await checkImageFiles(picked);
    if (problem) {
      setLocalError(problem);
      return;
    }
    setLocalError("");
    setFiles((p) => [...p, ...picked]);
  }

  function submit(e) {
    e.preventDefault();
    onSave({ kind, amount, referenceNumber: reference, note, keepImages: keep, newFiles: files });
  }

  return (
    <form className="receipt-form" onSubmit={submit}>
      {!editing && allowedKinds.length > 1 && (
        <label>
          Type
          <select value={kind} onChange={(e) => setKind(e.target.value)}>
            <option value="refund">Refund sent to customer</option>
            <option value="deduction">Deduction proof</option>
          </select>
        </label>
      )}
      {showAmount && (
        <label>
          Amount (₱){kind === "refund" ? "" : " — optional"}
          <input type="number" min="0" value={amount} onChange={(e) => setAmount(e.target.value)} />
        </label>
      )}
      <label>
        Reference number
        <input value={reference} onChange={(e) => setReference(e.target.value)} />
      </label>

      <div className="receipt-form-field">
        <span className="receipt-form-label">
          Images ({total}/{MAX_RECEIPT_FILES})
        </span>
        {(keep.length > 0 || files.length > 0) && (
          <div className="receipt-previews">
            {keep.map((src, i) => (
              <div className="receipt-preview" key={"k" + i}>
                <img src={src} alt={`Current image ${i + 1}`} />
                <button
                  type="button"
                  onClick={() => setKeep((p) => p.filter((_, j) => j !== i))}
                  disabled={busy}
                  aria-label="Remove image"
                >
                  ✕
                </button>
              </div>
            ))}
            {files.map((f, i) => (
              <FileThumb
                key={f.name + i + f.size}
                file={f}
                disabled={busy}
                onRemove={() => setFiles((p) => p.filter((_, j) => j !== i))}
              />
            ))}
          </div>
        )}
        {total < MAX_RECEIPT_FILES && (
          <input type="file" accept="image/*" multiple onChange={pick} disabled={busy} />
        )}
      </div>

      <label>
        Note (optional)
        <input value={note} placeholder="e.g. refunded by bank transfer" onChange={(e) => setNote(e.target.value)} />
      </label>

      {(localError || error) && <p className="form-error">{localError || error}</p>}

      <div className="receipt-form-actions">
        <button className="btn btn-primary btn-small" type="submit" disabled={busy}>
          {busy ? "Saving…" : editing ? "Save changes" : "Save receipt"}
        </button>
        <button className="btn btn-secondary btn-small" type="button" onClick={onCancel} disabled={busy}>
          Cancel
        </button>
      </div>
    </form>
  );
}

// ONE place for every proof on an order: the customer's deposit payment
// screenshots, refund receipts, and deduction proof. Shown on both the
// admin and customer order pages as a single expandable card; each receipt
// inside it expands on its own.
//
// Who can do what:
//   Customer's deposit payment   customer edits it  -> admin verifies it (locks it)
//   MDP's refund / deduction     admin edits/deletes -> customer confirms receipt (locks it)
// Once the other side confirms, the issuer can no longer change or delete it.
//
//   role="admin" | "customer"
//   onVerifyDeposit(): admin's verify / un-verify of the deposit (OrderDetail)
export default function ReceiptsPanel({ order, orderId, receipts = [], role, userId, onVerifyDeposit }) {
  const isAdmin = role === "admin";
  const s = getPaymentSummary(order, receipts);
  const entries = buildReceiptEntries(order, receipts);

  const [adding, setAdding] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [workingId, setWorkingId] = useState(null);

  // What does THIS viewer still have to do with an entry?
  const needsMyAction = (e) =>
    e.source === "doc" &&
    !e.confirmed &&
    (isAdmin ? isCustomerKind(e.kind) : !isCustomerKind(e.kind));
  const openByDefault = (e) => needsMyAction(e);
  const pendingForMe = entries.filter(needsMyAction).length;

  async function run(fn) {
    setBusy(true);
    setError("");
    try {
      await fn();
      return true;
    } catch (err) {
      setError(err?.message || "Something went wrong. Please try again.");
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function handleAdd(payload) {
    const ok = await run(() =>
      addReceipt(orderId, {
        kind: payload.kind,
        amount: payload.amount,
        referenceNumber: payload.referenceNumber,
        note: payload.note,
        files: payload.newFiles,
        createdBy: userId,
      })
    );
    if (ok) setAdding(false);
  }

  async function handleEdit(entry, payload) {
    const ok = await run(() => updateReceipt(orderId, entry.id, { ...payload, kind: entry.kind }));
    if (ok) setEditingId(null);
  }

  async function handleDelete(entry) {
    if (!window.confirm("Delete this receipt? This can't be undone.")) return;
    setWorkingId(entry.id);
    await run(() => deleteReceipt(orderId, entry.id));
    setWorkingId(null);
  }

  async function handleConfirm(entry) {
    setWorkingId(entry.id);
    await run(() => confirmReceipt(orderId, entry.raw, userId));
    setWorkingId(null);
  }

  async function handleVerify() {
    setWorkingId("verify");
    await run(async () => {
      await onVerifyDeposit?.();
    });
    setWorkingId(null);
  }

  function statusBadge(e) {
    if (isCustomerKind(e.kind)) {
      return e.confirmed ? (
        <span className="receipt-badge receipt-badge-ok">✓ Verified</span>
      ) : (
        <span className="receipt-badge receipt-badge-pending">Awaiting verification</span>
      );
    }
    if (e.source === "legacy") return null;
    if (e.confirmed) {
      return <span className="receipt-badge receipt-badge-ok">✓ Received by customer</span>;
    }
    return isAdmin ? (
      <span className="receipt-badge receipt-badge-pending">Awaiting customer</span>
    ) : (
      <span className="receipt-badge receipt-badge-due">Please confirm</span>
    );
  }

  // Nothing to show to a customer until something exists or is owed.
  if (!isAdmin && entries.length === 0 && s.refundDue <= 0) return null;

  return (
    <details className="ticket-card receipts-card" open={entries.length > 0 || isAdmin}>
      <summary className="receipts-card-summary">
        <h4>
          Receipts <span className="receipts-count">{entries.length}</span>
        </h4>
        {pendingForMe > 0 && (
          <span className="receipt-badge receipt-badge-pending">
            {pendingForMe} need{pendingForMe === 1 ? "s" : ""} your {isAdmin ? "verification" : "confirmation"}
          </span>
        )}
        {s.refundDue > 0 && <span className="receipt-badge receipt-badge-due">Refund {peso(s.refundDue)} due</span>}
      </summary>

      <div className="receipts-body">
        {s.refundDue > 0 && (
          <p className="receipts-due-note">
            {isAdmin
              ? `${peso(s.refundDue)} still has to be sent back to the customer. Add the refund receipt below once it's sent.`
              : `${peso(s.refundDue)} is being refunded to you. The receipt will appear here once it's been sent.`}
          </p>
        )}

        {entries.length === 0 && <p className="receipts-empty">No receipts yet.</p>}

        {entries.map((e) => {
          const isDoc = e.source === "doc";
          const adminOwns = isDoc && !isCustomerKind(e.kind);
          const canEdit = !e.confirmed && isDoc && (isAdmin ? adminOwns : isCustomerKind(e.kind));
          const canDelete = !e.confirmed && isAdmin && adminOwns;
          const canVerify = isAdmin && isDoc && e.kind === "deposit_payment";
          const canConfirm = !isAdmin && isDoc && !isCustomerKind(e.kind) && !e.confirmed;
          const isEditing = editingId === e.id;

          return (
            <details className="receipt-entry" key={e.id} open={openByDefault(e) || isEditing}>
              <summary>
                <span className={"receipt-kind receipt-kind-" + e.kind}>{RECEIPT_KIND_LABELS[e.kind]}</span>
                <span className="receipt-from">{RECEIPT_KIND_FROM[e.kind]}</span>
                {statusBadge(e)}
                {e.amount > 0 && <span className="receipt-amount">{peso(e.amount)}</span>}
                <span className="receipt-date">{fmtDate(e.date)}</span>
              </summary>

              <div className="receipt-detail">
                {isEditing ? (
                  <ReceiptForm
                    initial={e}
                    allowedKinds={[e.kind]}
                    busy={busy}
                    error={error}
                    onSave={(payload) => handleEdit(e, payload)}
                    onCancel={() => {
                      setEditingId(null);
                      setError("");
                    }}
                  />
                ) : (
                  <>
                    {(e.methodLabel || e.referenceNumber) && (
                      <p className="receipt-ref">
                        {e.methodLabel && <strong>{e.methodLabel}</strong>}
                        {e.methodLabel && e.referenceNumber && " · "}
                        {e.referenceNumber && (
                          <>
                            Ref: <strong>{e.referenceNumber}</strong>
                          </>
                        )}
                      </p>
                    )}
                    {e.note && <p className="receipt-note">{e.note}</p>}
                    {e.images.length > 0 && (
                      <div className="receipt-images">
                        {e.images.map((src, i) => (
                          <ProofImage
                            key={i}
                            src={src}
                            alt={`${RECEIPT_KIND_LABELS[e.kind]} ${i + 1}`}
                            fileName={`${orderId}_${e.kind}_${i + 1}.jpg`}
                          />
                        ))}
                      </div>
                    )}

                    {e.confirmed && e.confirmedDate && isDoc && (
                      <p className="receipt-locked-note">
                        🔒{" "}
                        {isCustomerKind(e.kind)
                          ? "Verified by MDP"
                          : "Confirmed received by the customer"}{" "}
                        on {fmtDate(e.confirmedDate)}. It can no longer be changed.
                      </p>
                    )}

                    {canVerify && !e.confirmed && (
                      <p className="receipt-hint">
                        Check the reference and amount against your actual bank account, then verify.
                        Once verified, the customer can no longer change this receipt.
                      </p>
                    )}
                    {isAdmin && isDoc && e.kind === "billing_payment" && !e.confirmed && (
                      <p className="receipt-hint">
                        Check this against your bank account, then press Verify payment on that billing in the
                        Billing card.
                      </p>
                    )}
                    {canConfirm && (
                      <p className="receipt-hint">
                        Review the receipt above. Confirming tells MDP you received it, and locks it so it can
                        no longer be changed.
                      </p>
                    )}

                    {error && !isEditing && workingId === null && <p className="form-error">{error}</p>}

                    <div className="receipt-actions">
                      {canVerify && (
                        <button
                          type="button"
                          className={"btn btn-small " + (e.confirmed ? "btn-secondary" : "btn-primary")}
                          onClick={handleVerify}
                          disabled={busy || workingId === "verify"}
                        >
                          {e.confirmed ? "Undo verification" : "✓ Payment received — verify"}
                        </button>
                      )}
                      {canConfirm && (
                        <button
                          type="button"
                          className="btn btn-small btn-primary"
                          onClick={() => handleConfirm(e)}
                          disabled={busy || workingId === e.id}
                        >
                          ✓ I received this
                        </button>
                      )}
                      {canEdit && (
                        <button
                          type="button"
                          className="btn btn-small btn-secondary"
                          onClick={() => {
                            setEditingId(e.id);
                            setError("");
                          }}
                          disabled={busy}
                        >
                          Edit
                        </button>
                      )}
                      {canDelete && (
                        <button
                          type="button"
                          className="btn btn-small btn-cancel"
                          onClick={() => handleDelete(e)}
                          disabled={busy || workingId === e.id}
                        >
                          Delete
                        </button>
                      )}
                    </div>
                  </>
                )}
              </div>
            </details>
          );
        })}

        {isAdmin &&
          (adding ? (
            <ReceiptForm
              initial={null}
              allowedKinds={["refund", "deduction"]}
              busy={busy}
              error={error}
              onSave={handleAdd}
              onCancel={() => {
                setAdding(false);
                setError("");
              }}
            />
          ) : (
            <button
              className="btn btn-secondary btn-small receipts-add-btn"
              type="button"
              onClick={() => {
                setError("");
                setAdding(true);
              }}
            >
              + Add receipt
            </button>
          ))}
      </div>
    </details>
  );
}