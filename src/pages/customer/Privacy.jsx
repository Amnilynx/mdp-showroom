import { useNavigate } from "react-router-dom";
import Navbar from "../../components/Navbar";
import Footer from "../../components/Footer";
import Breadcrumb from "../../components/Breadcrumb";
import { COMPANY_EMAIL } from "../../lib/contactConfig";

// Plain-language privacy notice for the MDP Modular Systems ordering site,
// written around the Data Privacy Act of 2012 (RA 10173). The owners should
// read and approve this wording before the site goes live.
export default function Privacy() {
  const navigate = useNavigate();

  // Opened in a new tab from the forms (so nothing typed is lost): close
  // that tab to return. If it can't be closed, or it was opened normally,
  // go back one page, or home if there is nothing to go back to.
  function goBack() {
    if (window.history.length <= 1) {
      window.close();
      setTimeout(() => navigate("/"), 150);
    } else {
      navigate(-1);
    }
  }

  const backButton = (
    <div className="legal-back-row">
      <button type="button" className="btn btn-secondary legal-back" onClick={goBack}>
        ← Back
      </button>
      <button
        type="button"
        className="btn btn-primary legal-back"
        onClick={() => navigate("/quote-request")}
      >
        Back to Quote Request
      </button>
    </div>
  );

  return (
    <div className="showroom-page">
      <Navbar />
      <div className="showroom-inner">
        <Breadcrumb crumbs={[{ label: "Home", to: "/" }, { label: "Privacy Policy" }]} />
        <article className="legal-page">
          {backButton}
          <h1>Privacy Policy</h1>
          <p className="legal-updated">Last updated: October 2026</p>
          <p>
            MDP Modular Systems ("MDP", "we") respects your privacy. This page explains what
            personal information this website collects, why we collect it, and your rights under
            the Data Privacy Act of 2012 (Republic Act No. 10173).
          </p>

          <h2>1. What we collect</h2>
          <ul>
            <li><b>Account details:</b> your full name, email address, phone number, and a password (stored securely by our sign-in provider; we never see it). If you use Google sign-in, your Google name and email.</li>
            <li><b>Inquiry and order details:</b> your contact information, location and site address, preferred site-visit date, floor-plan link, project details, and the furniture you configure.</li>
            <li><b>Messages and files:</b> chat messages with MDP and any documents you upload (such as a letter of notice or quotation files).</li>
            <li><b>Payment records:</b> reference numbers, amounts, and screenshots or photos of receipts you upload. We do not collect card numbers; payments are made outside this website.</li>
          </ul>

          <h2>2. Why we collect it</h2>
          <ul>
            <li>To prepare quotations and process, produce, and deliver your order.</li>
            <li>To contact you about your inquiry or order.</li>
            <li>To record deposits, payments, refunds, and change requests.</li>
            <li>To keep the website secure and prevent misuse.</li>
          </ul>
          <p>We do not sell your information or use it for advertising.</p>

          <h2>3. Who can see it</h2>
          <p>
            Your orders, messages, files, and receipts are visible only to you and to the MDP
            owners and authorized staff. Other customers cannot see them. We share information
            only with service providers needed to run the site (Google Firebase hosts our database
            and sign-in) and when the law requires it.
          </p>

          <h2>4. How long we keep it</h2>
          <p>
            We keep order records for as long as needed to serve you, handle warranty or payment
            questions, and meet business and legal record-keeping needs. You can ask us to delete
            your account data at any time (see below), except records we are required to keep.
          </p>

          <h2>5. How we protect it</h2>
          <p>
            Access is limited by role (customer or manager), accounts are protected by sign-in,
            managers use a one-time code, sessions time out when idle, and database access rules
            allow each customer to read only their own records.
          </p>

          <h2>6. Your rights</h2>
          <p>
            You may ask to be informed about, access, correct, or delete your personal information,
            to object to its processing, and to withdraw your consent. You may also complain to the
            National Privacy Commission (privacy.gov.ph).
          </p>

          <h2>7. Contact us</h2>
          <p>
            For any privacy request or question, email{" "}
            <a href={`mailto:${COMPANY_EMAIL}`}>{COMPANY_EMAIL}</a> or message us on our Facebook
            page.
          </p>

          <h2>8. Your consent</h2>
          <p>
            By ticking the consent box on the quote request form, or by creating an account, you
            agree to this policy and to be contacted about your inquiry. If we change this policy,
            the date at the top will be updated.
          </p>
          <div className="legal-back-bottom">{backButton}</div>
        </article>
      </div>
      <Footer />
    </div>
  );
}