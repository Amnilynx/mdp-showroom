import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import AdminLayout from "../../components/AdminLayout";
import {
  getPortfolioItemById,
  createPortfolioItem,
  updatePortfolioItem,
} from "../../lib/portfolio";

export default function AdminPortfolioForm() {
  const { itemId } = useParams();
  const isEdit = Boolean(itemId);
  const navigate = useNavigate();

  const [loading, setLoading] = useState(isEdit);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  // Kept as a list of draft strings (one input per URL) rather than one
  // big textarea split on newlines — easier to add/remove a single photo
  // without fat-fingering the others, and avoids silently losing a URL to
  // a stray blank line.
  const [imageUrls, setImageUrls] = useState([""]);

  useEffect(() => {
    if (!isEdit) return;
    let cancelled = false;
    async function loadItem() {
      try {
        const item = await getPortfolioItemById(itemId);
        if (!item || cancelled) return;
        setTitle(item.title || "");
        setDescription(item.description || "");
        setImageUrls(item.imageUrls?.length ? item.imageUrls : [""]);
      } catch (err) {
        setError("Couldn't load this project.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    loadItem();
    return () => {
      cancelled = true;
    };
  }, [isEdit, itemId]);

  function setImageUrlAt(index, value) {
    setImageUrls((prev) => prev.map((u, i) => (i === index ? value : u)));
  }

  function addImageUrlField() {
    setImageUrls((prev) => [...prev, ""]);
  }

  function removeImageUrlField(index) {
    setImageUrls((prev) => prev.filter((_, i) => i !== index));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");

    const cleanedUrls = imageUrls.map((u) => u.trim()).filter(Boolean);

    if (!title.trim()) {
      setError("Title is required.");
      return;
    }
    if (cleanedUrls.length === 0) {
      setError("Add at least one photo URL.");
      return;
    }

    setSaving(true);
    try {
      const payload = {
        title: title.trim(),
        description: description.trim(),
        imageUrls: cleanedUrls,
      };

      if (isEdit) {
        await updatePortfolioItem(itemId, payload);
      } else {
        await createPortfolioItem(payload);
      }
      navigate("/admin/portfolio");
    } catch (err) {
      setError(err.message || "Failed to save. Please try again.");
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <AdminLayout title={isEdit ? "Edit Project" : "Add Project"}>
        <p>Loading…</p>
      </AdminLayout>
    );
  }

  return (
    <AdminLayout title={isEdit ? "Edit Project" : "Add Project"}>
      <form className="admin-form" onSubmit={handleSubmit}>
        {error && <p className="form-error">{error}</p>}

        <label>
          Title
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="e.g. Modular L-Shape Kitchen — Quezon City"
            required
          />
        </label>

        <label>
          Description
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={3}
            placeholder="A short write-up about this project…"
          />
        </label>

        <div className="portfolio-image-fields">
          <p className="price-review-note" style={{ marginBottom: 8 }}>
            Photo URLs — paste links from an image host (Imgur, Google
            Photos, etc.). The first one is used as the gallery thumbnail.
          </p>
          {imageUrls.map((url, i) => (
            <div className="inline-form-row" key={i}>
              <input
                value={url}
                onChange={(e) => setImageUrlAt(i, e.target.value)}
                placeholder="https://…"
              />
              {imageUrls.length > 1 && (
                <button
                  type="button"
                  className="icon-btn icon-btn-danger"
                  onClick={() => removeImageUrlField(i)}
                  aria-label="Remove photo"
                >
                  🗑️
                </button>
              )}
            </div>
          ))}
          <button
            type="button"
            className="btn btn-secondary btn-small"
            onClick={addImageUrlField}
          >
            + Add another photo
          </button>
        </div>

        {imageUrls[0]?.trim() && (
          <div className="portfolio-form-preview">
            <p className="price-review-note">Thumbnail preview:</p>
            <img src={imageUrls[0].trim()} alt="Preview" />
          </div>
        )}

        <div className="admin-form-actions">
          <button type="submit" className="btn btn-primary" disabled={saving}>
            {saving ? "Saving…" : "Save project ✓"}
          </button>
          <button
            type="button"
            className="btn btn-secondary"
            onClick={() => navigate("/admin/portfolio")}
          >
            Cancel
          </button>
        </div>
      </form>
    </AdminLayout>
  );
}