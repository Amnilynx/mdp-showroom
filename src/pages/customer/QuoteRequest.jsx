import { useMemo, useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import Navbar from "../../components/Navbar";
import Footer from "../../components/Footer";
import Breadcrumb from "../../components/Breadcrumb";
import StepProgress from "../../components/StepProgress";
import { useAuth } from "../../context/AuthContext";
import {
  checkName, checkEmail, checkPhone, checkRequired, checkFutureDate, todayISO, friendlyError,
} from "../../lib/validators";
import { useCart } from "../../context/CartContext";
import {
  createOrder,
  DEPOSIT_RATE_STANDARD,
  DEPOSIT_RATE_COMPANY,
} from "../../lib/orders";
import { configLines, lineAmount, peso, sizeText } from "../../lib/breakdown";

// One labelled field. A red * marks required fields (like Google Forms),
// "(optional)" marks the rest, and the message under the box says what to fix.
function Field({ id, label, required, optional, error, hint, children }) {
  return (
    <div className="qf-field">
      <label htmlFor={id} className="qf-label">
        {label}
        {required && <span className="qf-req" aria-hidden="true"> *</span>}
        {optional && <span className="qf-opt"> (optional)</span>}
      </label>
      {children}
      {error ? (
        <span className="qf-error" id={id + "-err"} role="alert">
          <span aria-hidden="true">⚠</span> {error}
        </span>
      ) : (
        hint && <span className="qf-hint">{hint}</span>
      )}
    </div>
  );
}

// Order the fields appear on screen, so the first problem can be focused.
const FIELD_ORDER = [
  "items", "companyName", "contactName", "contactEmail", "contactNumber",
  "street", "barangay", "city", "province", "zip",
  "preferredVisitDate", "projectDetails", "consentGiven",
];
const FIELD_NAMES = {
  items: "Items in your request",
  companyName: "Company name",
  contactName: "Full name",
  contactEmail: "Email address",
  contactNumber: "Mobile number",
  street: "House / lot / block and street",
  barangay: "Barangay",
  city: "City / municipality",
  province: "Province",
  zip: "ZIP code",
  preferredVisitDate: "Preferred site visit date",
  projectDetails: "Project description",
  consentGiven: "Privacy Policy agreement",
};

const required = (v, msg = "This field is required.") => (String(v || "").trim() ? "" : msg);

export default function QuoteRequest() {
  const { user, profile } = useAuth();
  const { items, removeItem, clearCart } = useCart();
  const navigate = useNavigate();

  // Customer details
  const [contactName, setContactName] = useState(profile?.fullName || "");
  const [contactEmail, setContactEmail] = useState(profile?.email || "");
  const [contactNumber, setContactNumber] = useState(profile?.phone || "");
  // Site address (one block instead of the old "Location" + "Site Address")
  const [street, setStreet] = useState("");
  const [barangay, setBarangay] = useState("");
  const [city, setCity] = useState("");
  const [province, setProvince] = useState("");
  const [zip, setZip] = useState("");
  // Project
  const [preferredVisitDate, setPreferredVisitDate] = useState("");
  const [projectDetails, setProjectDetails] = useState("");
  const [consentGiven, setConsentGiven] = useState(false);
  // "catalog" = built from the showroom (50% deposit); "pure_custom" = a
  // from-scratch commission for a company, quoted by MDP (30% deposit).
  const [orderType, setOrderType] = useState("catalog");
  const [companyName, setCompanyName] = useState("");
  const pureCustom = orderType === "pure_custom";

  const [touched, setTouched] = useState({});
  const [submitAttempted, setSubmitAttempted] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [serverError, setServerError] = useState("");

  const subtotal = items.reduce((sum, i) => sum + (i.subtotal || 0), 0);
  // No separate hardware & installation fee: the quote is just the items.
  const provisionalTotal = subtotal;
  const depositRate = pureCustom ? DEPOSIT_RATE_COMPANY : DEPOSIT_RATE_STANDARD;
  const depositPct = Math.round(depositRate * 100);
  const deposit = pureCustom ? 0 : Math.round(provisionalTotal * depositRate);

  // Every field checked on every render, so messages appear and clear as the
  // person types instead of only after a failed submit.
  const errors = useMemo(() => {
    const e = {};
    if (pureCustom) e.companyName = required(companyName, "Enter your company name.");
    else if (items.length === 0) e.items = "Add at least one item from the showroom, or choose Pure custom above.";

    e.contactName = checkName(contactName, "full name");
    e.contactEmail = checkEmail(contactEmail);
    e.contactNumber = checkPhone(contactNumber);

    e.street = required(street) || checkRequired(street, "the house / lot / block number and street", 5);
    e.barangay = required(barangay) || checkRequired(barangay, "the barangay", 2);
    e.city = required(city) || checkRequired(city, "the city or municipality", 2);
    e.province = required(province) || checkRequired(province, "the province", 2);
    e.zip = zip.trim() && !/^\d{4}$/.test(zip.trim()) ? "ZIP code must be 4 digits." : "";

    e.preferredVisitDate = checkFutureDate(preferredVisitDate, "site visit date", { required: true });
    if (pureCustom) {
      e.projectDetails =
        required(projectDetails) ||
        (projectDetails.trim().length < 30
          ? "Describe what you need built in a few sentences (at least 30 characters) so we can quote it."
          : "");
    }
    e.consentGiven = consentGiven ? "" : "Please agree to the Privacy Policy to continue.";

    // keep only real problems
    Object.keys(e).forEach((k) => { if (!e[k]) delete e[k]; });
    return e;
  }, [
    pureCustom, companyName, items.length, contactName, contactEmail, contactNumber,
    street, barangay, city, province, zip, preferredVisitDate,
    projectDetails, consentGiven,
  ]);

  const touch = (k) => setTouched((t) => (t[k] ? t : { ...t, [k]: true }));
  const shown = (k) => ((submitAttempted || touched[k]) && errors[k]) || "";
  // Class for an input: red when it shows an error, green once filled correctly.
  const cls = (k, filled) =>
    "qf-input" + (shown(k) ? " qf-input-invalid" : touched[k] && filled && !errors[k] ? " qf-input-valid" : "");
  const aria = (k) => ({
    "aria-invalid": shown(k) ? "true" : undefined,
    "aria-describedby": shown(k) ? `qf-${k}-err` : undefined,
  });

  const problemKeys = FIELD_ORDER.filter((k) => errors[k]);

  async function handleSubmit(e) {
    e.preventDefault();
    setServerError("");
    setSubmitAttempted(true);

    if (problemKeys.length > 0) {
      const first = problemKeys[0];
      const el = document.getElementById(first === "items" ? "qf-items" : "qf-" + first);
      if (el) {
        el.scrollIntoView({ behavior: "smooth", block: "center" });
        if (typeof el.focus === "function") el.focus({ preventScroll: true });
      }
      return;
    }

    const fullAddress = [
      street.trim(),
      "Brgy. " + barangay.trim().replace(/^brgy\.?\s*/i, ""),
      city.trim(),
      province.trim() + (zip.trim() ? " " + zip.trim() : ""),
    ].join(", ");

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
          // Only newer cart items carry the split; Firestore rejects undefined.
          ...(typeof i.finishAddOn === "number" && { finishAddOn: i.finishAddOn }),
          ...(typeof i.hardwareAddOn === "number" && { hardwareAddOn: i.hardwareAddOn }),
          addOnsTotal: i.addOnsTotal,
          subtotal: i.subtotal,
        })),
        provisionalTotal: pureCustom ? 0 : provisionalTotal,
        depositAmount: deposit,
        contact: {
          name: contactName.trim(),
          email: contactEmail.trim(),
          phone: contactNumber.trim(),
          // The admin's Site Visit card reads the date from here.
          preferredVisitDate,
        },
        // Kept so existing admin screens, search and receipts still work:
        // "location" is the city/province line, "siteAddress" the full address.
        location: `${city.trim()}, ${province.trim()}`,
        siteAddress: fullAddress,
        siteAddressParts: {
          street: street.trim(),
          barangay: barangay.trim(),
          city: city.trim(),
          province: province.trim(),
          zip: zip.trim() || null,
        },
        preferredVisitDate,
        projectDetails: pureCustom ? projectDetails.trim() : "",
        consentGiven,
      });
      if (!pureCustom) clearCart();
      navigate(`/orders/${orderId}`, { state: { justSubmitted: true } });
    } catch (err) {
      setServerError("We couldn't submit your request. " + friendlyError(err, "Please try again."));
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

        <h1>{pureCustom ? "Tell us about your custom project" : "Review your quote request"}</h1>

        <div className="quote-layout">
          {/* Left: what you're asking us to quote, itemized */}
          <div className="quote-left">
            {pureCustom && (
              <div className="custom-intro">
                <p><strong>How a pure custom order works</strong></p>
                <ol>
                  <li>Tell us about your company and project on the right.</li>
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
              <div id="qf-items" tabIndex={-1}>
                <p>
                  Your quote request is empty.{" "}
                  <Link to="/showroom">Browse the showroom</Link> to add an item.
                </p>
                {submitAttempted && errors.items && (
                  <p className="qf-error qf-items-error" role="alert">
                    <span aria-hidden="true">⚠</span> {errors.items}
                  </p>
                )}
              </div>
            )}

            {!pureCustom && items.map((item) => (
              <div className="qf-item" key={item.cartId}>
                <div className="qf-item-head">
                  <div>
                    <strong>{item.furnitureName} — {item.shapeType}</strong>
                    <p className="qf-item-meta">{sizeText(item.dimensions)}</p>
                  </div>
                  <button
                    type="button"
                    className="quote-item-remove"
                    onClick={() => removeItem(item.cartId)}
                  >
                    Remove
                  </button>
                </div>

                <div className="qf-lines" aria-label={`Price breakdown for ${item.furnitureName}`}>
                  {configLines(item).map((l) => (
                    <div
                      key={l.key}
                      className={"qf-line" + (l.key !== "base" && l.amount === 0 ? " qf-line-included" : "")}
                    >
                      <span>{l.label}</span>
                      <span>{lineAmount(l)}</span>
                    </div>
                  ))}
                  <div className="qf-line qf-line-subtotal">
                    <span>Item subtotal</span>
                    <span>{peso(item.subtotal)}</span>
                  </div>
                </div>

                {item.customRequest?.part && (
                  <p className="qf-custom-note">
                    <strong>Custom request · {item.customRequest.part}:</strong>{" "}
                    {item.customRequest.note || "No details added."}{" "}
                    <em>(priced by MDP after review)</em>
                  </p>
                )}
              </div>
            ))}

            {!pureCustom && (
              <Link to="/showroom" className="add-another-link">
                + Add another item
              </Link>
            )}

            {!pureCustom && items.length > 0 && (
              <div className="provisional-breakdown">
                <p className="qf-summary-label">Estimated price breakdown</p>
                {items.map((item) => (
                  <div className="price-row" key={item.cartId}>
                    <span>{item.furnitureName} — {item.shapeType}</span>
                    <span>{peso(item.subtotal)}</span>
                  </div>
                ))}
                <div className="price-row price-row-total-light">
                  <span>Estimated total</span>
                  <span>{peso(provisionalTotal)}</span>
                </div>
                <p className="price-deposit-note-dark">
                  {depositPct}% deposit to start: {peso(deposit)}
                </p>
                <p className="qf-summary-note">
                  This is a system estimate. MDP will review your request, visit the site if needed,
                  and confirm the final price before you approve or pay anything.
                </p>
              </div>
            )}

            <p className="quote-count-line">
              {pureCustom
                ? `Pure custom order · Price quoted by MDP · ${depositPct}% deposit`
                : `${items.length} item${items.length !== 1 ? "s" : ""} · Estimated total: ${peso(provisionalTotal)}`}
            </p>
          </div>

          {/* Right: who you are, where the project is, what you need */}
          <form className="quote-right" onSubmit={handleSubmit} noValidate>
            <p className="qf-required-note">
              <span className="qf-req">*</span> Required
            </p>

            {/* ---- Customer details ---- */}
            <div role="group" className="qf-section" aria-labelledby="qf-h-customer">
              <h4 className="qf-section-title" id="qf-h-customer">Customer details</h4>

              {pureCustom && (
                <Field id="qf-companyName" label="Company name" required error={shown("companyName")}>
                  <input
                    id="qf-companyName"
                    className={cls("companyName", companyName)}
                    value={companyName}
                    onChange={(e) => setCompanyName(e.target.value)}
                    onBlur={() => touch("companyName")}
                    placeholder="e.g. ABC Trading Corp."
                    autoComplete="organization"
                    {...aria("companyName")}
                  />
                </Field>
              )}

              <div className="qf-grid-2">
                <Field id="qf-contactName" label="Full name" required error={shown("contactName")}>
                  <input
                    id="qf-contactName"
                    className={cls("contactName", contactName)}
                    value={contactName}
                    onChange={(e) => setContactName(e.target.value)}
                    onBlur={() => touch("contactName")}
                    autoComplete="name"
                    {...aria("contactName")}
                  />
                </Field>
                <Field id="qf-contactEmail" label="Email address" required error={shown("contactEmail")}>
                  <input
                    id="qf-contactEmail"
                    type="email"
                    className={cls("contactEmail", contactEmail)}
                    value={contactEmail}
                    onChange={(e) => setContactEmail(e.target.value)}
                    onBlur={() => touch("contactEmail")}
                    autoComplete="email"
                    {...aria("contactEmail")}
                  />
                </Field>
              </div>

              <Field
                id="qf-contactNumber"
                label="Mobile number"
                required
                error={shown("contactNumber")}
                hint="We use this to confirm your site visit."
              >
                <input
                  id="qf-contactNumber"
                  type="tel"
                  inputMode="tel"
                  className={cls("contactNumber", contactNumber)}
                  value={contactNumber}
                  onChange={(e) => setContactNumber(e.target.value)}
                  onBlur={() => touch("contactNumber")}
                  placeholder="0917 123 4567"
                  autoComplete="tel"
                  {...aria("contactNumber")}
                />
              </Field>
            </div>

            {/* ---- Site address (location + site address merged) ---- */}
            <div role="group" className="qf-section" aria-labelledby="qf-h-address">
              <h4 className="qf-section-title" id="qf-h-address">Site address</h4>
              <p className="qf-section-help">Where the furniture will be installed.</p>

              <Field
                id="qf-street"
                label="House / lot / block no. and street"
                required
                error={shown("street")}
              >
                <input
                  id="qf-street"
                  className={cls("street", street)}
                  value={street}
                  onChange={(e) => setStreet(e.target.value)}
                  onBlur={() => touch("street")}
                  placeholder="e.g. Lot 5 Blk 3, Rizal St."
                  autoComplete="address-line1"
                  {...aria("street")}
                />
              </Field>

              <div className="qf-grid-2">
                <Field id="qf-barangay" label="Barangay" required error={shown("barangay")}>
                  <input
                    id="qf-barangay"
                    className={cls("barangay", barangay)}
                    value={barangay}
                    onChange={(e) => setBarangay(e.target.value)}
                    onBlur={() => touch("barangay")}
                    placeholder="e.g. Poblacion"
                    {...aria("barangay")}
                  />
                </Field>
                <Field id="qf-city" label="City / municipality" required error={shown("city")}>
                  <input
                    id="qf-city"
                    className={cls("city", city)}
                    value={city}
                    onChange={(e) => setCity(e.target.value)}
                    onBlur={() => touch("city")}
                    placeholder="e.g. Bustos"
                    autoComplete="address-level2"
                    {...aria("city")}
                  />
                </Field>
              </div>

              <div className="qf-grid-2">
                <Field id="qf-province" label="Province" required error={shown("province")}>
                  <input
                    id="qf-province"
                    className={cls("province", province)}
                    value={province}
                    onChange={(e) => setProvince(e.target.value)}
                    onBlur={() => touch("province")}
                    placeholder="e.g. Bulacan"
                    autoComplete="address-level1"
                    {...aria("province")}
                  />
                </Field>
                <Field id="qf-zip" label="ZIP code" optional error={shown("zip")}>
                  <input
                    id="qf-zip"
                    inputMode="numeric"
                    maxLength={4}
                    className={cls("zip", zip)}
                    value={zip}
                    onChange={(e) => setZip(e.target.value.replace(/\D/g, ""))}
                    onBlur={() => touch("zip")}
                    placeholder="e.g. 3007"
                    autoComplete="postal-code"
                    {...aria("zip")}
                  />
                </Field>
              </div>
            </div>

            {/* ---- Project ---- */}
            <div role="group" className="qf-section" aria-labelledby="qf-h-project">
              <h4 className="qf-section-title" id="qf-h-project">{pureCustom ? "Project & site visit" : "Site visit"}</h4>

              <Field
                id="qf-preferredVisitDate"
                label="Preferred site visit date"
                required
                error={shown("preferredVisitDate")}
                hint="MDP confirms the actual date with you."
              >
                <input
                  id="qf-preferredVisitDate"
                  type="date"
                  min={todayISO()}
                  className={cls("preferredVisitDate", preferredVisitDate)}
                  value={preferredVisitDate}
                  onChange={(e) => setPreferredVisitDate(e.target.value)}
                  onBlur={() => touch("preferredVisitDate")}
                  {...aria("preferredVisitDate")}
                />
              </Field>

              {pureCustom && (
                <Field
                  id="qf-projectDetails"
                  label="Describe your project (what, where, how many, timeline)"
                  required
                  error={shown("projectDetails")}
                >
                  <textarea
                    id="qf-projectDetails"
                    className={cls("projectDetails", projectDetails)}
                    rows={7}
                    value={projectDetails}
                    onChange={(e) => setProjectDetails(e.target.value)}
                    onBlur={() => touch("projectDetails")}
                    placeholder="e.g. 12 display counters for our new store branch, laminated, with LED strips. Plans to follow in chat."
                    {...aria("projectDetails")}
                  />
                </Field>
              )}
            </div>

            {/* ---- Consent ---- */}
            <div className={"qf-consent" + (shown("consentGiven") ? " qf-consent-invalid" : "")}>
              <label className="checkbox-label">
                <input
                  id="qf-consentGiven"
                  type="checkbox"
                  checked={consentGiven}
                  onChange={(e) => { setConsentGiven(e.target.checked); touch("consentGiven"); }}
                  {...aria("consentGiven")}
                />
                <span>
                  I agree to the{" "}
                  <Link to="/privacy" target="_blank" rel="noopener noreferrer">
                    Privacy Policy
                  </Link>{" "}
                  and consent to be contacted about this quote request.
                  <span className="qf-req" aria-hidden="true"> *</span>
                </span>
              </label>
              {shown("consentGiven") && (
                <span className="qf-error" id="qf-consentGiven-err" role="alert">
                  <span aria-hidden="true">⚠</span> {errors.consentGiven}
                </span>
              )}
            </div>

            {/* ---- Result banner ---- */}
            {serverError && (
              <div className="qf-banner qf-banner-error" role="alert">
                <strong>Request not sent</strong>
                {serverError}
              </div>
            )}
            {submitAttempted && !serverError && problemKeys.length > 0 && (
              <div className="qf-banner qf-banner-error" role="alert">
                <strong>
                  {problemKeys.length === 1 ? "1 thing needs fixing" : `${problemKeys.length} things need fixing`}
                </strong>
                Please check the highlighted {problemKeys.length === 1 ? "field" : "fields"}:
                <ul>
                  {problemKeys.map((k) => <li key={k}>{FIELD_NAMES[k]}</li>)}
                </ul>
              </div>
            )}

            <button type="submit" className="btn btn-primary" disabled={submitting}>
              {submitting ? "Sending your request…" : "Submit Quote Request"}
            </button>
          </form>
        </div>
      </div>

      <Footer />
    </div>
  );
}
