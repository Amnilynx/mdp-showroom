import { useState } from "react";
import AdminLayout from "../../components/AdminLayout";
import ImportFurniture from "./ImportFurniture";
import ImportPortfolio from "./ImportPortfolio";

// Single "Import" admin page, split into two tabs: bulk-import for the
// orderable Showroom catalog (categories + furniture) and bulk-import for
// the "Our Work" gallery (portfolio projects). Two separate Firestore
// collections with completely different shapes, so the actual import
// logic lives in its own component per tab — this page just switches
// between them so the sidebar only needs one "Import" link.
const TABS = [
  { key: "furniture", label: "Showroom (Categories & Furniture)" },
  { key: "portfolio", label: "Our Work (Portfolio)" },
];

export default function Import() {
  const [tab, setTab] = useState("furniture");

  return (
    <AdminLayout title="Bulk Import">
      <div className="import-tabs" style={{ display: "flex", gap: 8, marginBottom: 20 }}>
        {TABS.map((t) => (
          <button
            key={t.key}
            type="button"
            className={"btn " + (tab === t.key ? "btn-primary" : "btn-secondary")}
            onClick={() => setTab(t.key)}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === "furniture" ? <ImportFurniture /> : <ImportPortfolio />}
    </AdminLayout>
  );
}