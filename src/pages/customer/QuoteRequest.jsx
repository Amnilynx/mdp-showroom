import { useEffect, useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import Navbar from "../../components/Navbar";
import Footer from "../../components/Footer";
import Breadcrumb from "../../components/Breadcrumb";
import StepProgress from "../../components/StepProgress";
import { useAuth } from "../../context/AuthContext";
import { useCart } from "../../context/CartContext";
import { createOrder, HARDWARE_INSTALLATION_RATE } from "../../lib/orders";
import { getSettings } from "../../lib/settings";

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
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  // Live, admin-adjustable rate — falls back to the hardcoded constant
  // until settings load (or if the settings doc doesn't exist yet).
  const [hardwareRate, setHardwareRate] = useState(HARDWARE_INSTALLATION_RATE);

  useEffect(() => {
    let cancelled = false;
    getSettings()
      .then((s) => {
        if (!cancelled) setHardwareRate(s.hardwareInstallationRate);
      })
      .catch(() => {
        // Keep the fallback rate — not worth blocking the page over this.
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const subtotal = items.reduce((sum, i) => sum + (i.subtotal || 0), 0);
  const hardwareInstallFee = Math.round(subtotal * hardwareRate);
  const provisionalTotal = subtotal + hardwareInstallFee;
  const deposit = Math.round(provisionalTotal * 0.5);

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");

    if (items.length === 0) {
      setError("Add at least one configuration before requesting a quote.");
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
        configurations: items.map((i) => ({
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
        provisionalTotal,
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
      clearCart();
      navigate(`/orders/${orderId}`);
    } catch (err) {
      setError("Something went wrong submitting your request. Please try again.");
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

        <h1>What you're requesting:</h1>

        <div className="quote-layout">
          {/* Left: selected configurations */}
          <div className="quote-left">
            {items.length === 0 && (
              <p>
                Your quote request is empty.{" "}
                <Link to="/showroom">Browse the showroom</Link> to add a
                configuration.
              </p>
            )}

            {items.map((item) => (
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

            <Link to="/showroom" className="add-another-link">
              + Add another quote
            </Link>

            <div className="provisional-breakdown">
              <div className="price-row">
                <span>Subtotal</span>
                <span>₱{subtotal.toLocaleString()}</span>
              </div>
              <div className="price-row">
                <span>Hardware &amp; installation ({Math.round(hardwareRate * 100)}%)</span>
                <span>₱{hardwareInstallFee.toLocaleString()}</span>
              </div>
              <div className="price-row price-row-total-light">
                <span>Provisional Total</span>
                <span>₱{provisionalTotal.toLocaleString()}</span>
              </div>
              <p className="price-deposit-note-dark">
                50% deposit to start: ₱{deposit.toLocaleString()}
              </p>
            </div>

            <p className="quote-count-line">
              {items.length} Selected Configuration{items.length !== 1 && "s"} ·
              Provisional: ₱{provisionalTotal.toLocaleString()}
            </p>
          </div>

          {/* Right: inquiry details form */}
          <form className="quote-right" onSubmit={handleSubmit}>
            <h4>Inquiry Details:</h4>

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
                value={contactNumber}
                onChange={(e) => setContactNumber(e.target.value)}
                placeholder="+63 9XX XXX XXXX"
              />
            </label>

            <label>
              Location
              <input
                value={location}
                onChange={(e) => setLocation(e.target.value)}
                placeholder="e.g. Metro Manila"
              />
            </label>

            <label>
              Site Address
              <input
                value={siteAddress}
                onChange={(e) => setSiteAddress(e.target.value)}
                placeholder="Street, Barangay, City"
              />
            </label>

            <label>
              Preferred Site Visit Date
              <input
                type="date"
                value={preferredVisitDate}
                onChange={(e) => setPreferredVisitDate(e.target.value)}
              />
            </label>

            <label>
              Floor Plan / Space Photo URL (optional)
              <input
                value={floorPlanUrl}
                onChange={(e) => setFloorPlanUrl(e.target.value)}
                placeholder="https://…"
              />
            </label>

            <label>
              Project Details
              <textarea
                rows={4}
                value={projectDetails}
                onChange={(e) => setProjectDetails(e.target.value)}
                placeholder="Tell us more about your space and timeline…"
              />
            </label>

            <label className="checkbox-label">
              <input
                type="checkbox"
                checked={consentGiven}
                onChange={(e) => setConsentGiven(e.target.checked)}
              />
              I agree on the Privacy Policy and consent to be contacted
              regarding this inquiry.
            </label>

            {error && <p className="form-error">{error}</p>}

            <button
              type="submit"
              className="btn btn-primary"
              disabled={submitting || items.length === 0}
            >
              {submitting ? "Submitting…" : "Submit Customization Request"}
            </button>
          </form>
        </div>
      </div>

      <Footer />
    </div>
  );
}