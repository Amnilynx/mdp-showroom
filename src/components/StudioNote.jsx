import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { subscribeToTeamNote, saveTeamNote, NOTE_MAX_LENGTH } from "../lib/teamNote";
import { friendlyError } from "../lib/validators";

const when = (d) =>
  d ? d.toLocaleString("en-PH", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }) : "";

// Shared team note: saved to the database, visible to every admin, and it updates
// live when a teammate saves. Your own unsaved typing is never overwritten.
export default function StudioNote() {
  const { profile, user } = useAuth();
  const [text, setText] = useState("");
  const [saved, setSaved] = useState({ text: "", updatedBy: "", updatedAt: null });
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState(null); // { type, text }
  const dirty = useRef(false);

  useEffect(() => {
    const stop = subscribeToTeamNote(
      (n) => {
        setSaved(n);
        setLoaded(true);
        if (!dirty.current) setText(n.text); // don't clobber what is being typed
      },
      (err) => {
        setLoaded(true);
        setMsg({ type: "error", text: "Couldn't load the note. " + friendlyError(err) });
      }
    );
    return stop;
  }, []);

  function onChange(e) {
    dirty.current = true;
    setText(e.target.value);
    setMsg(null);
  }

  async function save() {
    setSaving(true);
    setMsg(null);
    try {
      await saveTeamNote(text, profile?.fullName || user?.email);
      dirty.current = false;
      setMsg({ type: "ok", text: "Saved. Your team can see it." });
    } catch (err) {
      console.error("note save failed:", err);
      setMsg({ type: "error", text: "Couldn't save the note. " + friendlyError(err, "Please try again.") });
    } finally {
      setSaving(false);
    }
  }

  const unsaved = text !== saved.text;

  return (
    <div className="overview-note">
      <p className="section-eyebrow-dark">STUDIO NOTE</p>
      <textarea
        placeholder={loaded ? "Jot a note for the team…" : "Loading…"}
        className="studio-note-area"
        value={text}
        onChange={onChange}
        maxLength={NOTE_MAX_LENGTH}
        disabled={!loaded}
        aria-label="Studio note for the team"
      />
      <div style={{ display: "flex", justifyContent: "space-between", gap: 8, fontSize: 12, margin: "6px 0 8px", color: "#6b6b6b" }}>
        <span>
          {saved.updatedAt ? `Last saved by ${saved.updatedBy} · ${when(saved.updatedAt)}` : "Nothing saved yet"}
        </span>
        <span>{text.length}/{NOTE_MAX_LENGTH}</span>
      </div>
      {msg && (
        <p className={msg.type === "error" ? "form-error" : "form-success"} role={msg.type === "error" ? "alert" : "status"}>
          {msg.text}
        </p>
      )}
      <button type="button" className="btn btn-primary studio-note-btn" onClick={save} disabled={saving || !unsaved} style={{ marginBottom: 8 }}>
        {saving ? "Saving…" : unsaved ? "Save note" : "Saved ✓"}
      </button>
      <Link to="/admin/reports" className="btn studio-note-btn" style={{ display: "block", textAlign: "center" }}>
        Open Reports →
      </Link>
    </div>
  );
}