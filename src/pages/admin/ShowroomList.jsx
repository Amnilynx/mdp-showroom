import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import AdminLayout from "../../components/AdminLayout";
import { getAllFurniture, deleteFurniture } from "../../lib/furniture";
import { getCategories } from "../../lib/categories";

export default function AdminShowroomList() {
  const [furniture, setFurniture] = useState([]);
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const navigate = useNavigate();

  async function load() {
    setLoading(true);
    setError("");
    try {
      const [items, cats] = await Promise.all([
        getAllFurniture(),
        getCategories(),
      ]);
      setFurniture(items);
      setCategories(cats);
    } catch (err) {
      setError("Couldn't load furniture list.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  function categoryName(categoryId) {
    return categories.find((c) => c.id === categoryId)?.name || categoryId;
  }

  async function handleDelete(id, name) {
    if (!window.confirm(`Delete "${name}"? This can't be undone.`)) return;
    try {
      await deleteFurniture(id);
      setFurniture((prev) => prev.filter((f) => f.id !== id));
    } catch (err) {
      alert("Failed to delete. Please try again.");
    }
  }

  return (
    <AdminLayout>
      <div className="admin-header-row">
        <h1>
          The pieces
          <br />
          on the floor
        </h1>
        <Link to="/admin/showroom/add" className="btn btn-primary">
          + Add Furniture
        </Link>
      </div>

      {loading && <p>Loading…</p>}
      {error && <p className="form-error">{error}</p>}

      <div className="admin-list">
        {furniture.map((item) => (
          <div className="admin-list-row" key={item.id}>
            <div
              className="admin-list-thumb"
              style={{ backgroundImage: `url(${item.imageUrl})` }}
            />
            <div className="admin-list-info">
              <strong>{item.name}</strong>
              <span>
                {categoryName(item.categoryId)} · ₱
                {Number(item.basePrice).toLocaleString()}
              </span>
            </div>
            <div className="admin-list-actions">
              <button
                className="icon-btn"
                onClick={() => navigate(`/admin/showroom/${item.id}/edit`)}
                aria-label="Edit"
              >
                ✏️
              </button>
              <button
                className="icon-btn icon-btn-danger"
                onClick={() => handleDelete(item.id, item.name)}
                aria-label="Delete"
              >
                🗑️
              </button>
            </div>
          </div>
        ))}
        {!loading && furniture.length === 0 && (
          <p>No furniture yet. Click "Add Furniture" to create one.</p>
        )}
      </div>
    </AdminLayout>
  );
}