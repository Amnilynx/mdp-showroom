import { useEffect, useState } from "react";
import Navbar from "../../components/Navbar";
import Footer from "../../components/Footer";
import Breadcrumb from "../../components/Breadcrumb";
import { getPortfolioItems } from "../../lib/portfolio";

// Public "Our Work" gallery — completed real projects, separate from the
// orderable catalog at /showroom. No login required, no customize/order
// button; purely inspirational/trust-building. Each card opens a simple
// lightbox so a multi-photo project can be browsed without leaving the page.
export default function Portfolio() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [lightbox, setLightbox] = useState(null); // { item, photoIndex }

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const data = await getPortfolioItems();
        if (!cancelled) setItems(data);
      } catch (err) {
        if (!cancelled) setError("Couldn't load the gallery right now.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, []);

  function openLightbox(item) {
    setLightbox({ item, photoIndex: 0 });
  }

  function closeLightbox() {
    setLightbox(null);
  }

  function nextPhoto(e) {
    e.stopPropagation();
    setLightbox((lb) => ({
      ...lb,
      photoIndex: (lb.photoIndex + 1) % lb.item.imageUrls.length,
    }));
  }

  function prevPhoto(e) {
    e.stopPropagation();
    setLightbox((lb) => ({
      ...lb,
      photoIndex: (lb.photoIndex - 1 + lb.item.imageUrls.length) % lb.item.imageUrls.length,
    }));
  }

  return (
    <div className="showroom-page">
      <Navbar />

      <div className="showroom-inner">
        <Breadcrumb crumbs={[{ label: "Home", to: "/" }, { label: "Our Work" }]} />

        <h1>Our Work</h1>
        <p className="showroom-subtitle">
          A look at completed projects we've built for past clients —
          real pieces, in real homes.
        </p>

        {loading && <p>Loading gallery…</p>}
        {error && <p className="form-error">{error}</p>}

        <div className="portfolio-grid">
          {items.map((item) => (
            <button
              type="button"
              className="portfolio-card"
              key={item.id}
              onClick={() => openLightbox(item)}
            >
              <div
                className="portfolio-card-image"
                style={{ backgroundImage: `url(${item.imageUrls?.[0]})` }}
              >
                {item.imageUrls?.length > 1 && (
                  <span className="portfolio-card-count">
                    📷 {item.imageUrls.length}
                  </span>
                )}
              </div>
              <div className="portfolio-card-body">
                <h3>{item.title}</h3>
                {item.description && <p>{item.description}</p>}
              </div>
            </button>
          ))}
        </div>

        {!loading && items.length === 0 && (
          <p className="orders-empty">
            Our gallery is still being put together — check back soon.
          </p>
        )}
      </div>

      {lightbox && (
        <div className="modal-overlay" onClick={closeLightbox}>
          <div className="portfolio-lightbox" onClick={(e) => e.stopPropagation()}>
            <button
              type="button"
              className="portfolio-lightbox-close"
              onClick={closeLightbox}
              aria-label="Close"
            >
              ✕
            </button>
            <div className="portfolio-lightbox-image-wrap">
              {lightbox.item.imageUrls.length > 1 && (
                <button
                  type="button"
                  className="portfolio-lightbox-nav portfolio-lightbox-prev"
                  onClick={prevPhoto}
                  aria-label="Previous photo"
                >
                  ‹
                </button>
              )}
              <img
                src={lightbox.item.imageUrls[lightbox.photoIndex]}
                alt={lightbox.item.title}
                className="portfolio-lightbox-image"
              />
              {lightbox.item.imageUrls.length > 1 && (
                <button
                  type="button"
                  className="portfolio-lightbox-nav portfolio-lightbox-next"
                  onClick={nextPhoto}
                  aria-label="Next photo"
                >
                  ›
                </button>
              )}
            </div>
            <div className="portfolio-lightbox-caption">
              <h3>{lightbox.item.title}</h3>
              {lightbox.item.description && <p>{lightbox.item.description}</p>}
              {lightbox.item.imageUrls.length > 1 && (
                <p className="portfolio-lightbox-counter">
                  {lightbox.photoIndex + 1} / {lightbox.item.imageUrls.length}
                </p>
              )}
            </div>
          </div>
        </div>
      )}

      <Footer />
    </div>
  );
}