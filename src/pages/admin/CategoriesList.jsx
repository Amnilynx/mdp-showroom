import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import AdminLayout from "../../components/AdminLayout";
import { getCategories, deleteCategory } from "../../lib/categories";
import { getAllFurniture } from "../../lib/furniture";

export default function AdminCategoriesList() {
  const [categories, setCategories] = useState([]);
  const [furnitureCounts, setFurnitureCounts] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const navigate = useNavigate();

  async function load() {
    setLoading(true);
    setError("");
    try {
      const [cats, furniture] = await Promise.all([
        getCategories(),
        getAllFurniture(),
      ]);
      setCategories(cats);
      const counts = {};
      furniture.forEach((f) => {
        counts[f.categoryId] = (counts[f.categoryId] || 0) + 1;
      });
      setFurnitureCounts(counts);
    } catch (err) {
      setError("Couldn't load categories.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function handleDelete(id, name) {
    const count = furnitureCounts[id] || 0;
    const warning =
      count > 0
        ? `"${name}" still has ${count} furniture piece${count === 1 ? "" : "s"} linked to it. Deleting the category will make those pieces disappear from Browse List (they won't be deleted themselves). Delete anyway?`
        : `Delete "${name}"? This can't be undone.`;
    if (!window.confirm(warning)) return;
    try {
      await deleteCategory(id);
      setCategories((prev) => prev.filter((c) => c.id !== id));
    } catch (err) {
      alert("Failed to delete. Please try again.");
    }
  }

  return (
    <AdminLayout>
      <div className="admin-header-row">
        <h1>
          Showroom
          <br />
          categories
        </h1>
        <Link to="/admin/categories/add" className="btn btn-primary">
          + Add Category
        </Link>
      </div>

      {loading && <p>Loading…</p>}
      {error && <p className="form-error">{error}</p>}

      <div className="admin-list">
        {categories.map((cat) => (
          <div className="admin-list-row" key={cat.id}>
            <div
              className="admin-list-thumb"
              style={{ backgroundImage: `url(${cat.imageUrl})` }}
            />
            <div className="admin-list-info">
              <strong>{cat.name}</strong>
              <span>
                {cat.tag} · {furnitureCounts[cat.id] || 0} piece
                {(furnitureCounts[cat.id] || 0) === 1 ? "" : "s"}
              </span>
            </div>
            <div className="admin-list-actions">
              <button
                className="icon-btn"
                onClick={() => navigate(`/admin/categories/${cat.id}/edit`)}
                aria-label="Edit"
              >
                ✏️
              </button>
              <button
                className="icon-btn icon-btn-danger"
                onClick={() => handleDelete(cat.id, cat.name)}
                aria-label="Delete"
              >
                🗑️
              </button>
            </div>
          </div>
        ))}
        {!loading && categories.length === 0 && (
          <p>No categories yet. Click "Add Category" to create one.</p>
        )}
      </div>
    </AdminLayout>
  );
}