import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import Navbar from "../../components/Navbar";
import Footer from "../../components/Footer";
import Breadcrumb from "../../components/Breadcrumb";
import StepProgress from "../../components/StepProgress";
import { getFurnitureById } from "../../lib/furniture";
import { getCategoryById } from "../../lib/categories";
import { useCart } from "../../context/CartContext";

const CUSTOM_REQUEST_PARTS = [
  "Base cabinets",
  "Whole kitchen",
  "Upper cabinets",
  "Countertop",
  "Island",
  "Hardware",
];

export default function ShowroomCustomize() {
  const { categoryId, furnitureId } = useParams();
  const navigate = useNavigate();
  const { addItem } = useCart();

  const [furniture, setFurniture] = useState(null);
  const [category, setCategory] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [selectedSize, setSelectedSize] = useState(null);
  const [selectedFinish, setSelectedFinish] = useState(null);
  const [selectedHardware, setSelectedHardware] = useState(null);
  const [useStandardDims, setUseStandardDims] = useState(true);
  const [dimW, setDimW] = useState("");
  const [dimD, setDimD] = useState("");
  const [dimH, setDimH] = useState("");
  const [customPart, setCustomPart] = useState("");
  const [customNote, setCustomNote] = useState("");
  const [added, setAdded] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      setError("");
      try {
        const [item, cat] = await Promise.all([
          getFurnitureById(furnitureId),
          getCategoryById(categoryId),
        ]);
        if (cancelled) return;
        if (!item) {
          setError("This item couldn't be found.");
          return;
        }
        setFurniture(item);
        setCategory(cat);
        setSelectedSize(item.sizeOptions?.[0] || null);
        setSelectedFinish(item.finishOptions?.[0] || null);
        setSelectedHardware(item.hardwareOptions?.[0] || null);
        setDimW(item.defaultDimensions?.w ?? "");
        setDimD(item.defaultDimensions?.d ?? "");
        setDimH(item.defaultDimensions?.h ?? "");
      } catch (err) {
        if (!cancelled) setError("Couldn't load this item right now.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [furnitureId, categoryId]);

  const basePrice = selectedSize?.price || 0;
  const finishAddOn = selectedFinish?.priceAddOn || 0;
  const hardwareAddOn = selectedHardware?.priceAddOn || 0;
  const subtotal = basePrice + finishAddOn + hardwareAddOn;
  const deposit = Math.round(subtotal * 0.5);

  // The hero photo always shows the piece as actually photographed. We
  // don't have real per-finish photos of the same physical piece, and
  // faking a photo swap (or CSS-tinting the one real photo) would show
  // the customer something that isn't accurate to what they'd receive.
  // Finish selection is still fully functional for pricing and order
  // notes — it's shown as a labeled color swatch (see .finish-swatch
  // below) rather than pretending to change the product photo.
  const displayImageUrl = furniture?.imageUrl;

  function handleUseStandardToggle(checked) {
    setUseStandardDims(checked);
    if (checked && furniture?.defaultDimensions) {
      setDimW(furniture.defaultDimensions.w ?? "");
      setDimD(furniture.defaultDimensions.d ?? "");
      setDimH(furniture.defaultDimensions.h ?? "");
    }
  }

  function handleAddToQuote() {
    addItem({
      furnitureId: furniture.id,
      furnitureName: furniture.name,
      shapeType: selectedSize?.type,
      finish: selectedFinish?.name,
      hardware: selectedHardware?.name,
      dimensions: { w: Number(dimW), d: Number(dimD), h: Number(dimH) },
      customRequest: customPart
        ? { part: customPart, note: customNote }
        : null,
      basePrice,
      addOnsTotal: finishAddOn + hardwareAddOn,
      subtotal,
    });
    setAdded(true);
  }

  if (loading) {
    return (
      <div className="showroom-page">
        <Navbar />
        <div className="showroom-inner">
          <p>Loading…</p>
        </div>
        <Footer />
      </div>
    );
  }

  if (error || !furniture) {
    return (
      <div className="showroom-page">
        <Navbar />
        <div className="showroom-inner">
          <p className="form-error">{error || "Item not found."}</p>
          <Link to={`/showroom/${categoryId}`} className="back-to-browse">
            ← Back to Browse List
          </Link>
        </div>
        <Footer />
      </div>
    );
  }

  return (
    <div className="showroom-page">
      <Navbar />

      <div className="showroom-inner">
        <Breadcrumb
          crumbs={[
            { label: "Home", to: "/" },
            { label: "Showroom", to: "/showroom" },
            { label: category?.name || "…", to: `/showroom/${categoryId}` },
            { label: furniture.name },
          ]}
        />
        <StepProgress currentStep={3} />

        <div className="customize-layout">
          {/* Left: image + gallery */}
          <div className="customize-media">
            <div
              className="customize-hero-image"
              style={{ backgroundImage: `url(${displayImageUrl})` }}
            />
          </div>

          {/* Right: options + price */}
          <div className="customize-panel">
            <h1>{furniture.name}</h1>
            <p className="customize-subtitle">
              {category?.name} System / {category?.tag}
            </p>

            {/* Size / Type */}
            <div className="customize-section">
              <h4>Size / Type</h4>
              <div className="size-options">
                {(furniture.sizeOptions || []).map((size) => (
                  <button
                    key={size.type}
                    className={
                      "size-option" +
                      (selectedSize?.type === size.type ? " size-option-active" : "")
                    }
                    onClick={() => setSelectedSize(size)}
                  >
                    <strong>{size.type}</strong>
                    <span>₱{Number(size.price).toLocaleString()}</span>
                  </button>
                ))}
                {(!furniture.sizeOptions || furniture.sizeOptions.length === 0) && (
                  <p className="option-empty-note">
                    No size options configured for this item yet.
                  </p>
                )}
              </div>
            </div>

            {/* Hardware */}
            <div className="customize-section">
              <h4>Hardware / Edges</h4>
              <div className="pill-options">
                {(furniture.hardwareOptions || []).map((hw) => (
                  <button
                    key={hw.name}
                    className={
                      "pill-option" +
                      (selectedHardware?.name === hw.name ? " pill-option-active" : "")
                    }
                    onClick={() => setSelectedHardware(hw)}
                  >
                    {hw.name}
                    {hw.priceAddOn > 0 && ` +₱${hw.priceAddOn.toLocaleString()}`}
                  </button>
                ))}
              </div>
            </div>

            {/* Finish — shown as a color swatch rather than a photo swap.
                We don't have real photos of the same physical piece in
                multiple finishes, so swatches represent the finish
                honestly without implying the hero photo will change. */}
            <div className="customize-section">
              <h4>Choose a finish</h4>
              <div className="finish-swatch-row">
                {(furniture.finishOptions || []).map((finish) => (
                  <button
                    key={finish.name}
                    type="button"
                    className={
                      "finish-swatch" +
                      (selectedFinish?.name === finish.name ? " finish-swatch-active" : "")
                    }
                    onClick={() => setSelectedFinish(finish)}
                    aria-pressed={selectedFinish?.name === finish.name}
                  >
                    <span
                      className="finish-swatch-color"
                      style={{ background: finish.colorHex || "#d8d2c4" }}
                    />
                    <span className="finish-swatch-label">
                      {finish.name}
                      {finish.priceAddOn > 0 && (
                        <> · +₱{finish.priceAddOn.toLocaleString()}</>
                      )}
                    </span>
                  </button>
                ))}
                {(!furniture.finishOptions || furniture.finishOptions.length === 0) && (
                  <p className="option-empty-note">
                    No finish options configured for this item yet.
                  </p>
                )}
              </div>
              {selectedFinish && (
                <p className="finish-selected-note">
                  Selected finish: {selectedFinish.name}
                </p>
              )}
            </div>

            {/* Dimensions */}
            <div className="customize-section">
              <div className="dims-header">
                <h4>Custom Dimensions (cm)</h4>
                <label className="checkbox-label small">
                  <input
                    type="checkbox"
                    checked={useStandardDims}
                    onChange={(e) => handleUseStandardToggle(e.target.checked)}
                  />
                  Use Standard?
                </label>
              </div>
              <div className="dims-row">
                <label>
                  W
                  <input
                    type="number"
                    value={dimW}
                    disabled={useStandardDims}
                    onChange={(e) => setDimW(e.target.value)}
                  />
                </label>
                <label>
                  D
                  <input
                    type="number"
                    value={dimD}
                    disabled={useStandardDims}
                    onChange={(e) => setDimD(e.target.value)}
                  />
                </label>
                <label>
                  H
                  <input
                    type="number"
                    value={dimH}
                    disabled={useStandardDims}
                    onChange={(e) => setDimH(e.target.value)}
                  />
                </label>
              </div>
            </div>

            {/* Custom request */}
            <div className="customize-section">
              <h4>Custom Options</h4>
              <div className="custom-request-row">
                <textarea
                  placeholder="e.g. Add a pull-out spice rack near the stove, and use soft-close on all drawers."
                  value={customNote}
                  onChange={(e) => setCustomNote(e.target.value)}
                  rows={4}
                />
                <select
                  value={customPart}
                  onChange={(e) => setCustomPart(e.target.value)}
                >
                  <option value="">Select part (optional)</option>
                  {CUSTOM_REQUEST_PARTS.map((part) => (
                    <option key={part} value={part}>
                      {part}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* Live price breakdown */}
            <div className="price-breakdown">
              <p className="price-breakdown-label">Live Price Breakdown</p>
              <div className="price-row">
                <span>Base layout</span>
                <span>₱{basePrice.toLocaleString()}</span>
              </div>
              {finishAddOn > 0 && (
                <div className="price-row">
                  <span>{selectedFinish?.name}</span>
                  <span>+₱{finishAddOn.toLocaleString()}</span>
                </div>
              )}
              {hardwareAddOn > 0 && (
                <div className="price-row">
                  <span>{selectedHardware?.name}</span>
                  <span>+₱{hardwareAddOn.toLocaleString()}</span>
                </div>
              )}
              <div className="price-row price-row-total">
                <span>Estimated</span>
                <span>₱{subtotal.toLocaleString()}</span>
              </div>
              <p className="price-deposit-note">
                50% deposit to start: ₱{deposit.toLocaleString()}
              </p>
            </div>

            <div className="customize-actions">
              <button
                className="btn btn-secondary"
                onClick={() => navigate(`/showroom/${categoryId}`)}
              >
                ← Back to List
              </button>
              <button
                className="btn btn-primary"
                onClick={handleAddToQuote}
                disabled={!selectedSize}
              >
                {added ? "Added ✓" : "→ Select & Request Quote"}
              </button>
            </div>

            {added && (
              <p className="added-confirmation">
                Added to your quote request.{" "}
                <Link to="/quote-request">View quote request →</Link>
              </p>
            )}
          </div>
        </div>
      </div>

      <Footer />
    </div>
  );
}