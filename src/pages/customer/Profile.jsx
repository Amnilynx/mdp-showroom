import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  EmailAuthProvider,
  reauthenticateWithCredential,
  updatePassword,
  signOut,
} from "firebase/auth";
import { auth } from "../../lib/firebase";
import Navbar from "../../components/Navbar";
import Footer from "../../components/Footer";
import Breadcrumb from "../../components/Breadcrumb";
import PasswordInput from "../../components/PasswordInput";
import { useAuth } from "../../context/AuthContext";
import { updateUserProfile } from "../../lib/users";
import { getOrdersByCustomer, STATUS_LABELS } from "../../lib/orders";
import { checkName, checkPhone, checkPassword, friendlyError } from "../../lib/validators";

const ACTIVE = ["request_received", "under_review", "est_price_issued", "approved", "in_production", "ready_for_delivery"];

const fmtDate = (ts) =>
  ts?.toDate
    ? ts.toDate().toLocaleDateString("en-PH", { month: "long", day: "numeric", year: "numeric" })
    : "—";

export default function Profile() {
  const { user, profile, refreshProfile } = useAuth();
  const navigate = useNavigate();

  // ---- details ----
  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [saving, setSaving] = useState(false);
  const [detailsMsg, setDetailsMsg] = useState(null); // { type, text }

  // ---- password ----
  const [currentPw, setCurrentPw] = useState("");
  const [newPw, setNewPw] = useState("");
  const [confirmPw, setConfirmPw] = useState("");
  const [pwBusy, setPwBusy] = useState(false);
  const [pwMsg, setPwMsg] = useState(null);

  // ---- orders ----
  const [orders, setOrders] = useState([]);
  const [ordersLoading, setOrdersLoading] = useState(true);
  const [ordersError, setOrdersError] = useState("");

  useEffect(() => {
    setFullName(profile?.fullName || "");
    setPhone(profile?.phone || "");
  }, [profile]);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    getOrdersByCustomer(user.uid)
      .then((d) => !cancelled && setOrders(d))
      .catch((err) => !cancelled && setOrdersError("Couldn't load your orders. " + friendlyError(err)))
      .finally(() => !cancelled && setOrdersLoading(false));
    return () => {
      cancelled = true;
    };
  }, [user]);

  const usesPassword = (user?.providerData || []).some((p) => p.providerId === "password");
  const changed = fullName.trim() !== (profile?.fullName || "") || phone.trim() !== (profile?.phone || "");

  async function handleSave(e) {
    e.preventDefault();
    setDetailsMsg(null);
    const problem = checkName(fullName, "full name") || checkPhone(phone);
    if (problem) {
      setDetailsMsg({ type: "error", text: problem });
      return;
    }
    setSaving(true);
    try {
      await updateUserProfile(user.uid, { fullName: fullName.trim(), phone: phone.trim() });
      await refreshProfile();
      setDetailsMsg({ type: "ok", text: "Your details were saved." });
    } catch (err) {
      console.error("profile save failed:", err);
      setDetailsMsg({ type: "error", text: "Couldn't save your details. " + friendlyError(err, "Please try again.") });
    } finally {
      setSaving(false);
    }
  }

  async function handlePassword(e) {
    e.preventDefault();
    setPwMsg(null);
    if (!currentPw) return setPwMsg({ type: "error", text: "Enter your current password." });
    const problem = checkPassword(newPw);
    if (problem) return setPwMsg({ type: "error", text: problem });
    if (newPw !== confirmPw) return setPwMsg({ type: "error", text: "The new passwords don't match." });
    if (newPw === currentPw) return setPwMsg({ type: "error", text: "The new password must be different from the current one." });

    setPwBusy(true);
    try {
      const cred = EmailAuthProvider.credential(user.email, currentPw);
      await reauthenticateWithCredential(user, cred);
      await updatePassword(user, newPw);
      setCurrentPw("");
      setNewPw("");
      setConfirmPw("");
      setPwMsg({ type: "ok", text: "Your password was changed." });
    } catch (err) {
      const code = err?.code || "";
      let text;
      if (code === "auth/wrong-password" || code === "auth/invalid-credential") text = "Your current password is incorrect.";
      else if (code === "auth/too-many-requests") text = "Too many attempts. Please wait a few minutes and try again.";
      else if (code === "auth/weak-password") text = "That password is too weak. Use at least 8 characters with a letter and a number.";
      else if (code === "auth/requires-recent-login") text = "For your security, sign out, sign in again, then change your password.";
      else text = "Couldn't change your password. " + friendlyError(err, "Please try again.");
      setPwMsg({ type: "error", text });
    } finally {
      setPwBusy(false);
    }
  }

  async function handleSignOut() {
    await signOut(auth);
    navigate("/");
  }

  const total = orders.length;
  const active = orders.filter((o) => ACTIVE.includes(o.status)).length;
  const completed = orders.filter((o) => o.status === "completed").length;
  const closed = orders.filter((o) => o.status === "cancelled" || o.status === "rejected").length;

  const Msg = ({ m }) =>
    m ? (
      <p className={m.type === "error" ? "form-error" : "form-success"} role={m.type === "error" ? "alert" : "status"}>
        {m.text}
      </p>
    ) : null;

  return (
    <div className="showroom-page">
      <Navbar />
      <div className="showroom-inner">
        <Breadcrumb crumbs={[{ label: "Home", to: "/" }, { label: "My Profile" }]} />
        <h1>My Profile</h1>
        <p className="showroom-subtitle">Your account details, your orders at a glance, and your password.</p>

        <div className="accounts-layout">
          {/* Details */}
          <form className="ticket-card admin-form" onSubmit={handleSave} noValidate>
            <h4>Account details</h4>
            <label>
              Full name
              <input value={fullName} onChange={(e) => setFullName(e.target.value)} required />
            </label>
            <label>
              Email
              <input value={profile?.email || user?.email || ""} readOnly disabled />
              <small>Your email is your sign-in and can't be changed here.</small>
            </label>
            <label>
              Mobile number
              <input
                type="tel"
                inputMode="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="0917 123 4567"
                required
              />
            </label>
            <p className="legal-note">Member since {fmtDate(profile?.createdAt)}</p>
            <Msg m={detailsMsg} />
            <button type="submit" className="btn btn-primary" disabled={saving || !changed}>
              {saving ? "Saving…" : "Save changes"}
            </button>
          </form>

          {/* Password */}
          {usesPassword ? (
            <form className="ticket-card admin-form" onSubmit={handlePassword} noValidate>
              <h4>Change password</h4>
              <label>
                Current password
                <PasswordInput value={currentPw} onChange={(e) => setCurrentPw(e.target.value)} />
              </label>
              <label>
                New password
                <PasswordInput value={newPw} onChange={(e) => setNewPw(e.target.value)} autoComplete="new-password" />
              </label>
              <label>
                Confirm new password
                <PasswordInput value={confirmPw} onChange={(e) => setConfirmPw(e.target.value)} autoComplete="new-password" />
              </label>
              <p className="legal-note">At least 8 characters, with a letter and a number.</p>
              <Msg m={pwMsg} />
              <button type="submit" className="btn btn-primary" disabled={pwBusy}>
                {pwBusy ? "Changing…" : "Change password"}
              </button>
            </form>
          ) : (
            <div className="ticket-card">
              <h4>Password</h4>
              <p>You sign in with Google, so your password is managed in your Google account.</p>
            </div>
          )}
        </div>

        {/* Orders */}
        <div className="ticket-card" style={{ marginTop: 24 }}>
          <h4>Your orders</h4>
          {ordersLoading && <p>Loading…</p>}
          {ordersError && <p className="form-error">{ordersError}</p>}
          {!ordersLoading && !ordersError && (
            <>
              <p>
                <strong>{total}</strong> total · <strong>{active}</strong> in progress · <strong>{completed}</strong> completed ·{" "}
                <strong>{closed}</strong> cancelled or rejected
              </p>
              {total === 0 ? (
                <p>
                  You haven't submitted a request yet. <Link to="/showroom">Browse the showroom</Link> to start.
                </p>
              ) : (
                <div className="my-orders-list">
                  {orders.slice(0, 5).map((o) => (
                    <Link to={`/orders/${o.id}`} key={o.id} className="my-order-row">
                      <div>
                        <strong>{o.orderCode || `${o.configurations?.[0]?.furnitureName || "Order"} — Draft ${o.id.slice(0, 6)}`}</strong>
                        <p>{fmtDate(o.createdAt)}</p>
                      </div>
                      <span className={`status-pill status-pill-${o.status}`}>{STATUS_LABELS[o.status]}</span>
                      <span className="my-order-price">₱{(o.finalPrice ?? o.provisionalTotal)?.toLocaleString()}</span>
                      <span className="my-order-arrow">→</span>
                    </Link>
                  ))}
                </div>
              )}
              {total > 0 && (
                <p style={{ marginTop: 12 }}>
                  <Link to="/orders">See all orders and messages →</Link>
                </p>
              )}
            </>
          )}
        </div>

        <p style={{ marginTop: 24 }}>
          <Link to="/privacy">Privacy Policy</Link>
          {" · "}
          <button type="button" className="navbar-signout" onClick={handleSignOut}>
            Sign Out
          </button>
        </p>
      </div>
      <Footer />
    </div>
  );
}