import { db } from "./firebase";
import {
  collection,
  addDoc,
  doc,
  setDoc,
  updateDoc,
  getDoc,
  writeBatch,
  query,
  orderBy,
  onSnapshot,
  serverTimestamp,
} from "firebase/firestore";
import { COMPANY_EMAIL } from "./contactConfig";

// Messages live as a subcollection under each order (or, for pre-order
// questions, under inquiries/{customerUid}):
//   orders/{orderId}/messages/{messageId}
// This keeps chat scoped per-order (per architecture decision) and lets
// any admin who opens that order see the exact same shared thread.
//
// File attachments (pdf / Word / Excel), up to 5 per message: we have no
// Firebase Storage (it needs the Blaze billing plan), so each file is stored
// as base64 text in Firestore, split into chunks because one document is
// capped at 1 MiB:
//   orders/{orderId}/messages/{messageId}/chunks/f{fileIndex}_{000, 001, ...}
// The message doc itself only holds small metadata (`attachments`), so the
// live chat listener stays light. Chunks are fetched only when someone
// clicks a file to download it. Because the files live behind Firestore
// rules (not a public link), only people allowed to read the order can open
// them — there is no URL that can leak.
//
// Older messages used a single `attachment` object with chunk ids "000",
// "001"... — getAttachments() below reads both shapes.

export const ALLOWED_EXTENSIONS = ["pdf", "doc", "docx", "xls", "xlsx", "csv"];
export const MAX_ATTACHMENT_BYTES = 2 * 1024 * 1024; // 2 MB per file
export const MAX_FILES_PER_SEND = 5;
const CHUNK_CHARS = 700000; // base64 characters per chunk, safely < 1 MiB

// A chat "thread" is either an order (id = the order id) or a customer's
// general pre-order inquiry with MDP (id = "inq_" + the customer's uid,
// stored at inquiries/{uid}). Everything below works on either, so the
// same ChatThread / attachments / notifier code serves both.
export const INQUIRY_PREFIX = "inq_";
export const inquiryThreadId = (uid) => INQUIRY_PREFIX + uid;
export const isInquiryThread = (id) => String(id).startsWith(INQUIRY_PREFIX);

function threadDocRef(threadId) {
  return isInquiryThread(threadId)
    ? doc(db, "inquiries", threadId.slice(INQUIRY_PREFIX.length))
    : doc(db, "orders", threadId);
}

function messagesCollection(orderId) {
  return collection(threadDocRef(orderId), "messages");
}

// Returns an error message string, or null if the file is OK to send.
export function validateAttachment(file, role = "customer") {
  const ext = (file.name.split(".").pop() || "").toLowerCase();
  if (!ALLOWED_EXTENSIONS.includes(ext)) {
    return `"${file.name}": only PDF, Word (.doc/.docx) and Excel (.xls/.xlsx/.csv) files can be sent.`;
  }
  if (file.size > MAX_ATTACHMENT_BYTES) {
    return role === "manager"
      ? `"${file.name}" is over the 2 MB limit. Please email it to the customer directly.`
      : `"${file.name}" is over the 2 MB limit. Please email it to ${COMPANY_EMAIL} and mention your order number.`;
  }
  if (file.size === 0) {
    return `"${file.name}" is empty.`;
  }
  return null;
}

// Validates a whole selection (count + each file). Returns an error string
// or null.
export function validateAttachments(files, role = "customer") {
  if (files.length > MAX_FILES_PER_SEND) {
    return `You can send up to ${MAX_FILES_PER_SEND} files at a time.`;
  }
  for (const f of files) {
    const problem = validateAttachment(f, role);
    if (problem) return problem;
  }
  return null;
}

function readAsBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Couldn't read the file."));
    reader.onload = () => resolve(String(reader.result).split(",")[1] || "");
    reader.readAsDataURL(file);
  });
}

function chunkId(fileIndex, i) {
  return `f${fileIndex}_${String(i).padStart(3, "0")}`;
}

// Writes one file's chunks (one batch per file keeps each request well
// under Firestore's 10 MiB request limit even with five 2 MB files).
async function uploadFileChunks(orderId, messageId, fileIndex, file) {
  const base64 = await readAsBase64(file);
  const chunkCount = Math.ceil(base64.length / CHUNK_CHARS);
  const batch = writeBatch(db);
  for (let i = 0; i < chunkCount; i++) {
    batch.set(
      doc(messagesCollection(orderId), messageId, "chunks", chunkId(fileIndex, i)),
      {
        file: fileIndex,
        index: i,
        data: base64.slice(i * CHUNK_CHARS, (i + 1) * CHUNK_CHARS),
      }
    );
  }
  await batch.commit();
  return {
    name: file.name,
    size: file.size,
    mimeType: file.type || "application/octet-stream",
    chunkCount,
  };
}

// Normalises a message's attachments to a list the UI can map over, for
// both the current shape (attachments[]) and the older single `attachment`.
// `fileIndex` is null for the old shape (its chunk ids have no file prefix).
export function getAttachments(message) {
  if (Array.isArray(message.attachments)) {
    return message.attachments.map((a, i) => ({ ...a, fileIndex: i }));
  }
  if (message.attachment) {
    return [{ ...message.attachment, fileIndex: null }];
  }
  return [];
}

export async function sendMessage(
  orderId,
  { senderId, senderRole, senderName, text = "", files = [], file = null }
) {
  const list = files.length ? files : file ? [file] : [];

  // Pre-generate the message id so chunks can be written under it first.
  const msgRef = doc(messagesCollection(orderId));
  let attachments = [];

  if (list.length) {
    const problem = validateAttachments(list, senderRole);
    if (problem) throw new Error(problem);

    // Chunks first, message last — so the other person never sees a
    // message whose files are only partly uploaded.
    for (let i = 0; i < list.length; i++) {
      attachments.push(await uploadFileChunks(orderId, msgRef.id, i, list[i]));
    }
  }

  await setDoc(msgRef, {
    senderId,
    senderRole, // "customer" | "manager"
    senderName, // display name at time of sending
    text: text.trim(),
    ...(attachments.length ? { attachments } : {}),
    createdAt: serverTimestamp(),
  });

  // Stamp the order with its latest message so the other side's pop-up
  // notifier (components/ChatNotifier.jsx) can spot it with a single
  // listener. Best-effort: a failure here must not fail the send.
  try {
    const preview =
      text.trim() ||
      (attachments.length
        ? `📎 ${attachments.length} file${attachments.length === 1 ? "" : "s"}`
        : "");
    const stamp = {
      lastMessageAt: serverTimestamp(),
      lastMessageBy: senderId,
      lastMessageRole: senderRole,
      lastMessageName: senderName,
      lastMessageText: preview.slice(0, 140),
    };
    if (isInquiryThread(orderId)) {
      // Creates the inquiry on the customer's first message.
      const customerId = orderId.slice(INQUIRY_PREFIX.length);
      await setDoc(
        threadDocRef(orderId),
        {
          customerId,
          ...(senderRole === "customer" ? { customerName: senderName } : {}),
          ...stamp,
        },
        { merge: true }
      );
    } else {
      await updateDoc(threadDocRef(orderId), stamp);
    }
  } catch (err) {
    console.error("Failed to stamp last message on order:", err);
  }

  // Callers that need to point back at this message (e.g. quote files
  // linked from the order page) use the id and attachment metadata.
  return { id: msgRef.id, attachments };
}

// Fetches one attachment's chunks, rebuilds the file and saves it.
// `attachment` is an entry from getAttachments().
export async function downloadAttachment(orderId, messageId, attachment) {
  const ids = Array.from({ length: attachment.chunkCount }, (_, i) =>
    attachment.fileIndex == null
      ? String(i).padStart(3, "0")
      : chunkId(attachment.fileIndex, i)
  );
  const snaps = await Promise.all(
    ids.map((id) => getDoc(doc(messagesCollection(orderId), messageId, "chunks", id)))
  );
  if (snaps.some((s) => !s.exists())) {
    throw new Error("The file is incomplete. Ask the sender to send it again.");
  }

  const base64 = snaps.map((s) => s.data().data).join("");
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);

  const blob = new Blob([bytes], { type: attachment.mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = attachment.name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// Automated, admin-triggered message — posted into the thread whenever the
// system itself changes something on an order (status update, price issued,
// deposit verified), so the customer sees what happened without needing to
// keep refreshing their order page. Rendered distinctly in ChatThread.jsx
// via senderRole: "system" (no avatar/name, centered, muted style).
export async function sendSystemMessage(orderId, text) {
  await addDoc(messagesCollection(orderId), {
    senderId: "system",
    senderRole: "system",
    senderName: "MDP Modular Systems",
    text,
    createdAt: serverTimestamp(),
  });
}

// Real-time listener — calls `callback` with the current message list
// every time the thread changes. Returns an unsubscribe function.
export function subscribeToMessages(orderId, callback) {
  const q = query(messagesCollection(orderId), orderBy("createdAt", "asc"));
  return onSnapshot(q, (snap) => {
    const messages = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    callback(messages);
  });
}