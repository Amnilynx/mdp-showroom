import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import AdminLayout from "../../components/AdminLayout";
import { getCategories } from "../../lib/categories";
import {
  getFurnitureById,
  createFurniture,
  updateFurniture,
} from "../../lib/furniture";

const SHAPE_CHOICES = ["Straight", "L-Shape", "U-Shape", "Island"];

const emptyOption = () => ({ name: "", price: "", imageUrl: "" });
const emptyFinishOption = () => ({ name: "", price: "", colorHex: "#d8d2c4" });

export default function AdminShowroomForm() {
  const { furnitureId } = useParams();
  const isEdit = Boolean(furnitureId);
  const navigate = useNavigate();

  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(isEdit);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const [name, setName] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [imageUrl, setImageUrl] = useState("");
  const [description, setDescription] = useState("");
  const [materials, setMaterials] = useState(""); // comma-separated in the UI
  const [colors, setColors] = useState("");
  const [active, setActive] = useState(true);

  // sizeOptions: [{ type: "Straight", price }]
  const [sizeOptions, setSizeOptions] = useState([{ type: "Straight", price: "" }]);
  // finishOptions: [{ name, price, colorHex }] — colorHex drives the small
  // swatch shown in the showroom's finish picker. We don't have real
  // photos of the same physical piece in multiple finishes, so finish
  // selection intentionally does NOT change the product photo — see
  // ShowroomCustomize.jsx for why.
  // hardwareOptions: [{ name, price }] — hardware doesn't change the photo.
  const [finishOptions, setFinishOptions] = useState([emptyFinishOption()]);
  const [hardwareOptions, setHardwareOptions] = useState([emptyOption()]);
  const [defaultW, setDefaultW] = useState("");
  const [defaultD, setDefaultD] = useState("");
  const [defaultH, setDefaultH] = useState("");

  useEffect(() => {
    async function loadCategories() {
      const cats = await getCategories();
      setCategories(cats);
      if (!isEdit && cats.length > 0) setCategoryId(cats[0].id);
    }
    loadCategories();
  }, [isEdit]);

  useEffect(() => {
    if (!isEdit) return;
    let cancelled = false;
    async function loadFurniture() {
      try {
        const item = await getFurnitureById(furnitureId);
        if (!item || cancelled) return;
        setName(item.name || "");
        setCategoryId(item.categoryId || "");
        setImageUrl(item.imageUrl || "");
        setDescription(item.description || "");
        setMaterials((item.materials || []).join(", "));
        setColors((item.colors || []).join(", "));
        setActive(item.active ?? true);
        setSizeOptions(
          item.sizeOptions?.length
            ? item.sizeOptions.map((s) => ({ type: s.type, price: s.price }))
            : [{ type: "Straight", price: "" }]
        );
        setFinishOptions(
          item.finishOptions?.length
            ? item.finishOptions.map((f) => ({
                name: f.name,
                price: f.priceAddOn,
                colorHex: f.colorHex || "#d8d2c4",
              }))
            : [emptyFinishOption()]
        );
        setHardwareOptions(
          item.hardwareOptions?.length
            ? item.hardwareOptions.map((h) => ({
                name: h.name,
                price: h.priceAddOn,
              }))
            : [emptyOption()]
        );
        setDefaultW(item.defaultDimensions?.w ?? "");
        setDefaultD(item.defaultDimensions?.d ?? "");
        setDefaultH(item.defaultDimensions?.h ?? "");
      } catch (err) {
        setError("Couldn't load this furniture item.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    loadFurniture();
    return () => {
      cancelled = true;
    };
  }, [isEdit, furnitureId]);

  function updateListItem(list, setList, index, field, value) {
    const next = [...list];
    next[index] = { ...next[index], [field]: value };
    setList(next);
  }

  function removeListItem(list, setList, index) {
    setList(list.filter((_, i) => i !== index));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");

    if (!name.trim() || !categoryId) {
      setError("Name and category are required.");
      return;
    }

    setSaving(true);
    try {
      const payload = {
        name: name.trim(),
        categoryId,
        basePrice: Number(sizeOptions[0]?.price) || 0, // lowest/first size as the "starts at" price
        imageUrl: imageUrl.trim(),
        description: description.trim(),
        materials: materials
          .split(",")
          .map((m) => m.trim())
          .filter(Boolean),
        colors: colors
          .split(",")
          .map((c) => c.trim())
          .filter(Boolean),
        active,
        sizeOptions: sizeOptions
          .filter((s) => s.type)
          .map((s) => ({ type: s.type, price: Number(s.price) || 0 })),
        finishOptions: finishOptions
          .filter((f) => f.name)
          .map((f) => ({
            name: f.name,
            priceAddOn: Number(f.price) || 0,
            colorHex: f.colorHex || "#d8d2c4",
          })),
        hardwareOptions: hardwareOptions
          .filter((h) => h.name)
          .map((h) => ({ name: h.name, priceAddOn: Number(h.price) || 0 })),
        defaultDimensions: {
          w: Number(defaultW) || 0,
          d: Number(defaultD) || 0,
          h: Number(defaultH) || 0,
        },
      };

      if (isEdit) {
        await updateFurniture(furnitureId, payload);
      } else {
        await createFurniture(payload);
      }
      navigate("/admin/showroom");
    } catch (err) {
      setError("Failed to save. Please try again.");
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <AdminLayout title={isEdit ? "Edit Furniture" : "Add Furniture"}>
        <p>Loading…</p>
      </AdminLayout>
    );
  }

  return (
    <AdminLayout title={isEdit ? "Edit Furniture" : "Add Furniture"}>
      <form className="admin-form" onSubmit={handleSubmit}>
        {error && <p className="form-error">{error}</p>}

        <div className="admin-form-grid">
          <label>
            Name
            <input value={name} onChange={(e) => setName(e.target.value)} required />
          </label>
          <label>
            Category
            <select value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </label>
        </div>

        <label>
          Image URL (default photo)
          <input
            value={imageUrl}
            onChange={(e) => setImageUrl(e.target.value)}
            placeholder="https://…"
          />
          <span className="field-hint">
            This is the photo shown for this piece — it stays the same no
            matter which finish a customer picks below.
          </span>
        </label>

        <label>
          Description
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={3}
          />
        </label>

        <div className="admin-form-grid">
          <label>
            Materials (comma-separated)
            <input
              value={materials}
              onChange={(e) => setMaterials(e.target.value)}
              placeholder="Plywood, HPL Doors"
            />
          </label>
          <label>
            Colors (comma-separated)
            <input
              value={colors}
              onChange={(e) => setColors(e.target.value)}
              placeholder="White, Dark Walnut"
            />
          </label>
        </div>

        {/* Size / shape options with pricing */}
        <fieldset className="admin-fieldset">
          <legend>Size / Shape options &amp; price</legend>
          {sizeOptions.map((opt, i) => (
            <div className="option-row" key={i}>
              <select
                value={opt.type}
                onChange={(e) =>
                  updateListItem(sizeOptions, setSizeOptions, i, "type", e.target.value)
                }
              >
                {SHAPE_CHOICES.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
              <input
                type="number"
                placeholder="Price (₱)"
                value={opt.price}
                onChange={(e) =>
                  updateListItem(sizeOptions, setSizeOptions, i, "price", e.target.value)
                }
              />
              {sizeOptions.length > 1 && (
                <button
                  type="button"
                  className="icon-btn icon-btn-danger"
                  onClick={() => removeListItem(sizeOptions, setSizeOptions, i)}
                >
                  ✕
                </button>
              )}
            </div>
          ))}
          <button
            type="button"
            className="add-option-btn"
            onClick={() => setSizeOptions([...sizeOptions, { type: "Straight", price: "" }])}
          >
            + Add size option
          </button>
        </fieldset>

        {/* Finish options — each gets a color swatch (not a photo). We
            don't have real photos of the same physical piece in multiple
            finishes, so the showroom shows finish as a labeled swatch
            rather than swapping the product photo. See
            ShowroomCustomize.jsx for the customer-facing picker. */}
        <fieldset className="admin-fieldset">
          <legend>Finish / Material options &amp; add-on price</legend>
          {finishOptions.map((opt, i) => (
            <div className="option-row option-row-with-image" key={i}>
              <div className="option-row-fields">
                <input
                  placeholder="Finish name (e.g. Dark Walnut)"
                  value={opt.name}
                  onChange={(e) =>
                    updateListItem(finishOptions, setFinishOptions, i, "name", e.target.value)
                  }
                />
                <input
                  type="number"
                  placeholder="Add-on ₱ (0 if none)"
                  value={opt.price}
                  onChange={(e) =>
                    updateListItem(finishOptions, setFinishOptions, i, "price", e.target.value)
                  }
                />
                <input
                  type="color"
                  value={opt.colorHex || "#d8d2c4"}
                  onChange={(e) =>
                    updateListItem(finishOptions, setFinishOptions, i, "colorHex", e.target.value)
                  }
                  title="Swatch color shown to customers"
                  className="swatch-color-input"
                />
                {finishOptions.length > 1 && (
                  <button
                    type="button"
                    className="icon-btn icon-btn-danger"
                    onClick={() => removeListItem(finishOptions, setFinishOptions, i)}
                  >
                    ✕
                  </button>
                )}
              </div>
            </div>
          ))}
          <button
            type="button"
            className="add-option-btn"
            onClick={() => setFinishOptions([...finishOptions, emptyFinishOption()])}
          >
            + Add finish option
          </button>
        </fieldset>

        {/* Hardware options */}
        <fieldset className="admin-fieldset">
          <legend>Hardware / Edges options &amp; add-on price</legend>
          {hardwareOptions.map((opt, i) => (
            <div className="option-row" key={i}>
              <input
                placeholder="Hardware name (e.g. Push-open)"
                value={opt.name}
                onChange={(e) =>
                  updateListItem(hardwareOptions, setHardwareOptions, i, "name", e.target.value)
                }
              />
              <input
                type="number"
                placeholder="Add-on ₱ (0 if none)"
                value={opt.price}
                onChange={(e) =>
                  updateListItem(hardwareOptions, setHardwareOptions, i, "price", e.target.value)
                }
              />
              {hardwareOptions.length > 1 && (
                <button
                  type="button"
                  className="icon-btn icon-btn-danger"
                  onClick={() => removeListItem(hardwareOptions, setHardwareOptions, i)}
                >
                  ✕
                </button>
              )}
            </div>
          ))}
          <button
            type="button"
            className="add-option-btn"
            onClick={() => setHardwareOptions([...hardwareOptions, emptyOption()])}
          >
            + Add hardware option
          </button>
        </fieldset>

        <fieldset className="admin-fieldset">
          <legend>Default dimensions (cm)</legend>
          <div className="admin-form-grid admin-form-grid-3">
            <label>
              Width
              <input type="number" value={defaultW} onChange={(e) => setDefaultW(e.target.value)} />
            </label>
            <label>
              Depth
              <input type="number" value={defaultD} onChange={(e) => setDefaultD(e.target.value)} />
            </label>
            <label>
              Height
              <input type="number" value={defaultH} onChange={(e) => setDefaultH(e.target.value)} />
            </label>
          </div>
        </fieldset>

        <label className="checkbox-label">
          <input
            type="checkbox"
            checked={active}
            onChange={(e) => setActive(e.target.checked)}
          />
          Active (visible in showroom)
        </label>

        <div className="admin-form-actions">
          <button type="submit" className="btn btn-primary" disabled={saving}>
            {saving ? "Saving…" : "Save piece ✓"}
          </button>
          <button
            type="button"
            className="btn btn-secondary"
            onClick={() => navigate("/admin/showroom")}
          >
            Cancel
          </button>
        </div>
      </form>
    </AdminLayout>
  );
}