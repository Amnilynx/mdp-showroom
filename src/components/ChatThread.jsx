import { useEffect, useRef, useState } from "react";
import { useAuth } from "../context/AuthContext";
import {
  sendMessage,
  subscribeToMessages,
  downloadAttachment,
  getAttachments,
  validateAttachments,
  ALLOWED_EXTENSIONS,
  MAX_FILES_PER_SEND,
} from "../lib/messages";
import { COMPANY_EMAIL } from "../lib/contactConfig";
import { markChatOpen, markChatClosed } from "../lib/chatPresence";
import { playChime, useMuted, setMuted, useCalm, setCalm } from "../lib/chime";

function formatSize(bytes) {
  if (bytes < 1024 * 1024) return Math.max(1, Math.round(bytes / 1024)) + " KB";
  return (bytes / (1024 * 1024)).toFixed(1) + " MB";
}

// Turns http(s) links in a message into clickable links.
function linkify(text) {
  return text.split(/(https?:\/\/[^\s]+)/g).map((part, i) =>
    /^https?:\/\//.test(part) ? (
      <a key={i} href={part} target="_blank" rel="noopener noreferrer">
        {part}
      </a>
    ) : (
      part
    )
  );
}

export default function ChatThread({ orderId }) {
  const { user, profile } = useAuth();
  const muted = useMuted();
  const calm = useCalm();
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(true);
  const [draft, setDraft] = useState("");
  const [files, setFiles] = useState([]); // up to MAX_FILES_PER_SEND
  const [sending, setSending] = useState(false);
  const [downloadingKey, setDownloadingKey] = useState(null);
  const knownIds = useRef(null); // message ids already seen, to spot new arrivals
  const bottomRef = useRef(null);
  const fileInputRef = useRef(null);

  // Tell the pop-up notifier this chat is on screen.
  useEffect(() => {
    markChatOpen(orderId);
    return () => markChatClosed(orderId);
  }, [orderId]);

  useEffect(() => {
    knownIds.current = null;
    const unsubscribe = subscribeToMessages(orderId, (msgs) => {
      // Soft chime when the other person's message arrives while this
      // chat is open (when it's closed, ChatNotifier does the alerting).
      if (knownIds.current) {
        const fresh = msgs.filter(
          (m) =>
            !knownIds.current.has(m.id) &&
            m.senderRole !== "system" &&
            m.senderId !== user.uid
        );
        if (fresh.length) playChime();
      }
      knownIds.current = new Set(msgs.map((m) => m.id));
      setMessages(msgs);
      setLoading(false);
    });
    return unsubscribe;
  }, [orderId, user.uid]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  function handlePickFiles(e) {
    const picked = Array.from(e.target.files || []);
    e.target.value = ""; // lets the same file be picked again later
    if (picked.length === 0) return;
    const combined = [...files, ...picked];
    const problem = validateAttachments(combined, profile?.role);
    if (problem) {
      alert(problem);
      return;
    }
    setFiles(combined);
  }

  function removeFile(index) {
    setFiles((prev) => prev.filter((_, i) => i !== index));
  }

  async function handleSend(e) {
    e.preventDefault();
    if ((!draft.trim() && files.length === 0) || sending) return;
    setSending(true);
    try {
      await sendMessage(orderId, {
        senderId: user.uid,
        senderRole: profile?.role || "customer",
        senderName: profile?.fullName || user.email || "Someone",
        text: draft,
        files,
      });
      setDraft("");
      setFiles([]);
    } catch (err) {
      alert(err?.message || "Failed to send message. Please try again.");
    } finally {
      setSending(false);
    }
  }

  async function handleDownload(m, attachment) {
    const key = m.id + ":" + attachment.fileIndex + ":" + attachment.name;
    if (downloadingKey) return;
    setDownloadingKey(key);
    try {
      await downloadAttachment(orderId, m.id, attachment);
    } catch (err) {
      alert(err?.message || "Couldn't download the file. Please try again.");
    } finally {
      setDownloadingKey(null);
    }
  }

  function formatTime(ts) {
    if (!ts?.toDate) return "";
    return ts.toDate().toLocaleString("en-PH", {
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });
  }

  return (
    <div className="chat-thread">
      <div className="chat-alert-settings">
        <button
          type="button"
          className={"chat-alert-btn" + (muted ? " chat-alert-btn-off" : "")}
          onClick={() => setMuted(!muted)}
          aria-pressed={muted}
        >
          {muted ? "🔕 Sound off" : "🔔 Sound on"}
        </button>
        <button
          type="button"
          className={"chat-alert-btn" + (calm ? " chat-alert-btn-off" : "")}
          onClick={() => setCalm(!calm)}
          aria-pressed={calm}
        >
          {calm ? "✨ Blinking off" : "✨ Blinking on"}
        </button>
        <details className="chat-alert-help">
          <summary>How to turn off the ping and blinking</summary>
          <ul>
            <li>Tap <b>Sound on</b> to mute the chime. Tap it again to bring it back.</li>
            <li>Tap <b>Blinking on</b> to stop the flashing and shaking. New messages still show a plain red marker.</li>
            <li>On any page, the round sound button at the bottom-left also mutes the chime.</li>
            <li>Your choices are saved on this device. Phones and computers are set separately.</li>
            <li>If your device is set to "reduce motion", the blinking is already off.</li>
          </ul>
        </details>
      </div>
      <div className="chat-messages">
        {loading && <p className="chat-empty">Loading messages…</p>}
        {!loading && messages.length === 0 && (
          <p className="chat-empty">
            No messages yet. Send the first one below.
          </p>
        )}
        {messages.map((m) => {
          // Automated notices (status changes, price issued, deposit
          // verified) — centered, no bubble, distinct from a real reply.
          if (m.senderRole === "system") {
            return (
              <div key={m.id} className="chat-system-row">
                <span className="chat-system-text">{m.text}</span>
                <span className="chat-system-time">{formatTime(m.createdAt)}</span>
              </div>
            );
          }

          const isMine = m.senderId === user.uid;
          const attachments = getAttachments(m);
          return (
            <div
              key={m.id}
              className={
                "chat-bubble-row" + (isMine ? " chat-bubble-row-mine" : "")
              }
            >
              <div
                className={
                  "chat-bubble" +
                  (isMine ? " chat-bubble-mine" : "") +
                  (m.senderRole === "manager" ? " chat-bubble-admin" : "")
                }
              >
                {m.senderRole === "manager" && (
                  <span className="chat-sender-name">{m.senderName}</span>
                )}
                {m.text && <p>{linkify(m.text)}</p>}
                {attachments.map((a) => {
                  const key = m.id + ":" + a.fileIndex + ":" + a.name;
                  return (
                    <button
                      type="button"
                      key={key}
                      className="chat-file"
                      onClick={() => handleDownload(m, a)}
                      disabled={downloadingKey === key}
                      title="Download file"
                    >
                      <span className="chat-file-icon" aria-hidden="true">📄</span>
                      <span className="chat-file-info">
                        <span className="chat-file-name">{a.name}</span>
                        <span className="chat-file-size">
                          {downloadingKey === key
                            ? "Downloading…"
                            : formatSize(a.size) + " · tap to download"}
                        </span>
                      </span>
                    </button>
                  );
                })}
                <span className="chat-timestamp">{formatTime(m.createdAt)}</span>
              </div>
            </div>
          );
        })}
        <div ref={bottomRef} />
      </div>

      {files.map((f, i) => (
        <div className="chat-file-preview" key={f.name + i}>
          <span className="chat-file-icon" aria-hidden="true">📄</span>
          <span className="chat-file-info">
            <span className="chat-file-name">{f.name}</span>
            <span className="chat-file-size">{formatSize(f.size)}</span>
          </span>
          <button
            type="button"
            className="chat-file-remove"
            onClick={() => removeFile(i)}
            disabled={sending}
            aria-label={`Remove ${f.name}`}
          >
            ✕
          </button>
        </div>
      ))}

      <form className="chat-input-row" onSubmit={handleSend}>
        <input
          type="file"
          multiple
          ref={fileInputRef}
          accept={ALLOWED_EXTENSIONS.map((x) => "." + x).join(",")}
          onChange={handlePickFiles}
          style={{ display: "none" }}
        />
        <button
          type="button"
          className="chat-attach-btn"
          onClick={() => fileInputRef.current?.click()}
          disabled={sending || files.length >= MAX_FILES_PER_SEND}
          title={`Attach up to ${MAX_FILES_PER_SEND} PDF, Word or Excel files (max 2 MB each)`}
          aria-label="Attach files"
        >
          📎{files.length > 0 ? ` ${files.length}` : ""}
        </button>
        <input
          placeholder="Write a message…"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          disabled={sending}
        />
        <button
          type="submit"
          disabled={sending || (!draft.trim() && files.length === 0)}
        >
          {sending ? "Sending…" : "Send"}
        </button>
      </form>
      <p className="chat-file-hint">
        Up to {MAX_FILES_PER_SEND} files per message, 2 MB each.{" "}
        {profile?.role === "manager"
          ? "Larger files: please email them to the customer directly."
          : `Larger files: please email them to ${COMPANY_EMAIL} and mention your order number.`}
      </p>
    </div>
  );
}