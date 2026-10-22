import { db } from "./firebase";
import { doc, updateDoc, arrayUnion, serverTimestamp } from "firebase/firestore";
import { sendMessage } from "./messages";

// Quote files. Whenever the admin adds or changes a price — the final price
// on a new order, or the amount on a change request — they send the customer
// one or more quote documents (PDF / Word / Excel, up to 5), the same way
// they always have.
//
// The files are sent through the order chat (same storage as any chat
// attachment, see lib/messages.js) AND recorded on the order as
// order.quotes[], so the customer can find every quote in one place on their
// order page instead of scrolling the chat.

function localId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

export async function sendQuoteFile(
  orderId,
  files,
  { senderId, senderName, amountLabel = "", kind = "final_price", changeRequestId = null }
) {
  const list = Array.isArray(files) ? files : [files];
  const sent = await sendMessage(orderId, {
    senderId,
    senderRole: "manager",
    senderName,
    text: `📎 New quote${amountLabel ? ` (${amountLabel})` : ""} — see the attached ${list.length > 1 ? "files" : "file"}.`,
    files: list,
  });

  const quote = {
    id: localId(),
    kind, // "final_price" | "change_request"
    changeRequestId,
    amountLabel,
    messageId: sent.id,
    attachments: sent.attachments, // [{ name, size, mimeType, chunkCount }]
    issuedAt: new Date().toISOString(),
  };

  await updateDoc(doc(db, "orders", orderId), {
    quotes: arrayUnion(quote),
    updatedAt: serverTimestamp(),
  });

  return quote;
}