import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import Navbar from "../../components/Navbar";
import Footer from "../../components/Footer";
import Breadcrumb from "../../components/Breadcrumb";
import StepProgress from "../../components/StepProgress";
import { getCategories } from "../../lib/categories";

export default function ShowroomChooseType() {
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(true);
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
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="showroom-page">
      <Navbar />

      <div className="showroom-inner">
        <Breadcrumb
          crumbs={[
            { label: "Home", to: "/" },
            { label: "Showroom", to: "/showroom" },
            { label: "Process" },
          ]}
        />
        <StepProgress currentStep={1} />

        <h1>Select Furniture Category</h1>
        <p className="showroom-subtitle">
          Begin your showroom journey by choosing the type of furniture you
          wish to explore. Each selection acts as a tailored product inquiry
          to curate your perfect space.
        </p>

        {loading && <p>Loading categories…</p>}
        {error && <p className="form-error">{error}</p>}

        <div className="type-grid">
          {categories.map((cat) => (
            <Link to={`/showroom/${cat.id}`} key={cat.id} className="type-card">
              <div
                className="type-card-image"
                style={{ backgroundImage: `url(${cat.imageUrl})` }}
              />
              <div className="type-card-body">
                <div className="type-card-heading">
                  <h3>{cat.name}</h3>
                  <span
                    className={
                      "type-tag" +
                      (cat.tag === "Commercial" ? " type-tag-commercial" : "")
                    }
                  >
                    {cat.tag}
                  </span>
                </div>
                <p>{cat.description}</p>
              </div>
            </Link>
          ))}
        </div>
      </div>

      <Footer />
    </div>
  );
}