import { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import Navbar from "../../components/Navbar";
import Footer from "../../components/Footer";
import Breadcrumb from "../../components/Breadcrumb";
import StepProgress from "../../components/StepProgress";
import { useAuth } from "../../context/AuthContext";
import {
  checkName, checkEmail, checkPhone, checkRequired, checkUrl, checkFutureDate, todayISO, friendlyError,
} from "../../lib/validators";
import { useCart } from "../../context/CartContext";
import {
  createOrder,
  DEPOSIT_RATE_STANDARD,
  DEPOSIT_RATE_COMPANY,
} from "../../lib/orders";

export default function QuoteRequest() {
  const { user, profile } = useAuth();
  const { items, removeItem, clearCart } = useCart();
  const navigate = useNavigate();

  const [contactName, setContactName] = useState(profile?.fullName || "");
  const [contactEmail, setContactEmail] = useState(profile?.email || "");
  const [contactNumber, setContactNumber] = useState(profile?.phone || "");
  const [location, setLocation] = useState("");
  const [siteAddress, setSiteAddress] = useState("");
  const [preferredVisitDate, setPreferredVisitDate] = useState("");
  const [floorPlanUrl, setFloorPlanUrl] = useState("");
  const [projectDetails, setProjectDetails] = useState("");
  const [consentGiven, setConsentGiven] = useState(false);
  // "catalog" = built from the showroom (50% deposit); "pure_custom" = a
  // from-scratch commission for a company, quoted by MDP (30% deposit).
  const [orderType, setOrderType] = useState("catalog");
  const [companyName, setCompanyName] = useState("");
  const pureCustom = orderType === "pure_custom";
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  const subtotal = items.reduce((sum, i) => sum + (i.subtotal || 0), 0);
  // No separate hardware & installation fee: the quote is just the items.
  const provisionalTotal = subtotal;
  const depositRate = pureCustom ? DEPOSIT_RATE_COMPANY : DEPOSIT_RATE_STANDARD;
  const deposit = pureCustom ? 0 : Math.round(provisionalTotal * depositRate);

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");

    // Check every field first, so the person sees what to fix instead of a
    // request being accepted with missing or invalid details.
    const fieldProblem =
      checkName(contactName, "name") ||
      checkEmail(contactEmail) ||
      checkPhone(contactNumber) ||
      checkRequired(location, "the location (city or province)", 2) ||
      checkRequired(siteAddress, "the site address", 8) ||
      checkFutureDate(preferredVisitDate, "site visit date", { required: true }) ||
      checkUrl(floorPlanUrl);
    if (fieldProblem) {
      setError(fieldProblem);
      return;
    }

    if (pureCustom) {
      if (!companyName.trim()) {
        setError("Please enter your company name.");
        return;
      }
      if (projectDetails.trim().length < 30) {
        setError("Please describe what you need built (at least a few sentences) so we can quote it.");
        return;
      }
    } else if (items.length === 0) {
      setError("Add at least one configuration, or choose Pure Custom above.");
      return;
    }
    if (!consentGiven) {
      setError("Please agree to the Privacy Policy to continue.");
      return;
    }

    setSubmitting(true);
    try {
      const orderId = await createOrder({
        customerId: user.uid,
        orderType,
        depositRate,
        companyName: pureCustom ? companyName.trim() : null,
        configurations: (pureCustom ? [] : items).map((i) => ({
          furnitureId: i.furnitureId,
          furnitureName: i.furnitureName,
          shapeType: i.shapeType,
          finish: i.finish,
          hardware: i.hardware,
          dimensions: i.dimensions,
          customRequest: i.customRequest,
          basePrice: i.basePrice,
          addOnsTotal: i.addOnsTotal,
          subtotal: i.subtotal,
        })),
        provisionalTotal: pureCustom ? 0 : provisionalTotal,
        depositAmount: deposit,
        contact: {
          name: contactName,
          email: contactEmail,
          phone: contactNumber,
        },
        location,
        siteAddress,
        preferredVisitDate,
        floorPlanUrl: floorPlanUrl || null,
        projectDetails,
        consentGiven,
      });
      if (!pureCustom) clearCart();
      navigate(`/orders/${orderId}`);
    } catch (err) {
      setError("We couldn't submit your request. " + friendlyError(err, "Please try again."));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="showroom-page">
      <Navbar />

      <div className="showroom-inner">
        <Breadcrumb
          crumbs={[
            { label: "Home", to: "/" },
            { label: "Showroom", to: "/showroom" },
            { label: "Request Quote" },
          ]}
        />
        <StepProgress currentStep={4} />

        <div className="order-type-picker" role="radiogroup" aria-label="Order type">
          <button
            type="button"
            role="radio"
            aria-checked={!pureCustom}
            className={"order-type-card" + (!pureCustom ? " order-type-card-on" : "")}
            onClick={() => setOrderType("catalog")}
          >
            <strong>From our showroom</strong>
            <span>Pick and customize from our catalog. 50% deposit.</span>
          </button>
          <button
            type="button"
            role="radio"
            aria-checked={pureCustom}
            className={"order-type-card" + (pureCustom ? " order-type-card-on" : "")}
            onClick={() => setOrderType("pure_custom")}
          >
            <strong>Pure custom — for companies</strong>
            <span>Built from scratch to your own design or brief. 30% deposit.</span>
          </button>
        </div>

        <h1>{pureCustom ? "Your custom project:" : "What you're requesting:"}</h1>

        <div className="quote-layout">
          {/* Left: selected configurations */}
          <div className="quote-left">
            {pureCustom && (
              <div className="custom-intro">
                <p><strong>How a pure custom order works</strong></p>
                <ol>
                  <li>Tell us about your project and company on the right.</li>
                  <li>Send your drawings, plans or letter of intent in the chat after you submit.</li>
                  <li>MDP reviews it and sends you a quotation with the final price.</li>
                  <li>Approve it and pay a <b>30% deposit</b> to start.</li>
                </ol>
                <p className="custom-intro-note">
                  There is no price estimate for custom projects: we price them after reviewing your brief.
                </p>
              </div>
            )}
            {!pureCustom && items.length === 0 && (
              <p>
                Your quote request is empty.{" "}
                <Link to="/showroom">Browse the showroom</Link> to add a
                configuration.
              </p>
            )}

            {!pureCustom && items.map((item) => (
              <div className="quote-item-card" key={item.cartId}>
                <div>
                  <strong>
                    {item.furnitureName} — {item.shapeType}
                  </strong>
                  <p>
                    {item.finish}, W{item.dimensions?.w} × D
                    {item.dimensions?.d} × H{item.dimensions?.h}
                  </p>
                </div>
                <div className="quote-item-right">
                  <span>₱{item.subtotal.toLocaleString()}</span>
                  <button
                    className="quote-item-remove"
                    onClick={() => removeItem(item.cartId)}
                  >
                    Remove
                  </button>
                </div>
              </div>
            ))}

            {!pureCustom && (
            <Link to="/showroom" className="add-another-link">
              + Add another quote
            </Link>
            )}

            {!pureCustom && (
            <div className="provisional-breakdown">
              <div className="price-row">
                <span>Subtotal</span>
                <span>₱{subtotal.toLocaleString()}</span>
              </div>
              <div className="price-row price-row-total-light">
                <span>Provisional Total</span>
                <span>₱{provisionalTotal.toLocaleString()}</span>
              </div>
              <p className="price-deposit-note-dark">
                50% deposit to start: ₱{deposit.toLocaleString()}
              </p>
            </div>

            )}

            <p className="quote-count-line">
              {pureCustom
                ? "Pure custom order · Price quoted by MDP · 30% deposit"
                : `${items.length} Selected Configuration${items.length !== 1 ? "s" : ""} · Provisional: ₱${provisionalTotal.toLocaleString()}`}
            </p>
          </div>

          {/* Right: inquiry details form */}
          <form className="quote-right" onSubmit={handleSubmit} noValidate>
            <h4>Inquiry Details:</h4>

            {pureCustom && (
              <label>
                Company Name
                <input
                  value={companyName}
                  onChange={(e) => setCompanyName(e.target.value)}
                  placeholder="e.g. ABC Trading Corp."
                  required
                />
              </label>
            )}

            <div className="admin-form-grid">
              <label>
                Contact Name
                <input
                  value={contactName}
                  onChange={(e) => setContactName(e.target.value)}
                  required
                />
              </label>
              <label>
                Email
                <input
                  type="email"
                  value={contactEmail}
                  onChange={(e) => setContactEmail(e.target.value)}
                  required
                />
              </label>
            </div>

            <label>
              Contact Number
              <input
                type="tel"
                inputMode="tel"
                value={contactNumber}
                onChange={(e) => setContactNumber(e.target.value)}
                placeholder="0917 123 4567"
                required
              />
            </label>

            <label>
              Location
              <input
                value={location}
                onChange={(e) => setLocation(e.target.value)}
                placeholder="e.g. Metro Manila"
                required
              />
            </label>

            <label>
              Site Address
              <input
                value={siteAddress}
                onChange={(e) => setSiteAddress(e.target.value)}
                placeholder="Street, Barangay, City"
                required
              />
            </label>

            <label>
              Preferred Site Visit Date
              <input
                type="date"
                min={todayISO()}
                value={preferredVisitDate}
                onChange={(e) => setPreferredVisitDate(e.target.value)}
                required
              />
            </label>

            <label>
              Floor Plan / Space Photo URL (optional)
              <input
                type="url"
                value={floorPlanUrl}
                onChange={(e) => setFloorPlanUrl(e.target.value)}
                placeholder="https://…"
              />
            </label>

            <label>
              {pureCustom ? "Describe your project (what, where, how many, timeline)" : "Project Details"}
              <textarea
                rows={pureCustom ? 7 : 4}
                required={pureCustom}
                value={projectDetails}
                onChange={(e) => setProjectDetails(e.target.value)}
                placeholder={
                  pureCustom
                    ? "e.g. 12 display counters for our new store branch, laminated, with LED strips. Plans to follow in chat."
                    : "Tell us more about your space and timeline…"
                }
              />
            </label>

            <label className="checkbox-label">
              <input
                type="checkbox"
                checked={consentGiven}
                onChange={(e) => setConsentGiven(e.target.checked)}
              />
              <span>
                I agree to the{" "}
                <Link to="/privacy" target="_blank" rel="noopener noreferrer">
                  Privacy Policy
                </Link>{" "}
                and consent to be contacted regarding this inquiry.
              </span>
            </label>

            {error && (
              <p className="form-error" role="alert">
                {error}
              </p>
            )}

            <button type="submit" className="btn btn-primary" disabled={submitting}>
              {submitting ? "Submitting…" : pureCustom ? "Submit Custom Request" : "Submit Customization Request"}
            </button>
          </form>
        </div>
      </div>

      <Footer />
    </div>
  );
}