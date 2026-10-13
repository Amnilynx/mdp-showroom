import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import Navbar from "../../components/Navbar";
import Footer from "../../components/Footer";
import Breadcrumb from "../../components/Breadcrumb";
import StepProgress from "../../components/StepProgress";
import { getCategoryById } from "../../lib/categories";
import { getFurnitureByCategory } from "../../lib/furniture";

const SHAPE_FILTERS = ["Straight", "L-Shape", "U-Shape", "Island"];

export default function ShowroomBrowseList() {
  const { categoryId } = useParams();
  const [category, setCategory] = useState(null);
  const [furniture, setFurniture] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [activeShape, setActiveShape] = useState(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      setError("");
      try {
        const [cat, items] = await Promise.all([
          getCategoryById(categoryId),
          getFurnitureByCategory(categoryId),
        ]);
        if (!cancelled) {
          setCategory(cat);
          setFurniture(items);
        }
      } catch (err) {
        if (!cancelled) setError("Couldn't load this category right now.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [categoryId]);

  const filtered = furniture.filter((item) => {
    const matchesSearch = item.name
      .toLowerCase()
      .includes(search.toLowerCase());
    const matchesShape = !activeShape || item.shapeType === activeShape;
    return matchesSearch && matchesShape;
  });

  return (
    <div className="showroom-page">
      <Navbar />

      <div className="showroom-inner">
        <Breadcrumb
          crumbs={[
            { label: "Home", to: "/" },
            { label: "Showroom", to: "/showroom" },
            { label: category?.name || "…" },
          ]}
        />
        <StepProgress currentStep={2} />

        <h1>{category?.name || "Browse"}</h1>
        <p className="showroom-subtitle">
          {category?.description}
        </p>

        <div className="browse-toolbar">
          <input
            type="text"
            placeholder="Search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="browse-search"
          />
          <div className="shape-filters">
            {SHAPE_FILTERS.map((shape) => (
              <button
                key={shape}
                className={
                  "shape-pill" + (activeShape === shape ? " shape-pill-active" : "")
                }
                onClick={() =>
                  setActiveShape(activeShape === shape ? null : shape)
                }
              >
                {shape}
              </button>
            ))}
          </div>
        </div>

        {loading && <p>Loading furniture…</p>}
        {error && <p className="form-error">{error}</p>}
        {!loading && !error && filtered.length === 0 && (
          <p>No items found. Try a different search or filter.</p>
        )}

        <div className="furniture-grid">
          {filtered.map((item) => (
            <div className="furniture-card" key={item.id}>
              <div
                className="furniture-card-image"
                style={{ backgroundImage: `url(${item.imageUrl})` }}
              />
              <div className="furniture-card-body">
                <h3>{item.name}</h3>
                <p className="furniture-card-price">
                  STARTS AT ₱{Number(item.basePrice).toLocaleString()}
                </p>
                <Link
                  to={`/showroom/${categoryId}/${item.id}/customize`}
                  className="btn btn-primary furniture-card-btn"
                >
                  View &amp; Customize
                </Link>
              </div>
            </div>
          ))}
        </div>

        <Link to="/showroom" className="back-to-browse">
          ← Back to Browse Type
        </Link>
      </div>

      <Footer />
    </div>
  );
}