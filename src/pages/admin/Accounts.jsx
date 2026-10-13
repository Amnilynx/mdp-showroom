import { useEffect, useState } from "react";
import { createUserWithEmailAndPassword } from "firebase/auth";
import AdminLayout from "../../components/AdminLayout";
import { createSecondaryAuth } from "../../lib/firebase";
import { createManagerProfile, getAllManagers } from "../../lib/users";

export default function AdminAccounts() {
  const [managers, setManagers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

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
      setError("Couldn't load admin accounts.");
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

    if (!fullName.trim() || !email.trim() || password.length < 6) {
      setError("Fill in all fields — password needs at least 6 characters.");
      return;
    }

    setCreating(true);
    // Create the new account on a SEPARATE, temporary auth instance so
    // it never touches the current admin's logged-in session.
    const { auth: secondaryAuth, cleanup } = createSecondaryAuth();
    try {
      const cred = await createUserWithEmailAndPassword(
        secondaryAuth,
        email.trim(),
        password
      );
      await createManagerProfile(cred.user.uid, {
        fullName: fullName.trim(),
        email: email.trim(),
      });
      setSuccess(`Admin account created for ${fullName.trim()}.`);
      setFullName("");
      setEmail("");
      setPassword("");
      await load();
    } catch (err) {
      if (err.code === "auth/email-already-in-use") {
        setError("An account with this email already exists.");
      } else {
        setError("Failed to create account. Please try again.");
      }
    } finally {
      await cleanup(); // tear down the temporary auth instance either way
      setCreating(false);
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
          {error && <p className="form-error">{error}</p>}
          <div className="admin-list">
            {managers.map((m) => (
              <div className="admin-list-row admin-account-row" key={m.uid}>
                <div className="admin-avatar-circle admin-avatar-small">
                  {(m.fullName || "A").charAt(0).toUpperCase()}
                </div>
                <div className="admin-list-info">
                  <strong>{m.fullName}</strong>
                  <span>{m.email}</span>
                </div>
              </div>
            ))}
          </div>
        </div>

        <form className="ticket-card admin-form" onSubmit={handleCreate}>
          <h4>Add New Admin</h4>
          <label>
            Full Name
            <input
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              required
            />
          </label>
          <label>
            Email
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </label>
          <label>
            Temporary Password
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              minLength={6}
              required
            />
          </label>
          {error && <p className="form-error">{error}</p>}
          {success && <p className="form-success">{success}</p>}
          <button type="submit" className="btn btn-primary" disabled={creating}>
            {creating ? "Creating…" : "Create Admin Account"}
          </button>
        </form>
      </div>
    </AdminLayout>
  );
}