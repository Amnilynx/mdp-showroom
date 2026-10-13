import { useRef, useState } from "react";
import { getCategories, updateCategory } from "../../lib/categories";
import { getAllFurniture, createFurniture, updateFurniture } from "../../lib/furniture";

// Starting example — this is the real MDP catalog, pre-filled so the first
// use of this page doubles as the initial seed. Admin can clear it and
// paste/upload their own batch for any future bulk add.
const EXAMPLE_JSON = JSON.stringify(
  {
    categories: {
      "modular-kitchens": "https://images.pexels.com/photos/6782474/pexels-photo-6782474.jpeg",
      "walk-in-closets": "https://images.pexels.com/photos/39733041/pexels-photo-39733041.jpeg",
      "media-cabinets": "https://images.pexels.com/photos/6782368/pexels-photo-6782368.jpeg",
      "file-storage": "https://images.pexels.com/photos/3773984/pexels-photo-3773984.jpeg",
    },
    furniture: [
      {
        name: "Meridian Kitchen",
        categoryId: "modular-kitchens",
        imageUrl: "https://images.pexels.com/photos/6782474/pexels-photo-6782474.jpeg",
        description:
          "A clean-lined U-shape kitchen with soft-close cabinetry, waterfall-edge countertop option, and an integrated breakfast counter.",
        materials: ["Plywood carcass", "Laminate finish", "Quartz countertop"],
        colors: ["Matte White", "Dark Walnut", "Sage Green"],
        sizeOptions: [
          { type: "Straight", price: 95000 },
          { type: "L-Shape", price: 120000 },
          { type: "U-Shape", price: 180000 },
        ],
        finishOptions: [
          { name: "Matte Laminate", priceAddOn: 0, imageUrl: "" },
          { name: "Dark Walnut Veneer", priceAddOn: 15000, imageUrl: "" },
          { name: "Waterfall Edge Countertop", priceAddOn: 22000, imageUrl: "" },
        ],
        hardwareOptions: [
          { name: "J-Pull Handles", priceAddOn: 0 },
          { name: "Push-to-Open", priceAddOn: 5000 },
        ],
        defaultDimensions: { w: 300, d: 60, h: 85 },
      },
      {
        name: "Metro Mini",
        categoryId: "modular-kitchens",
        imageUrl: "https://images.pexels.com/photos/19846353/pexels-photo-19846353.jpeg",
        description: "A space-smart L-shape kitchen for condos and smaller homes, without compromising on finish quality.",
        materials: ["MDF carcass", "Laminate finish"],
        colors: ["Pastel Green", "Matte Black", "Cream White"],
        sizeOptions: [
          { type: "Straight", price: 95000 },
          { type: "L-Shape", price: 120000 },
        ],
        finishOptions: [
          { name: "Standard Laminate", priceAddOn: 0, imageUrl: "" },
          { name: "Textured Matte", priceAddOn: 9000, imageUrl: "" },
        ],
        hardwareOptions: [
          { name: "J-Pull Handles", priceAddOn: 0 },
          { name: "Push-to-Open", priceAddOn: 4000 },
        ],
        defaultDimensions: { w: 240, d: 60, h: 85 },
      },
      {
        name: "Matte Lux",
        categoryId: "modular-kitchens",
        imageUrl: "https://images.pexels.com/photos/19955716/pexels-photo-19955716.jpeg",
        description: "A sleek matte-black straight-run kitchen with a premium, minimalist finish.",
        materials: ["Plywood carcass", "Matte laminate", "Quartz countertop"],
        colors: ["Matte Black", "Graphite", "Charcoal"],
        sizeOptions: [{ type: "Straight", price: 85000 }],
        finishOptions: [
          { name: "Matte Black Laminate", priceAddOn: 0, imageUrl: "" },
          { name: "Charcoal Stone Top", priceAddOn: 18000, imageUrl: "" },
        ],
        hardwareOptions: [
          { name: "Recessed Pull", priceAddOn: 0 },
          { name: "Brass Bar Handle", priceAddOn: 8000 },
        ],
        defaultDimensions: { w: 280, d: 60, h: 85 },
      },
      {
        name: "Meridian Closet",
        categoryId: "walk-in-closets",
        imageUrl: "https://images.pexels.com/photos/6670657/pexels-photo-6670657.jpeg",
        description: "A full U-shape walk-in system with dedicated hanging, shelving, and drawer zones.",
        materials: ["Melamine board", "Soft-close drawer runners", "LED strip lighting"],
        colors: ["Natural Oak", "Soft White", "Graphite"],
        sizeOptions: [
          { type: "Straight", price: 85000 },
          { type: "L-Shape", price: 115000 },
          { type: "U-Shape", price: 150000 },
        ],
        finishOptions: [
          { name: "Natural Oak Veneer", priceAddOn: 0, imageUrl: "" },
          { name: "Graphite Matte", priceAddOn: 14000, imageUrl: "" },
        ],
        hardwareOptions: [
          { name: "Standard Rail", priceAddOn: 0 },
          { name: "Soft-Close Drawers", priceAddOn: 6000 },
        ],
        defaultDimensions: { w: 280, d: 60, h: 240 },
      },
      {
        name: "Metro Wardrobe",
        categoryId: "walk-in-closets",
        imageUrl: "https://images.pexels.com/photos/5705490/pexels-photo-5705490.jpeg",
        description: "A sliding-door wardrobe system with mirrored panels, built for bedrooms with limited floor space.",
        materials: ["Particle board", "Mirrored sliding panels"],
        colors: ["White Gloss", "Walnut", "Grey Oak"],
        sizeOptions: [
          { type: "Straight", price: 38000 },
          { type: "L-Shape", price: 58000 },
        ],
        finishOptions: [
          { name: "White Gloss", priceAddOn: 0, imageUrl: "" },
          { name: "Walnut Veneer", priceAddOn: 11000, imageUrl: "" },
        ],
        hardwareOptions: [
          { name: "Standard Sliding Track", priceAddOn: 0 },
          { name: "Soft-Close Sliding Track", priceAddOn: 7000 },
        ],
        defaultDimensions: { w: 200, d: 60, h: 240 },
      },
      {
        name: "Grandeur Dressing Room",
        categoryId: "walk-in-closets",
        imageUrl: "https://images.pexels.com/photos/20705886/pexels-photo-20705886.jpeg",
        description: "A full dressing-room build-out with an island dresser, vanity nook, and full-length mirror panel.",
        materials: ["Plywood carcass", "Quartz island top", "LED ambient lighting"],
        colors: ["Warm Oak", "Ivory", "Graphite"],
        sizeOptions: [{ type: "U-Shape", price: 220000 }],
        finishOptions: [
          { name: "Warm Oak Veneer", priceAddOn: 0, imageUrl: "" },
          { name: "Ivory Lacquer", priceAddOn: 20000, imageUrl: "" },
        ],
        hardwareOptions: [
          { name: "Recessed Pull", priceAddOn: 0 },
          { name: "Brass Handle", priceAddOn: 9000 },
        ],
        defaultDimensions: { w: 400, d: 80, h: 240 },
      },
      {
        name: "Lumen TV Console",
        categoryId: "media-cabinets",
        imageUrl: "https://images.pexels.com/photos/6527054/pexels-photo-6527054.jpeg",
        description: "A floating media console with cable management channels and soft-close storage.",
        materials: ["MDF carcass", "Laminate finish", "Tempered glass top"],
        colors: ["Matte Black", "Walnut", "White Oak"],
        sizeOptions: [{ type: "Straight", price: 42000 }],
        finishOptions: [
          { name: "Matte Laminate", priceAddOn: 0, imageUrl: "" },
          { name: "Walnut Veneer", priceAddOn: 8000, imageUrl: "" },
        ],
        hardwareOptions: [
          { name: "Standard Handle", priceAddOn: 0 },
          { name: "Push-to-Open", priceAddOn: 3500 },
        ],
        defaultDimensions: { w: 180, d: 40, h: 50 },
      },
      {
        name: "Haven Media Wall",
        categoryId: "media-cabinets",
        imageUrl: "https://images.pexels.com/photos/6489117/pexels-photo-6489117.jpeg",
        description: "A wall-to-wall media unit combining TV console, open shelving, and closed storage.",
        materials: ["Plywood carcass", "Laminate finish"],
        colors: ["Charcoal", "Natural Oak", "Cream"],
        sizeOptions: [
          { type: "Straight", price: 42000 },
          { type: "L-Shape", price: 68000 },
        ],
        finishOptions: [
          { name: "Charcoal Matte", priceAddOn: 0, imageUrl: "" },
          { name: "Natural Oak Veneer", priceAddOn: 9500, imageUrl: "" },
        ],
        hardwareOptions: [
          { name: "Recessed Pull", priceAddOn: 0 },
          { name: "Brass Handle", priceAddOn: 4500 },
        ],
        defaultDimensions: { w: 320, d: 40, h: 220 },
      },
      {
        name: "Archive 4-Drawer Cabinet",
        categoryId: "file-storage",
        imageUrl: "https://images.pexels.com/photos/1370294/pexels-photo-1370294.jpeg",
        description: "A lockable 4-drawer filing cabinet built for legal/A4 folders, finished to match office interiors.",
        materials: ["Powder-coated steel frame", "Laminate panel front"],
        colors: ["Office Grey", "Matte Black", "White"],
        sizeOptions: [{ type: "Straight", price: 28000 }],
        finishOptions: [
          { name: "Standard Laminate", priceAddOn: 0, imageUrl: "" },
          { name: "Matte Black Steel", priceAddOn: 5000, imageUrl: "" },
        ],
        hardwareOptions: [
          { name: "Standard Lock", priceAddOn: 0 },
          { name: "Central Locking Bar", priceAddOn: 3500 },
        ],
        defaultDimensions: { w: 46, d: 62, h: 132 },
      },
      {
        name: "Executive Storage Wall",
        categoryId: "file-storage",
        imageUrl: "https://images.pexels.com/photos/6333730/pexels-photo-6333730.jpeg",
        description: "A built-in storage wall combining filing drawers, closed cabinets, and open document shelving for executive offices.",
        materials: ["Plywood carcass", "Laminate finish", "Steel drawer runners"],
        colors: ["Walnut", "Charcoal Grey", "White"],
        sizeOptions: [
          { type: "Straight", price: 48000 },
          { type: "L-Shape", price: 75000 },
        ],
        finishOptions: [
          { name: "Walnut Veneer", priceAddOn: 0, imageUrl: "" },
          { name: "Charcoal Matte", priceAddOn: 10000, imageUrl: "" },
        ],
        hardwareOptions: [
          { name: "Standard Lock", priceAddOn: 0 },
          { name: "Soft-Close Drawers", priceAddOn: 6000 },
        ],
        defaultDimensions: { w: 320, d: 45, h: 220 },
      },
    ],
  },
  null,
  2
);

const REQUIRED_FURNITURE_FIELDS = ["name", "categoryId", "sizeOptions"];

// Copy-paste prompt for ChatGPT (or Claude, or any AI chat) — written so a
// non-technical person can fill in a few blanks and get back valid JSON for
// this page, without needing to understand the schema themselves.
const AI_PROMPT_TEMPLATE = `I'm adding new furniture pieces to my family's furniture website. I need you to output ONLY a JSON object (no explanation, no markdown code fences, just the raw JSON) in exactly this shape:

{
  "furniture": [
    {
      "name": "Product Name",
      "categoryId": "modular-kitchens",
      "imageUrl": "",
      "description": "A one or two sentence description of the piece.",
      "materials": ["Material 1", "Material 2"],
      "colors": ["Color 1", "Color 2"],
      "sizeOptions": [
        { "type": "Straight", "price": 50000 },
        { "type": "L-Shape", "price": 70000 }
      ],
      "finishOptions": [
        { "name": "Finish Name", "priceAddOn": 0, "imageUrl": "" },
        { "name": "Upgraded Finish Name", "priceAddOn": 10000, "imageUrl": "" }
      ],
      "hardwareOptions": [
        { "name": "Hardware Name", "priceAddOn": 0 },
        { "name": "Upgraded Hardware Name", "priceAddOn": 5000 }
      ],
      "defaultDimensions": { "w": 300, "d": 60, "h": 85 }
    }
  ]
}

Rules:
- "categoryId" must be exactly one of: modular-kitchens, walk-in-closets, media-cabinets, file-storage
- "sizeOptions" must have at least one entry, and "type" must be one of: Straight, L-Shape, U-Shape, Island
- All prices are in Philippine Pesos, as plain numbers (no currency symbol, no commas)
- Leave every "imageUrl" as an empty string "" — I'll add photos myself afterward
- If I only give you one piece, only include one object in the "furniture" array
- Output valid JSON only — nothing before or after it

Here's what I want to add:
[DESCRIBE YOUR FURNITURE PIECE(S) HERE — e.g. "A 2-door sliding wardrobe called 'Coastal Wardrobe', walk-in closets category, starts at ₱45,000 in Straight, ₱65,000 in L-Shape. Comes in White Oak or Grey finish, no price difference. Standard track or soft-close track (+₱6,000)."]`;

export default function ImportFurniture() {
  const [jsonText, setJsonText] = useState(EXAMPLE_JSON);
  const [parseError, setParseError] = useState("");
  const [preview, setPreview] = useState(null); // { categoryCount, furnitureCount, issues }
  const [showGuide, setShowGuide] = useState(false);
  const [promptCopied, setPromptCopied] = useState(false);
  const [log, setLog] = useState([]);
  const [running, setRunning] = useState(false);
  const [done, setDone] = useState(false);
  const fileInputRef = useRef(null);

  function appendLog(line) {
    setLog((prev) => [...prev, line]);
  }

  async function handleCopyPrompt() {
    try {
      await navigator.clipboard.writeText(AI_PROMPT_TEMPLATE);
      setPromptCopied(true);
      setTimeout(() => setPromptCopied(false), 2500);
    } catch (err) {
      // Clipboard API can fail (older browser, no permission) — the prompt
      // text is still visible below for manual copy, so this just stays quiet.
    }
  }

  function handleFileUpload(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      setJsonText(String(reader.result));
      setPreview(null);
      setParseError("");
      setDone(false);
    };
    reader.readAsText(file);
    e.target.value = ""; // allow re-uploading the same filename later
  }

  function parseAndValidate() {
    setParseError("");
    setPreview(null);
    let data;
    try {
      data = JSON.parse(jsonText);
    } catch (err) {
      setParseError(`Invalid JSON: ${err.message}`);
      return null;
    }

    const categories = data.categories || {};
    const furniture = Array.isArray(data.furniture) ? data.furniture : [];

    const issues = [];
    furniture.forEach((item, i) => {
      REQUIRED_FURNITURE_FIELDS.forEach((field) => {
        if (!item[field]) {
          issues.push(`Item ${i + 1} (${item.name || "unnamed"}) is missing "${field}".`);
        }
      });
    });

    if (Object.keys(categories).length === 0 && furniture.length === 0) {
      issues.push("No categories or furniture found — check your JSON has \"categories\" and/or \"furniture\" keys.");
    }

    const result = {
      categoryCount: Object.keys(categories).length,
      furnitureCount: furniture.length,
      issues,
      data,
    };
    setPreview(result);
    return result;
  }

  async function handleImport() {
    const result = preview || parseAndValidate();
    if (!result || result.issues.length > 0) return;

    setRunning(true);
    setDone(false);
    setLog([]);

    try {
      const { categories = {}, furniture = [] } = result.data;

      if (Object.keys(categories).length > 0) {
        appendLog("Loading existing categories…");
        const existingCategories = await getCategories();
        for (const [categoryId, imageUrl] of Object.entries(categories)) {
          const existing = existingCategories.find((c) => c.id === categoryId);
          if (!existing) {
            appendLog(`⚠ Category "${categoryId}" not found in Firestore — skipped (create it first via /admin/categories).`);
            continue;
          }
          await updateCategory(categoryId, { imageUrl });
          appendLog(`✓ Updated image for category: ${existing.name || categoryId}`);
        }
      }

      if (furniture.length > 0) {
        appendLog("Loading existing furniture…");
        const existingFurniture = await getAllFurniture();

        for (const item of furniture) {
          const basePrice = item.sizeOptions?.[0]?.price || 0;
          const payload = { ...item, basePrice };

          const match = existingFurniture.find(
            (f) => f.name.trim().toLowerCase() === item.name.trim().toLowerCase()
          );

          if (match) {
            await updateFurniture(match.id, payload);
            appendLog(`✓ Updated existing: ${item.name}`);
          } else {
            await createFurniture(payload);
            appendLog(`✓ Created new: ${item.name}`);
          }
        }
      }

      appendLog("Done. Check /admin/showroom and /admin/categories to confirm.");
      setDone(true);
    } catch (err) {
      appendLog(`✗ Error: ${err.message || "Something went wrong."}`);
    } finally {
      setRunning(false);
    }
  }

  return (
    <div className="ticket-card" style={{ maxWidth: 760 }}>
      <h4>Import Categories &amp; Furniture</h4>
      <p style={{ fontSize: 13, color: "var(--text-muted)", marginBottom: 16 }}>
        Paste or upload a JSON file with <code>"categories"</code> (an
        object of categoryId → image URL) and/or <code>"furniture"</code>{" "}
        (a list of pieces, same shape as the Add Furniture form). Furniture
        is matched by name — an existing piece with the same name is
        updated, anything new is created. Nothing is deleted.
      </p>

      <button
        type="button"
        className="btn btn-secondary"
        onClick={() => setShowGuide((v) => !v)}
        style={{ marginBottom: 16 }}
      >
        {showGuide ? "Hide guide ▲" : "Don't know JSON? Use AI to write it for you ▼"}
      </button>

      {showGuide && (
        <div className="import-guide-box">
          <h5>How to add new furniture without writing JSON yourself</h5>
          <ol className="import-guide-steps">
            <li>
              Open ChatGPT (or any AI chat) in another tab.
            </li>
            <li>
              Copy the prompt below and paste it in. At the bottom, replace
              the bracketed line with a plain description of the furniture
              piece(s) you want to add — sizes, prices, colors, whatever
              you'd tell a customer.
            </li>
            <li>
              The AI will reply with JSON. Copy its entire reply.
            </li>
            <li>
              Come back here, click <strong>Clear</strong> above the big
              text box, and paste what the AI gave you in.
            </li>
            <li>
              Click <strong>Validate / Preview</strong> — if it says
              something's missing, paste the error back to the AI and ask
              it to fix it, then try again.
            </li>
            <li>
              Once the preview looks right, click <strong>Run Import</strong>.
            </li>
          </ol>

          <div className="import-guide-prompt-header">
            <span>Prompt to copy</span>
            <button type="button" className="btn btn-primary" onClick={handleCopyPrompt}>
              {promptCopied ? "Copied ✓" : "Copy prompt"}
            </button>
          </div>
          <pre className="import-guide-prompt-box">{AI_PROMPT_TEMPLATE}</pre>

          <p className="import-guide-note">
            One more thing: the AI can't make up real photo links, so it
            will leave <code>imageUrl</code> blank. After importing, open
            each piece in <strong>Showroom → Edit</strong> and paste in a
            photo link yourself (right-click any photo online → "Copy
            image address" works for most sites).
          </p>
        </div>
      )}

      <div style={{ display: "flex", gap: 10, marginBottom: 12 }}>
        <button
          type="button"
          className="btn btn-secondary"
          onClick={() => fileInputRef.current?.click()}
        >
          Upload .json file
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept="application/json,.json"
          onChange={handleFileUpload}
          style={{ display: "none" }}
        />
        <button
          type="button"
          className="btn btn-secondary"
          onClick={() => {
            setJsonText("");
            setPreview(null);
            setParseError("");
            setDone(false);
          }}
        >
          Clear
        </button>
      </div>

      <textarea
        value={jsonText}
        onChange={(e) => {
          setJsonText(e.target.value);
          setPreview(null);
          setDone(false);
        }}
        rows={14}
        spellCheck={false}
        style={{
          width: "100%",
          fontFamily: "monospace",
          fontSize: 12,
          padding: 12,
          border: "1px solid var(--cream-dark)",
          borderRadius: 6,
          marginBottom: 12,
        }}
      />

      {parseError && <p className="form-error">{parseError}</p>}

      <div style={{ display: "flex", gap: 10, marginBottom: 12 }}>
        <button type="button" className="btn btn-secondary" onClick={parseAndValidate}>
          Validate / Preview
        </button>
        <button
          type="button"
          className="btn btn-primary"
          onClick={handleImport}
          disabled={running || (preview && preview.issues.length > 0)}
        >
          {running ? "Importing…" : "Run Import"}
        </button>
      </div>

      {preview && (
        <div
          style={{
            background: preview.issues.length > 0 ? "#fdecea" : "#eef6ec",
            border: `1px solid ${preview.issues.length > 0 ? "var(--danger)" : "var(--success)"}`,
            borderRadius: 6,
            padding: 12,
            fontSize: 13,
            marginBottom: 12,
          }}
        >
          {preview.issues.length > 0 ? (
            <>
              <strong>Fix these before importing:</strong>
              <ul style={{ margin: "6px 0 0", paddingLeft: 18 }}>
                {preview.issues.map((issue, i) => (
                  <li key={i}>{issue}</li>
                ))}
              </ul>
            </>
          ) : (
            <span>
              ✓ Looks good — {preview.categoryCount} categor{preview.categoryCount === 1 ? "y" : "ies"} and{" "}
              {preview.furnitureCount} furniture piece{preview.furnitureCount === 1 ? "" : "s"} ready to import.
            </span>
          )}
        </div>
      )}

      {log.length > 0 && (
        <div
          style={{
            background: "#f8f7f4",
            border: "1px solid var(--cream-dark)",
            borderRadius: 6,
            padding: 14,
            fontSize: 12,
            fontFamily: "monospace",
            whiteSpace: "pre-wrap",
            maxHeight: 320,
            overflowY: "auto",
          }}
        >
          {log.join("\n")}
        </div>
      )}

      {done && (
        <p style={{ marginTop: 16, color: "var(--success)", fontWeight: 600, fontSize: 13 }}>
          ✓ Import finished.
        </p>
      )}
    </div>
  );
}