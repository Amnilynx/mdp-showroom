import { Link } from "react-router-dom";

const FACEBOOK_URL = "https://www.facebook.com/MdpModularKitchenAndCabinets";

export default function Footer() {
  return (
    <footer className="site-footer">
      <div className="footer-col">
        <h4>MDP MODULAR SYSTEM</h4>
        <p>
          Top-notch and reasonably priced customized furniture. Owned by
          Danny &amp; Melody Paderna. Serving clients since 2012 with
          excellence, meticulousness and integrity.
        </p>
        <a
          href={FACEBOOK_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="footer-facebook-link"
        >
          Visit us on Facebook →
        </a>
      </div>
      <div className="footer-col">
        <h4>ORDERING</h4>
        <Link to="/showroom">Showroom</Link>
        <Link to="/quote-request">Request Quote</Link>
        <Link to="/orders">Track Order</Link>
        <button
          type="button"
          className="footer-link-btn"
          onClick={() => window.dispatchEvent(new CustomEvent("mdp:open-chat", { detail: {} }))}
        >
          Message us
        </button>
        <Link to="/privacy">Privacy Policy</Link>
      </div>
      <div className="footer-col">
        <h4>VISIT US</h4>
        <p>Modular Works Showroom</p>
        <p>Open Mon–Sat, 9am–6pm</p>
        <a href={FACEBOOK_URL} target="_blank" rel="noopener noreferrer">
          facebook.com/MdpModularKitchenAndCabinets
        </a>
      </div>
      <div className="footer-bottom">
        © 2026 MDP Modular Systems · Prototype build
      </div>
    </footer>
  );
}