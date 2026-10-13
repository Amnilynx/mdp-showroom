import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import AdminLayout from "../../components/AdminLayout";
import {
  getCategoryById,
  createCategory,
  updateCategory,
} from "../../lib/categories";

const TAG_CHOICES = ["Residential", "Commercial"];

function slugify(text) {
  return text
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-");
}

export default function AdminCategoryForm() {
  const { categoryId } = useParams();
  const isEdit = Boolean(categoryId);
  const navigate = useNavigate();

  const [loading, setLoading] = useState(isEdit);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const [name, setName] = useState("");
  const [slug, setSlug] = useState(""); // only used/shown on create
  const [tag, setTag] = useState(TAG_CHOICES[0]);
  const [imageUrl, setImageUrl] = useState("");
  const [description, setDescription] = useState("");

  useEffect(() => {
    if (!isEdit) return;
    let cancelled = false;
    async function loadCategory() {
      try {
        const cat = await getCategoryById(categoryId);
        if (!cat || cancelled) return;
        setName(cat.name || "");
        setTag(cat.tag || TAG_CHOICES[0]);
        setImageUrl(cat.imageUrl || "");
        setDescription(cat.description || "");
      } catch (err) {
        setError("Couldn't load this category.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    loadCategory();
    return () => {
      cancelled = true;
    };
  }, [isEdit, categoryId]);

  function handleNameChange(value) {
    setName(value);
    if (!isEdit) setSlug(slugify(value));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");

    if (!name.trim()) {
      setError("Name is required.");
      return;
    }
    if (!isEdit && !slug) {
      setError("Couldn't generate an ID from that name — try adding a letter or number.");
      return;
    }

    setSaving(true);
    try {
      const payload = {
        name: name.trim(),
        tag,
        imageUrl: imageUrl.trim(),
        description: description.trim(),
      };

      if (isEdit) {
        await updateCategory(categoryId, payload);
      } else {
        await createCategory(slug, payload);
      }
      navigate("/admin/categories");
    } catch (err) {
      setError(err.message || "Failed to save. Please try again.");
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <AdminLayout title={isEdit ? "Edit Category" : "Add Category"}>
        <p>Loading…</p>
      </AdminLayout>
    );
  }

  return (
    <AdminLayout title={isEdit ? "Edit Category" : "Add Category"}>
      <form className="admin-form" onSubmit={handleSubmit}>
        {error && <p className="form-error">{error}</p>}

        <div className="admin-form-grid">
          <label>
            Name
            <input
              value={name}
              onChange={(e) => handleNameChange(e.target.value)}
              placeholder="e.g. Modular Kitchens"
              required
            />
          </label>
          <label>
            Tag
            <select value={tag} onChange={(e) => setTag(e.target.value)}>
              {TAG_CHOICES.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </label>
        </div>

        {!isEdit && (
          <p className="price-review-note">
            Category ID: <code>{slug || "—"}</code> (auto-generated from the
            name, used internally — can't be changed after creating)
          </p>
        )}

        <label>
          Image URL
          <input
            value={imageUrl}
            onChange={(e) => setImageUrl(e.target.value)}
            placeholder="https://…"
          />
        </label>

        <label>
          Description
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={3}
          />
        </label>

        <div className="admin-form-actions">
          <button type="submit" className="btn btn-primary" disabled={saving}>
            {saving ? "Saving…" : "Save category ✓"}
          </button>
          <button
            type="button"
            className="btn btn-secondary"
            onClick={() => navigate("/admin/categories")}
          >
            Cancel
          </button>
        </div>
      </form>
    </AdminLayout>
  );
}