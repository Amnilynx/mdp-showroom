import { useRef, useState } from "react";
import {
  getPortfolioItems,
  createPortfolioItem,
  updatePortfolioItem,
} from "../../lib/portfolio";

// Bulk import for the "Our Work" gallery — same pattern as
// ImportFurniture.jsx, but much simpler: portfolio items have no
// category, no pricing, no size/finish/hardware options. Just a title,
// a description, and a list of photo URLs. Matched by title (case-
// insensitive) — an existing project with the same title is updated,
// anything new is created. Nothing is ever deleted.
const EXAMPLE_JSON = JSON.stringify(
  {
    portfolio: [
      {
        title: "Hardware & Fittings Display",
        description: "A look at the door locks, handles, and sliding-door hardware we work with.",
        imageUrls: [""],
      },
    ],
  },
  null,
  2
);

const REQUIRED_FIELDS = ["title", "imageUrls"];

const AI_PROMPT_TEMPLATE = `I'm adding finished projects to the "Our Work" gallery on my family's furniture website. I need you to output ONLY a JSON object (no explanation, no markdown code fences, just the raw JSON) in exactly this shape:

{
  "portfolio": [
    {
      "title": "Project Title",
      "description": "A short one or two sentence write-up about this project.",
      "imageUrls": [""]
    }
  ]
}

Rules:
- "imageUrls" must have at least one entry (can be more than one photo per project)
- Leave every imageUrls entry as an empty string "" — I'll add photo links myself afterward
- If I only give you one project, only include one object in the "portfolio" array
- Output valid JSON only — nothing before or after it

Here's what I want to add:
[DESCRIBE YOUR PROJECT(S) HERE — e.g. "A finished walk-in closet project in Quezon City, walnut finish, two photos."]`;

export default function ImportPortfolio() {
  const [jsonText, setJsonText] = useState(EXAMPLE_JSON);
  const [parseError, setParseError] = useState("");
  const [preview, setPreview] = useState(null); // { itemCount, issues, data }
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

    const portfolio = Array.isArray(data.portfolio) ? data.portfolio : [];

    const issues = [];
    portfolio.forEach((item, i) => {
      REQUIRED_FIELDS.forEach((field) => {
        if (field === "imageUrls") {
          const urls = (item.imageUrls || []).filter((u) => u && u.trim());
          if (urls.length === 0) {
            issues.push(`Item ${i + 1} (${item.title || "untitled"}) needs at least one non-empty photo URL.`);
          }
        } else if (!item[field]) {
          issues.push(`Item ${i + 1} (${item.title || "untitled"}) is missing "${field}".`);
        }
      });
    });

    if (portfolio.length === 0) {
      issues.push('No portfolio items found — check your JSON has a "portfolio" key with a list of items.');
    }

    const result = {
      itemCount: portfolio.length,
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
      const { portfolio = [] } = result.data;

      appendLog("Loading existing portfolio items…");
      const existingItems = await getPortfolioItems();

      for (const item of portfolio) {
        const cleanedUrls = (item.imageUrls || []).map((u) => u.trim()).filter(Boolean);
        const payload = {
          title: item.title.trim(),
          description: (item.description || "").trim(),
          imageUrls: cleanedUrls,
        };

        const match = existingItems.find(
          (p) => p.title.trim().toLowerCase() === item.title.trim().toLowerCase()
        );

        if (match) {
          await updatePortfolioItem(match.id, payload);
          appendLog(`✓ Updated existing: ${item.title}`);
        } else {
          await createPortfolioItem(payload);
          appendLog(`✓ Created new: ${item.title}`);
        }
      }

      appendLog("Done. Check /admin/portfolio to confirm.");
      setDone(true);
    } catch (err) {
      appendLog(`✗ Error: ${err.message || "Something went wrong."}`);
    } finally {
      setRunning(false);
    }
  }

  return (
    <div className="ticket-card" style={{ maxWidth: 760 }}>
      <h4>Import "Our Work" Projects</h4>
      <p style={{ fontSize: 13, color: "var(--text-muted)", marginBottom: 16 }}>
        Paste or upload a JSON file with a <code>"portfolio"</code> key — a
        list of projects, each with a title, description, and one or more
        photo URLs. Projects are matched by title — an existing one with
        the same title is updated, anything new is created. Nothing is
        deleted.
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
          <h5>How to add projects without writing JSON yourself</h5>
          <ol className="import-guide-steps">
            <li>Open ChatGPT (or any AI chat) in another tab.</li>
            <li>
              Copy the prompt below and paste it in. At the bottom, replace
              the bracketed line with a plain description of the project(s)
              you want to add.
            </li>
            <li>The AI will reply with JSON. Copy its entire reply.</li>
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
            will leave <code>imageUrls</code> empty. After importing, open
            each project in <strong>Our Work → Edit</strong> and paste in
            photo links yourself.
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
              ✓ Looks good — {preview.itemCount} project{preview.itemCount === 1 ? "" : "s"} ready to import.
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