import { useState } from "react";
import { downloadAttachment } from "../lib/messages";

function formatSize(bytes) {
  if (bytes < 1024 * 1024) return Math.max(1, Math.round(bytes / 1024)) + " KB";
  return (bytes / (1024 * 1024)).toFixed(1) + " MB";
}

// A quote's files, for both shapes: attachments[] (current) and the older
// single attachment (chunk ids without a file prefix, fileIndex null).
function quoteFilesOf(q) {
  if (Array.isArray(q.attachments)) {
    return q.attachments.map((a, i) => ({ ...a, fileIndex: i }));
  }
  if (q.attachment) return [{ ...q.attachment, fileIndex: null }];
  return [];
}

// Every quote sent on this order, newest first. Shown to the customer (so
// they can open the quote their price is based on) and to the admin (as a
// record of what was sent).
export default function QuoteFiles({ order, orderId, title = "Quotations" }) {
  const [downloadingKey, setDownloadingKey] = useState(null);
  const quotes = (order.quotes || []).slice().reverse();
  if (quotes.length === 0) return null;

  async function handleDownload(q, file) {
    const key = q.id + ":" + file.fileIndex + ":" + file.name;
    if (downloadingKey) return;
    setDownloadingKey(key);
    try {
      await downloadAttachment(orderId, q.messageId, file);
    } catch (err) {
      alert(err?.message || "Couldn't download the file. Please try again.");
    } finally {
      setDownloadingKey(null);
    }
  }

  return (
    <div className="ticket-card quote-files-card">
      <h4>{title}</h4>
      {quotes.map((q, qi) => (
        <div className="quote-group" key={q.id}>
          <p className="quote-group-label">
            {q.kind === "change_request" ? "Change quote" : "Quote"}
            {q.amountLabel ? ` · ${q.amountLabel}` : ""} ·{" "}
            {new Date(q.issuedAt).toLocaleDateString("en-PH", {
              month: "short",
              day: "numeric",
            })}
            {qi === 0 && " (latest)"}
          </p>
          {quoteFilesOf(q).map((f) => {
            const key = q.id + ":" + f.fileIndex + ":" + f.name;
            return (
              <button
                type="button"
                key={key}
                className="chat-file"
                onClick={() => handleDownload(q, f)}
                disabled={downloadingKey === key}
                title="Download quote"
              >
                <span className="chat-file-icon" aria-hidden="true">📄</span>
                <span className="chat-file-info">
                  <span className="chat-file-name">{f.name}</span>
                  <span className="chat-file-size">
                    {formatSize(f.size)}
                    {downloadingKey === key ? " · Downloading…" : " · tap to download"}
                  </span>
                </span>
              </button>
            );
          })}
        </div>
      ))}
    </div>
  );
}