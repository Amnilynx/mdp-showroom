import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import AdminLayout from "../../components/AdminLayout";
import {
  getCategoryById,
  createCategory,
  updateCategory,
} from "../../lib/categories";
import { checkUrl, friendlyError } from "../../lib/validators";

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
  const [errors, setErrors] = useState({});

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

  const clearErr = (k) => setErrors((p) => (p[k] ? Object.fromEntries(Object.entries(p).filter(([x]) => x !== k)) : p));
  const Err = ({ k }) =>
    errors[k] ? (
      <span role="alert" data-field-error style={{ color: "#9b1c1c", fontSize: 12, display: "block", marginTop: 4 }}>
        {errors[k]}
      </span>
    ) : null;

  function handleNameChange(value) {
    setName(value);
    clearErr("name");
    if (!isEdit) setSlug(slugify(value));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");

    const errs = {};
    const n = name.trim().replace(/\s+/g, " ");
    if (n.length < 2 || n.length > 60) errs.name = "Enter a name between 2 and 60 characters.";
    else if (!/[A-Za-z0-9]/.test(n)) errs.name = "The name must contain letters or numbers.";
    else if (!isEdit && !slug) errs.name = "Couldn't make an ID from that name. Add a letter or number.";
    if (!imageUrl.trim()) errs.imageUrl = "Add the category photo link.";
    else if (checkUrl(imageUrl)) errs.imageUrl = checkUrl(imageUrl);
    const d = description.trim();
    if (d.length < 10) errs.description = "Write a short description (at least 10 characters).";
    else if (d.length > 400) errs.description = "Keep the description under 400 characters.";

    // A new category must not reuse an existing ID: saving would overwrite that category.
    if (!errs.name && !isEdit) {
      try {
        if (await getCategoryById(slug)) errs.name = `A category with this name already exists (ID "${slug}"). Edit it instead or use a different name.`;
      } catch (err) {
        setError("Couldn't check for duplicates. " + friendlyError(err));
        return;
      }
    }

    setErrors(errs);
    if (Object.keys(errs).length) {
      setError("Please fix the highlighted fields below.");
      setTimeout(() => document.querySelector("[data-field-error]")?.scrollIntoView({ behavior: "smooth", block: "center" }), 0);
      return;
    }

    setSaving(true);
    try {
      const payload = {
        name: n,
        tag,
        imageUrl: imageUrl.trim(),
        description: d,
      };

      if (isEdit) {
        await updateCategory(categoryId, payload);
      } else {
        await createCategory(slug, payload);
      }
      navigate("/admin/categories");
    } catch (err) {
      setError("Failed to save. " + friendlyError(err, "Please try again."));
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
      <form className="admin-form" onSubmit={handleSubmit} noValidate>
        {error && <p className="form-error" role="alert">{error}</p>}

        <div className="admin-form-grid">
          <label>
            Name
            <input
              value={name}
              onChange={(e) => handleNameChange(e.target.value)}
              placeholder="e.g. Modular Kitchens"
              maxLength={60}
              required
            />
            <Err k="name" />
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
            onChange={(e) => { setImageUrl(e.target.value); clearErr("imageUrl"); }}
            placeholder="https://…"
          />
          <Err k="imageUrl" />
        </label>

        <label>
          Description
          <textarea
            value={description}
            onChange={(e) => { setDescription(e.target.value); clearErr("description"); }}
            rows={3}
            maxLength={400}
          />
          <Err k="description" />
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