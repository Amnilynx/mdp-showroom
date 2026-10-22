import { useState } from "react";
import {
  sendMessage,
  downloadAttachment,
  getAttachments,
  validateAttachments,
  ALLOWED_EXTENSIONS,
  MAX_FILES_PER_SEND,
} from "../lib/messages";
import { attachChangeRequestFiles } from "../lib/orders";

function formatSize(bytes) {
  if (bytes < 1024 * 1024) return Math.max(1, Math.round(bytes / 1024)) + " KB";
  return (bytes / (1024 * 1024)).toFixed(1) + " MB";
}

function fmtDate(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  return isNaN(d) ? "" : d.toLocaleString("en-PH", { dateStyle: "medium", timeStyle: "short" });
}

// Files that belong to ONE change request, shown on both the admin and the
// customer order pages:
//   - the customer's letter of notice (sent with the request)
//   - any files either side adds afterwards
// Every upload is also posted to the order's Messages tab (see
// handleSend), so it shows up in the chat for both sides as well.
//
//   role="admin" | "customer"
//   canUpload    show the "add files" box
export default function ChangeRequestFiles({ orderId, cr, role, user, userName, canUpload }) {
  const isAdmin = role === "admin";
  const [files, setFiles] = useState([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [downloading, setDownloading] = useState(null);

  const groups = [];
  if (cr.notice?.attachments?.length) {
    groups.push({
      key: "notice",
      notice: true,
      label: isAdmin ? "Customer's letter of notice" : "Your letter of notice",
      messageId: cr.notice.messageId,
      attachments: getAttachments({ attachments: cr.notice.attachments }),
      at: cr.notice.sentAt,
    });
  }
  (cr.files || []).forEach((g, i) =>
    groups.push({
      key: "f" + i,
      label:
        g.by === "admin"
          ? isAdmin
            ? "Files you sent"
            : "Files from MDP"
          : isAdmin
          ? "More files from the customer"
          : "Your files",
      messageId: g.messageId,
      attachments: getAttachments({ attachments: g.attachments }),
      at: g.uploadedAt,
    })
  );

  function pick(e) {
    const picked = Array.from(e.target.files || []);
    e.target.value = "";
    if (!picked.length) return;
    const combined = [...files, ...picked];
    const problem = validateAttachments(combined, isAdmin ? "manager" : "customer");
    if (problem) {
      setError(problem);
      return;
    }
    setError("");
    setFiles(combined);
  }

  async function handleSend() {
    if (!files.length || busy) return;
    setBusy(true);
    setError("");
    try {
      const preview = (cr.note || "").slice(0, 60) + ((cr.note || "").length > 60 ? "…" : "");
      // Posted to the chat first, then linked to the request.
      const sent = await sendMessage(orderId, {
        senderId: user.uid,
        senderRole: isAdmin ? "manager" : "customer",
        senderName: userName,
        text: `📎 Files for the change request "${preview}"`,
        files,
      });
      await attachChangeRequestFiles(orderId, cr.id, {
        messageId: sent.id,
        attachments: sent.attachments,
        by: isAdmin ? "admin" : "customer",
        byName: userName,
      });
      setFiles([]);
    } catch (err) {
      setError(err?.message || "Couldn't send the files. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  async function handleDownload(group, a) {
    const key = group.key + ":" + a.fileIndex;
    if (downloading) return;
    setDownloading(key);
    try {
      await downloadAttachment(orderId, group.messageId, a);
    } catch (err) {
      alert(err?.message || "Couldn't download the file. Please try again.");
    } finally {
      setDownloading(null);
    }
  }

  if (groups.length === 0 && !canUpload) return null;

  return (
    <div className="cr-files">
      {groups.map((g) => (
        <div className={"cr-files-group" + (g.notice ? " cr-files-group-notice" : "")} key={g.key}>
          <p className="cr-files-label">
            {g.notice ? "📄 " : "📎 "}
            {g.label}
            {g.at && <span className="cr-files-date"> · {fmtDate(g.at)}</span>}
          </p>
          {g.attachments.map((a) => {
            const key = g.key + ":" + a.fileIndex;
            return (
              <button
                type="button"
                key={key}
                className="chat-file"
                onClick={() => handleDownload(g, a)}
                disabled={downloading === key}
                title="Download file"
              >
                <span className="chat-file-icon" aria-hidden="true">📄</span>
                <span className="chat-file-info">
                  <span className="chat-file-name">{a.name}</span>
                  <span className="chat-file-size">
                    {downloading === key ? "Downloading…" : formatSize(a.size) + " · tap to download"}
                  </span>
                </span>
              </button>
            );
          })}
        </div>
      ))}

      {isAdmin && groups.length === 0 && (
        <p className="cr-files-empty">No files attached to this request yet.</p>
      )}

      {canUpload && (
        <div className="cr-files-upload">
          <label className="cr-files-pick">
            <span>
              {isAdmin ? "Upload files for this request" : "Add more files to this request"} (PDF, Word or
              Excel, up to {MAX_FILES_PER_SEND}, 2 MB each)
            </span>
            <input
              type="file"
              multiple
              accept={ALLOWED_EXTENSIONS.map((x) => "." + x).join(",")}
              onChange={pick}
              disabled={busy}
            />
          </label>
          {files.length > 0 && (
            <div className="cr-files-chips">
              {files.map((f, i) => (
                <span className="quote-file-chip" key={f.name + i}>
                  {f.name}{" "}
                  <button
                    type="button"
                    onClick={() => setFiles((p) => p.filter((_, j) => j !== i))}
                    disabled={busy}
                    aria-label={`Remove ${f.name}`}
                  >
                    ✕
                  </button>
                </span>
              ))}
            </div>
          )}
          {error && <p className="form-error">{error}</p>}
          {files.length > 0 && (
            <button type="button" className="btn btn-primary btn-small" onClick={handleSend} disabled={busy}>
              {busy ? "Sending…" : `Send ${files.length} file${files.length === 1 ? "" : "s"}`}
            </button>
          )}
          <p className="cr-files-hint">Files you send here also appear in the Messages tab.</p>
        </div>
      )}
    </div>
  );
}