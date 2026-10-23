import { db } from "./firebase";
import {
  collection,
  doc,
  addDoc,
  updateDoc,
  deleteDoc,
  getDocs,
  onSnapshot,
  query,
  orderBy,
  serverTimestamp,
} from "firebase/firestore";
import { sendSystemMessage } from "./messages";
import { paymentMethodLabel } from "./orders";

// Receipts — every piece of payment proof on an order, in one place:
//   deposit_payment  the customer's payment screenshot(s) + reference number
//   billing_payment  the customer's proof for one progress / final billing
//                    (carries billingId, see order.billings in lib/orders.js)
//   refund           money MDP sent back to the customer (receipt)
//   deduction        proof that an accepted deduction was applied
//
// New receipts are stored as their own documents:
//   orders/{orderId}/receipts/{receiptId}
// (not inside the order document, so several screenshots per receipt can't
// push the order past Firestore's 1 MiB document limit). Receipts saved
// the old way — order.paymentProofImage, order.refunds[], and
// changeRequests[].proof — are still read and merged in by
// buildReceiptEntries() so nothing already recorded disappears.

export const MAX_RECEIPT_FILES = 5;

// Total base64 size allowed for all images in ONE receipt document. Kept
// under 1 MiB with room for the other fields.
const TOTAL_IMAGE_BUDGET = 800000;

export const RECEIPT_KIND_LABELS = {
  deposit_payment: "Deposit payment",
  billing_payment: "Billing payment",
  refund: "Refund",
  deduction: "Deduction proof",
};

export const RECEIPT_KIND_FROM = {
  deposit_payment: "from customer",
  billing_payment: "from customer",
  refund: "from MDP",
  deduction: "from MDP",
};

// Shrinks one image until its data URL fits `maxChars`, trying smaller
// sizes and lower JPEG quality in turn. Payment screenshots stay readable
// (reference numbers, amounts) at the smallest setting.
function compressImageToBudget(file, maxChars) {
  return new Promise((resolve, reject) => {
    if (!file.type.startsWith("image/")) {
      reject(new Error(`"${file.name}" isn't an image.`));
      return;
    }
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Couldn't read the file."));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error(`Couldn't read "${file.name}".`));
      img.onload = () => {
        let last = "";
        for (const maxDim of [1000, 800, 640, 480]) {
          for (const quality of [0.7, 0.55, 0.4]) {
            let { width, height } = img;
            const longest = Math.max(width, height);
            if (longest > maxDim) {
              const scale = maxDim / longest;
              width = Math.round(width * scale);
              height = Math.round(height * scale);
            }
            const canvas = document.createElement("canvas");
            canvas.width = width;
            canvas.height = height;
            const ctx = canvas.getContext("2d");
            ctx.fillStyle = "#ffffff"; // flatten transparency (PNG screenshots)
            ctx.fillRect(0, 0, width, height);
            ctx.drawImage(img, 0, 0, width, height);
            last = canvas.toDataURL("image/jpeg", quality);
            if (last.length <= maxChars) {
              resolve(last);
              return;
            }
          }
        }
        resolve(last); // smallest we can do; addReceipt checks the total
      };
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  });
}

// Saves one receipt (with up to 5 images). `notify` posts a short notice
// in the order chat for receipts the customer needs to know about.
export async function addReceipt(
  orderId,
  { kind, amount, referenceNumber, note, files = [], createdBy, notify = true, billingId = null }
) {
  if (files.length > MAX_RECEIPT_FILES) {
    throw new Error(`You can attach up to ${MAX_RECEIPT_FILES} images per receipt.`);
  }
  const amt = Number(amount) || 0;
  if (kind === "refund" && amt <= 0) {
    throw new Error("Enter the amount that was refunded.");
  }
  if (!referenceNumber?.trim() && files.length === 0) {
    throw new Error("Add a reference number or at least one image of the receipt.");
  }

  const perImage = files.length ? Math.floor(TOTAL_IMAGE_BUDGET / files.length) : 0;
  const images = await Promise.all(files.map((f) => compressImageToBudget(f, perImage)));
  if (images.reduce((n, s) => n + s.length, 0) > TOTAL_IMAGE_BUDGET + 40000) {
    throw new Error("Those images are too large to store. Try fewer or smaller screenshots.");
  }

  await addDoc(collection(db, "orders", orderId, "receipts"), {
    kind,
    amount: amt,
    referenceNumber: referenceNumber?.trim() || "",
    note: note?.trim() || "",
    images,
    ...(billingId ? { billingId } : {}),
    createdBy,
    createdAt: serverTimestamp(),
  });

  if (notify) {
    try {
      if (kind === "refund") {
        await sendSystemMessage(
          orderId,
          `A refund of ₱${amt.toLocaleString()} has been processed. Please check Receipts on your order page and confirm that you received it.`
        );
      } else if (kind === "deduction") {
        await sendSystemMessage(
          orderId,
          "Proof of a deduction was added under Receipts on your order page. Please check it and confirm."
        );
      }
    } catch (err) {
      console.error("Failed to post receipt system message:", err);
    }
  }
}

function mapReceipt(d) {
  // "estimate" gives a usable time for writes the server hasn't stamped yet.
  const data = d.data({ serverTimestamps: "estimate" });
  const iso = (t) => (t?.toDate ? t.toDate().toISOString() : null);
  return {
    id: d.id,
    ...data,
    date: iso(data.createdAt),
    confirmed: Boolean(data.confirmedAt),
    confirmedDate: iso(data.confirmedAt),
  };
}

export async function getReceipts(orderId) {
  const q = query(
    collection(db, "orders", orderId, "receipts"),
    orderBy("createdAt", "desc")
  );
  const snap = await getDocs(q);
  return snap.docs.map(mapReceipt);
}

// Live listeners — both sides of an order see receipts (and the order's
// status) change the moment the other side acts, no refresh needed.
export function subscribeToReceipts(orderId, callback) {
  const q = query(
    collection(db, "orders", orderId, "receipts"),
    orderBy("createdAt", "desc")
  );
  return onSnapshot(
    q,
    (snap) => callback(snap.docs.map(mapReceipt)),
    (err) => console.error("Receipts listener failed:", err)
  );
}

export function subscribeToOrder(orderId, callback) {
  return onSnapshot(
    doc(db, "orders", orderId),
    (snap) => {
      if (snap.exists()) callback({ id: snap.id, ...snap.data() });
    },
    (err) => console.error("Order listener failed:", err)
  );
}

// ---- Editing, deleting and confirming ----
//
// A receipt can be changed or deleted by whoever issued it until the OTHER
// side has seen it and confirmed it:
//   refund / deduction (from MDP)   -> the customer confirms "I received this"
//   deposit_payment (from customer) -> MDP verifies the payment
// Once confirmed it is locked for the issuer. This is enforced in the
// Firestore rules too, not just hidden in the UI.

export async function updateReceipt(
  orderId,
  receiptId,
  { kind, amount, referenceNumber, note, keepImages = [], newFiles = [] }
) {
  const total = keepImages.length + newFiles.length;
  if (total > MAX_RECEIPT_FILES) {
    throw new Error(`You can attach up to ${MAX_RECEIPT_FILES} images per receipt.`);
  }
  if (!referenceNumber?.trim() && total === 0) {
    throw new Error("Add a reference number or at least one image of the receipt.");
  }
  if (kind === "refund" && !(Number(amount) > 0)) {
    throw new Error("Enter the amount that was refunded.");
  }

  const keptSize = keepImages.reduce((n, s) => n + s.length, 0);
  let added = [];
  if (newFiles.length) {
    const perImage = Math.floor((TOTAL_IMAGE_BUDGET - keptSize) / newFiles.length);
    if (perImage < 40000) {
      throw new Error("There isn't room for more images. Remove one first.");
    }
    added = await Promise.all(newFiles.map((f) => compressImageToBudget(f, perImage)));
  }

  const update = {
    referenceNumber: referenceNumber?.trim() || "",
    note: note?.trim() || "",
    images: [...keepImages, ...added],
    updatedAt: serverTimestamp(),
  };
  if (kind !== "deposit_payment") update.amount = Number(amount) || 0;
  await updateDoc(doc(db, "orders", orderId, "receipts", receiptId), update);

  // The order keeps the customer's reference too (the admin's verify check
  // reads it), so keep the two in step.
  if (kind === "deposit_payment" && update.referenceNumber) {
    await updateDoc(doc(db, "orders", orderId), {
      paymentReference: update.referenceNumber,
    });
  }
}

export async function deleteReceipt(orderId, receiptId) {
  await deleteDoc(doc(db, "orders", orderId, "receipts", receiptId));
}

// The customer confirms they received a refund / deduction receipt.
export async function confirmReceipt(orderId, receipt, uid) {
  await updateDoc(doc(db, "orders", orderId, "receipts", receipt.id), {
    confirmedBy: uid,
    confirmedAt: serverTimestamp(),
  });
  try {
    const what = receipt.kind === "refund" ? "refund" : "deduction";
    const amt = receipt.amount > 0 ? ` of ₱${Number(receipt.amount).toLocaleString()}` : "";
    await sendSystemMessage(orderId, `The customer confirmed receiving the ${what}${amt}.`);
  } catch (err) {
    console.error("Failed to post receipt-confirmed message:", err);
  }
}

// MDP verifying / un-verifying the deposit also locks / unlocks the
// customer's payment receipts.
export async function confirmDepositReceipts(orderId, receipts, uid) {
  await Promise.all(
    receipts
      .filter((r) => r.kind === "deposit_payment" && !r.confirmed)
      .map((r) =>
        updateDoc(doc(db, "orders", orderId, "receipts", r.id), {
          confirmedBy: uid,
          confirmedAt: serverTimestamp(),
        })
      )
  );
}

export async function clearDepositReceiptConfirmations(orderId, receipts) {
  await Promise.all(
    receipts
      .filter((r) => r.kind === "deposit_payment" && r.confirmed)
      .map((r) =>
        updateDoc(doc(db, "orders", orderId, "receipts", r.id), {
          confirmedBy: null,
          confirmedAt: null,
        })
      )
  );
}

// MDP verifying / un-verifying ONE billing locks / unlocks the customer's
// receipts for it.
export async function confirmBillingReceipts(orderId, receipts, billingId, uid) {
  await Promise.all(
    receipts
      .filter((r) => r.kind === "billing_payment" && r.billingId === billingId && !r.confirmed)
      .map((r) =>
        updateDoc(doc(db, "orders", orderId, "receipts", r.id), {
          confirmedBy: uid,
          confirmedAt: serverTimestamp(),
        })
      )
  );
}

export async function clearBillingReceiptConfirmations(orderId, receipts, billingId) {
  await Promise.all(
    receipts
      .filter((r) => r.kind === "billing_payment" && r.billingId === billingId && r.confirmed)
      .map((r) =>
        updateDoc(doc(db, "orders", orderId, "receipts", r.id), {
          confirmedBy: null,
          confirmedAt: null,
        })
      )
  );
}

// One flat, newest-first list for the UI: new receipt documents plus
// anything recorded the old way on the order itself.
export function buildReceiptEntries(order, receipts = []) {
  const entries = receipts.map((r) => ({
    source: "doc",
    raw: r,
    confirmed: Boolean(r.confirmed),
    confirmedDate: r.confirmedDate || null,
    createdBy: r.createdBy,
    id: r.id,
    kind: r.kind,
    amount: r.amount || 0,
    referenceNumber: r.referenceNumber || "",
    note: r.note || "",
    images: r.images || [],
    billingId: r.billingId || null,
    date: r.date,
    methodLabel: "",
    legacy: false,
  }));

  // Old: the customer's single payment screenshot on the order.
  if (order.paymentReference && order.paymentProofImage) {
    entries.push({
      source: "legacy",
      confirmed: Boolean(order.depositConfirmed),
      id: "legacy-payment",
      kind: "deposit_payment",
      amount: order.finalDepositAmount ?? order.depositAmount ?? 0,
      referenceNumber: order.paymentReference,
      note: "",
      images: [order.paymentProofImage],
      date: order.paymentSubmittedAt?.toDate
        ? order.paymentSubmittedAt.toDate().toISOString()
        : null,
      methodLabel: paymentMethodLabel(order.paymentMethod),
      legacy: true,
    });
  }

  // Old: refund receipts saved on the order document.
  (order.refunds || []).forEach((r) =>
    entries.push({
      source: "legacy",
      confirmed: false,
      id: "legacy-refund-" + r.id,
      kind: "refund",
      amount: Number(r.amount) || 0,
      referenceNumber: r.referenceNumber || "",
      note: r.note || "",
      images: r.screenshotBase64 ? [r.screenshotBase64] : [],
      date: r.issuedAt || null,
      methodLabel: "",
      legacy: true,
    })
  );

  // Old: proof attached to a change request.
  (order.changeRequests || []).forEach((cr) => {
    if (!cr.proof) return;
    entries.push({
      source: "legacy",
      confirmed: false,
      id: "legacy-cr-" + cr.id,
      kind: "deduction",
      amount: Math.abs(cr.adjustmentAmount || 0),
      referenceNumber: cr.proof.referenceNumber || "",
      note: cr.proof.note || "",
      images: cr.proof.screenshotBase64 ? [cr.proof.screenshotBase64] : [],
      date: cr.proof.submittedAt || null,
      methodLabel: "",
      legacy: true,
    });
  });

  return entries.sort((a, b) => (Date.parse(b.date) || 0) - (Date.parse(a.date) || 0));
}