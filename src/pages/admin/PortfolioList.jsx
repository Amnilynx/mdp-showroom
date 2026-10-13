import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import AdminLayout from "../../components/AdminLayout";
import { getPortfolioItems, deletePortfolioItem } from "../../lib/portfolio";

export default function AdminPortfolioList() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const navigate = useNavigate();

  async function load() {
    setLoading(true);
    setError("");
    try {
      const data = await getPortfolioItems();
      setItems(data);
    } catch (err) {
      setError("Couldn't load portfolio items.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function handleDelete(id, title) {
    if (!window.confirm(`Delete "${title}"? This can't be undone.`)) return;
    try {
      await deletePortfolioItem(id);
      setItems((prev) => prev.filter((i) => i.id !== id));
    } catch (err) {
      alert("Failed to delete. Please try again.");
    }
  }

  return (
    <AdminLayout>
      <div className="admin-header-row">
        <h1>
          Our Work
          <br />
          gallery
        </h1>
        <Link to="/admin/portfolio/add" className="btn btn-primary">
          + Add Project
        </Link>
      </div>

      {loading && <p>Loading…</p>}
      {error && <p className="form-error">{error}</p>}

      <div className="admin-list">
        {items.map((item) => (
          <div className="admin-list-row" key={item.id}>
            <div
              className="admin-list-thumb"
              style={{ backgroundImage: `url(${item.imageUrls?.[0]})` }}
            />
            <div className="admin-list-info">
              <strong>{item.title}</strong>
              <span>
                {(item.imageUrls || []).length} photo
                {(item.imageUrls || []).length === 1 ? "" : "s"}
              </span>
            </div>
            <div className="admin-list-actions">
              <button
                className="icon-btn"
                onClick={() => navigate(`/admin/portfolio/${item.id}/edit`)}
                aria-label="Edit"
              >
                ✏️
              </button>
              <button
                className="icon-btn icon-btn-danger"
                onClick={() => handleDelete(item.id, item.title)}
                aria-label="Delete"
              >
                🗑️
              </button>
            </div>
          </div>
        ))}
        {!loading && items.length === 0 && (
          <p>No portfolio items yet. Click "Add Project" to create one.</p>
        )}
      </div>
    </AdminLayout>
  );
}