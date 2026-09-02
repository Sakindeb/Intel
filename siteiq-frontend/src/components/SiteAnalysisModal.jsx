import { useState } from "react";

const LAND_USE_OPTIONS = [
  { id: "development", icon: "🏘️", label: "Development", description: "Buildings, roads, housing" },
  { id: "agriculture", icon: "🌾", label: "Agriculture", description: "Farming, crops, livestock" },
  { id: "restoration", icon: "🌳", label: "Restoration", description: "Rehabilitating degraded land" },
  { id: "conservation", icon: "🌿", label: "Conservation", description: "Preserving in current state" },
  { id: "general", icon: "🔍", label: "General analysis", description: "Not sure yet — assess without a specific use" },
];

const CAUTION_BADGE = {
  none:     { bg: "#f0fdf4", text: "#166534", label: "None" },
  low:      { bg: "#f0fdf4", text: "#3f6212", label: "Low" },
  moderate: { bg: "#fffbeb", text: "#92400e", label: "Moderate" },
  high:     { bg: "#fff7ed", text: "#9a3412", label: "High" },
  critical: { bg: "#fef2f2", text: "#b91c1c", label: "Critical" },
};

// Which selected land uses conflict with which detected constraints,
// and what to tell the user about it.
function getConflictWarning(landUseId, constraints) {
  if (!constraints) return null;
  const pa = constraints.protected_areas;
  if (!pa?.detected) return null;

  if (landUseId === "development" && (pa.relationship === "inside" || pa.relationship === "overlapping")) {
    return "This site sits within a protected area — development is likely restricted.";
  }
  if (landUseId === "agriculture" && pa.relationship === "inside") {
    return "This site sits within a protected area — agricultural use may be restricted.";
  }
  return null;
}

export default function SiteAnalysisModal({ open, onClose, onContinue, environmentalConstraints }) {
  const [selected, setSelected] = useState([]);

  if (!open) return null;

  const toggle = (id) => {
    setSelected((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  };

  const handleContinue = () => {
    if (selected.length === 0) return;
    onContinue(selected);
  };

  const paCaution = environmentalConstraints?.protected_areas?.caution;
  const paBadge = paCaution ? CAUTION_BADGE[paCaution] : null;

  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)",
        display: "flex", alignItems: "center", justifyContent: "center",
        zIndex: 1000, padding: 16,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: "#fff", borderRadius: 12, maxWidth: 440, width: "100%",
          maxHeight: "90vh", overflowY: "auto", padding: "24px 20px",
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
          <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: "#111827" }}>
            🌍 Analyse this site
          </h2>
          <button
            onClick={onClose}
            aria-label="Close"
            style={{
              background: "none", border: "none", fontSize: 18, color: "#9ca3af",
              cursor: "pointer", padding: 4, lineHeight: 1,
            }}
          >
            ✕
          </button>
        </div>

        <p style={{ fontSize: 13, color: "#374151", lineHeight: 1.5, margin: "10px 0 16px" }}>
          SiteIQ will assess this site's environmental and climate conditions to identify:
        </p>

        <div style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 18 }}>
          {[
            { icon: "⚠️", title: "Potential hazards", body: "Physical and climate threats affecting the site." },
            { icon: "👥", title: "Exposure", body: "People, infrastructure and environmental assets that may be affected." },
            { icon: "🛡️", title: "Vulnerability", body: "Factors that could increase sensitivity to environmental or climate impacts." },
            { icon: "🌱", title: "Land-use opportunities", body: "Potential sustainable uses and interventions for this site." },
          ].map((item) => (
            <div key={item.title} style={{ display: "flex", gap: 10 }}>
              <span style={{ fontSize: 16 }}>{item.icon}</span>
              <div>
                <p style={{ margin: 0, fontSize: 13, fontWeight: 600, color: "#111827" }}>{item.title}</p>
                <p style={{ margin: "2px 0 0", fontSize: 12, color: "#6b7280", lineHeight: 1.4 }}>{item.body}</p>
              </div>
            </div>
          ))}
        </div>

        {paBadge && (
          <div style={{
            display: "flex", alignItems: "center", justifyContent: "space-between",
            padding: "8px 10px", marginBottom: 16,
            background: paBadge.bg, borderRadius: 8,
          }}>
            <span style={{ fontSize: 12, color: "#111827" }}>
              🛡️ Protected area check
            </span>
            <span style={{ fontSize: 11, fontWeight: 700, color: paBadge.text }}>
              {paBadge.label}
            </span>
          </div>
        )}

        <p style={{ fontSize: 13, fontWeight: 600, color: "#111827", margin: "0 0 4px" }}>
          What are you considering for this land?
        </p>
        <p style={{ fontSize: 12, color: "#6b7280", margin: "0 0 12px" }}>
          Select one or more options.
        </p>

        <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 16 }}>
          {LAND_USE_OPTIONS.map((option) => {
            const isSelected = selected.includes(option.id);
            const warning = getConflictWarning(option.id, environmentalConstraints);
            return (
              <div key={option.id}>
                <button
                  onClick={() => toggle(option.id)}
                  style={{
                    width: "100%", display: "flex", alignItems: "center", gap: 10,
                    padding: "10px 12px", textAlign: "left",
                    background: isSelected ? "#111827" : "#f9fafb",
                    color: isSelected ? "#fff" : "#111827",
                    border: `1px solid ${isSelected ? "#111827" : "#e5e7eb"}`,
                    borderRadius: 8, cursor: "pointer",
                  }}
                >
                  <span style={{ fontSize: 16 }}>{option.icon}</span>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 13, fontWeight: 600 }}>{option.label}</div>
                    <div style={{ fontSize: 11, color: isSelected ? "#d1d5db" : "#6b7280" }}>
                      {option.description}
                    </div>
                  </div>
                  {isSelected && <span style={{ fontSize: 14 }}>✓</span>}
                </button>
                {warning && (
                  <p style={{
                    margin: "4px 0 0", padding: "6px 10px", fontSize: 11, color: "#b91c1c",
                    background: "#fef2f2", borderRadius: 6,
                  }}>
                    ⚠️ {warning}
                  </p>
                )}
              </div>
            );
          })}
        </div>

        <p style={{ fontSize: 10, color: "#9ca3af", lineHeight: 1.5, margin: "0 0 14px" }}>
          SiteIQ environmental constraints are intended for preliminary screening and decision
          support. They do not replace legally authoritative zoning, environmental impact
          assessments, or site-specific regulatory review.
        </p>

        <button
          onClick={handleContinue}
          disabled={selected.length === 0}
          style={{
            width: "100%", padding: "11px 10px",
            background: selected.length === 0 ? "#e5e7eb" : "#1f2937",
            color: selected.length === 0 ? "#9ca3af" : "#fff",
            border: "none", borderRadius: 7, fontSize: 13, fontWeight: 600,
            cursor: selected.length === 0 ? "not-allowed" : "pointer",
          }}
        >
          Continue Analysis →
        </button>
      </div>
    </div>
  );
}