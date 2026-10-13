import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import Navbar from "../../components/Navbar";
import Footer from "../../components/Footer";
import { getCategories } from "../../lib/categories";

// Hero photo — matches the Figma prototype's circular hero shot
// (warm kitchen/dining interior, pendant lighting).
const HERO_IMAGE_URL =
  "https://images.pexels.com/photos/6782474/pexels-photo-6782474.jpeg";

export default function Homepage() {
  const [categories, setCategories] = useState([]);
  const [loadingCategories, setLoadingCategories] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const data = await getCategories();
        if (!cancelled) setCategories(data);
      } catch (err) {
        if (!cancelled) setError("Couldn't load categories right now.");
      } finally {
        if (!cancelled) setLoadingCategories(false);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="homepage">
      <Navbar />

      <section className="hero">
        <div className="hero-inner">
          <div className="hero-text">
            <p className="hero-eyebrow">SINCE 2012 · DANNY &amp; MELODY PADERNA</p>
            <h1>
              Top-notch modular furniture, <span className="accent">reasonably priced.</span>
            </h1>
            <p className="hero-sub">
              MDP Modular Systems is creating top-notch and reasonably priced
              customized furniture — from modular kitchens to office fit-outs.
              Every identity crafted for the space it will occupy, and assembled
              in detail.
            </p>
            <div className="hero-cta">
              <Link to="/showroom" className="btn btn-primary">
                Browse the Showroom
              </Link>
              <Link to="/quote-request" className="btn btn-secondary">
                Request a Quote
              </Link>
            </div>
            <div className="hero-stats">
              <div>
                <strong>12+</strong>
                <span>Years of Craft</span>
              </div>
              <div>
                <strong>500+</strong>
                <span>Modular Projects</span>
              </div>
              <div>
                <strong>100%</strong>
                <span>Customized Builds</span>
              </div>
            </div>
          </div>

          <div className="hero-visual">
            <div className="hero-image-circle">
              <img src={HERO_IMAGE_URL} alt="A warmly lit modular kitchen built by MDP" />
            </div>
            <span className="hero-badge">MDP</span>
          </div>
        </div>
      </section>

      <section className="excellence">
        <p className="section-eyebrow">ABOUT OUR COMPANY</p>
        <h2>
          Recognized for <span className="accent">Excellence</span>
        </h2>
        <div className="excellence-cards">
          <div className="excellence-card">
            <span className="card-num">01</span>
            <h3>EXCELLENCE</h3>
            <p>A strong dedication to creating and assembling anything for the future — delivered to the highest standard since 2012.</p>
          </div>
          <div className="excellence-card">
            <span className="card-num">02</span>
            <h3>METICULOUSNESS</h3>
            <p>Every cut, hinge, and finish is measured twice. Your modular piece fits the space exactly as planned.</p>
          </div>
          <div className="excellence-card">
            <span className="card-num">03</span>
            <h3>INTEGRITY</h3>
            <p>Transparent quotes, honest timelines, and an orderly handover — a lasting culture built on trust.</p>
          </div>
        </div>
      </section>

      <section className="browse-category">
        <p className="section-eyebrow">BROWSE BY CATEGORY</p>
        <h2>
          Kitchens, offices &amp; <span className="accent">more</span>
        </h2>

        {loadingCategories && <p>Loading categories…</p>}
        {error && <p className="form-error">{error}</p>}

        <div className="category-grid">
          {categories.map((cat) => (
            <Link
              to={`/showroom/${cat.id}`}
              key={cat.id}
              className="category-card"
              style={{ backgroundImage: `url(${cat.imageUrl})` }}
            >
              <span className="category-card-label">Browse {cat.name}</span>
            </Link>
          ))}
        </div>
      </section>

      <section className="two-ways">
        <p className="section-eyebrow">HOW ORDERING WORKS</p>
        <h2>Two ways to order</h2>
        <div className="two-ways-cards">
          <div className="way-card way-card-highlight">
            <p className="way-label">PATH A</p>
            <h3>Browse &amp; Configure</h3>
            <ol>
              <li>Choose your furniture type</li>
              <li>Browse the list and pick a style</li>
              <li>Customize size, finish, hardware</li>
              <li>Submit for a provisional quote</li>
              <li>Track and approve when ready</li>
            </ol>
            <Link to="/showroom" className="btn btn-primary">
              → Go to Showroom
            </Link>
          </div>
          <div className="way-card">
            <p className="way-label">PATH B</p>
            <h3>Request, Approve &amp; Track</h3>
            <ol>
              <li>Skip straight to a quote request</li>
              <li>Tell us your project and site info</li>
              <li>Approve &amp; pay the 50% deposit</li>
              <li>We build, install and finish</li>
              <li>Receive the ready-for-delivery notice</li>
            </ol>
            <Link to="/quote-request" className="btn btn-secondary">
              → Request a Quote
            </Link>
          </div>
        </div>
      </section>

      <Footer />
    </div>
  );
}