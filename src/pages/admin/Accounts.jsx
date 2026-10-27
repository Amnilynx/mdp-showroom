import { useEffect, useState } from "react";
import { createUserWithEmailAndPassword } from "firebase/auth";
import AdminLayout from "../../components/AdminLayout";
import PasswordInput from "../../components/PasswordInput";
import { createSecondaryAuth } from "../../lib/firebase";
import { createManagerProfile, getAllManagers } from "../../lib/users";
import { registerStaffEmail, removeAdminAccess, isProtectedAdmin } from "../../lib/staffEmails";
import { checkName, checkEmail, checkPassword, friendlyError } from "../../lib/validators";
import { useAuth } from "../../context/AuthContext";

export default function AdminAccounts() {
  const { user } = useAuth();
  const [managers, setManagers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [removingUid, setRemovingUid] = useState(null);

  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [creating, setCreating] = useState(false);

  async function load() {
    setLoading(true);
    try {
      const data = await getAllManagers();
      setManagers(data);
    } catch (err) {
      setError("Couldn't load admin accounts. " + friendlyError(err));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function handleCreate(e) {
    e.preventDefault();
    setError("");
    setSuccess("");

    const problem = checkName(fullName, "full name") || checkEmail(email) || checkPassword(password);
    if (problem) {
      setError(problem);
      return;
    }

    setCreating(true);
    // Create the new account on a SEPARATE, temporary auth instance so
    // it never touches the current admin's logged-in session.
    const { auth: secondaryAuth, cleanup } = createSecondaryAuth();
    try {
      const cleanEmail = email.trim().toLowerCase();
      const cred = await createUserWithEmailAndPassword(secondaryAuth, cleanEmail, password);
      await createManagerProfile(cred.user.uid, { fullName: fullName.trim(), email: cleanEmail });
      await registerStaffEmail(cleanEmail, cred.user.uid);
      setSuccess(`Admin account created for ${fullName.trim()}.`);
      setFullName("");
      setEmail("");
      setPassword("");
      await load();
    } catch (err) {
      if (err.code === "auth/email-already-in-use") {
        setError("An account with this email already exists.");
      } else {
        setError("Failed to create account. " + friendlyError(err, "Please try again."));
      }
    } finally {
      await cleanup(); // tear down the temporary auth instance either way
      setCreating(false);
    }
  }

  async function handleRemove(m) {
    setError("");
    setSuccess("");
    if (m.uid === user?.uid) {
      setError("You can't remove your own admin access.");
      return;
    }
    if (isProtectedAdmin(m.email)) {
      setError("This is a protected owner account and can't be removed here.");
      return;
    }
    if (
      !window.confirm(
        `Remove admin access for ${m.fullName || m.email}?\n\nThey become an ordinary customer and can no longer open the admin area. This can be undone by creating the admin account again.`
      )
    ) {
      return;
    }
    setRemovingUid(m.uid);
    try {
      await removeAdminAccess(m.uid, m.email);
      setSuccess(`${m.fullName || m.email} no longer has admin access.`);
      await load();
    } catch (err) {
      setError("Couldn't remove this admin. " + friendlyError(err));
    } finally {
      setRemovingUid(null);
    }
  }

  return (
    <AdminLayout>
      <h1 className="admin-page-title">
        Who's on
        <br />
        the team
      </h1>

      <div className="accounts-layout">
        <div className="ticket-card">
          <h4>Current Admins</h4>
          {loading && <p>Loading…</p>}
          {error && <p className="form-error" role="alert">{error}</p>}
          {success && <p className="form-success">{success}</p>}
          <div className="admin-list">
            {managers.map((m) => {
              const protectedOwner = isProtectedAdmin(m.email);
              const isMe = m.uid === user?.uid;
              return (
                <div className="admin-list-row admin-account-row" key={m.uid}>
                  <div className="admin-avatar-circle admin-avatar-small">
                    {(m.fullName || "A").charAt(0).toUpperCase()}
                  </div>
                  <div className="admin-list-info">
                    <strong>
                      {m.fullName}
                      {protectedOwner ? " · Owner" : ""}
                      {isMe ? " · You" : ""}
                    </strong>
                    <span>{m.email}</span>
                  </div>
                  {!protectedOwner && !isMe && (
                    <button
                      type="button"
                      className="btn btn-cancel"
                      style={{ marginLeft: "auto" }}
                      onClick={() => handleRemove(m)}
                      disabled={removingUid === m.uid}
                    >
                      {removingUid === m.uid ? "Removing…" : "Remove"}
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        <form className="ticket-card admin-form" onSubmit={handleCreate} noValidate>
          <h4>Add New Admin</h4>
          <label>
            Full Name
            <input value={fullName} onChange={(e) => setFullName(e.target.value)} required />
          </label>
          <label>
            Email
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
          </label>
          <label>
            Temporary Password
            <PasswordInput value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="new-password" />
          </label>
          <p className="legal-note">At least 8 characters, with a letter and a number.</p>
          <button type="submit" className="btn btn-primary" disabled={creating}>
            {creating ? "Creating…" : "Create Admin Account"}
          </button>
        </form>
      </div>
    </AdminLayout>
  );
}