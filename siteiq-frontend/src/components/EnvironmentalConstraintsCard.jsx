const CAUTION_STYLES = {
  none:     { bg: "#f0fdf4", border: "#22c55e", text: "#166534", label: "NONE" },
  low:      { bg: "#f0fdf4", border: "#84cc16", text: "#3f6212", label: "LOW" },
  moderate: { bg: "#fffbeb", border: "#f59e0b", text: "#92400e", label: "MODERATE" },
  high:     { bg: "#fff7ed", border: "#f97316", text: "#9a3412", label: "HIGH" },
  critical: { bg: "#fef2f2", border: "#ef4444", text: "#b91c1c", label: "CRITICAL" },
};

const RELATIONSHIP_LABELS = {
  inside: "Inside",
  overlapping: "Overlapping",
  adjacent: "Adjacent",
  nearby: "Nearby",
  not_applicable: "Not applicable",
};

function ConstraintRow({ icon, title, result }) {
  if (!result) {
    return (
      <div style={{ padding: "8px 0", borderTop: "1px solid #f3f4f6" }}>
        <p style={{ margin: 0, fontSize: 12, color: "#9ca3af" }}>
          {icon} {title} — not yet assessed
        </p>
      </div>
    );
  }

  const style = CAUTION_STYLES[result.caution] || CAUTION_STYLES.none;

  return (
    <div style={{
      padding: "10px 12px",
      marginTop: 8,
      background: style.bg,
      borderLeft: `3px solid ${style.border}`,
      borderRadius: "0 6px 6px 0",
    }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <span style={{ fontSize: 12, fontWeight: 700, color: "#111827" }}>
          {icon} {title}
        </span>
        <span style={{
          fontSize: 10, fontWeight: 700, color: style.text,
          padding: "2px 6px", borderRadius: 4, background: "#fff",
        }}>
          {style.label}
        </span>
      </div>

      <div className="stat-grid" style={{ marginTop: 8 }}>
        <div className="stat">
          <span className="stat-label">Detected</span>
          <span className="stat-value">{result.detected ? "Yes" : "No"}</span>
        </div>
        <div className="stat">
          <span className="stat-label">Relationship</span>
          <span className="stat-value">
            {RELATIONSHIP_LABELS[result.relationship] ?? "—"}
          </span>
        </div>
        {result.overlap_percent != null && (
          <div className="stat">
            <span className="stat-label">Overlap</span>
            <span className="stat-value">{result.overlap_percent}%</span>
          </div>
        )}
        {result.distance_m != null && result.overlap_percent == null && (
          <div className="stat">
            <span className="stat-label">Distance</span>
            <span className="stat-value">{result.distance_m}m</span>
          </div>
        )}
      </div>

      <p style={{ margin: "8px 0 0", fontSize: 12, color: "#111827" }}>
        {result.reason}
      </p>
      <p style={{ margin: "4px 0 0", fontSize: 11, color: "#374151", fontStyle: "italic" }}>
        {result.action}
      </p>
    </div>
  );
}

export default function EnvironmentalConstraintsCard({ constraints }) {
  if (!constraints) return null;

  return (
    <div>
      <ConstraintRow  title="Protected Areas" result={constraints.protected_areas} />
      <ConstraintRow  title="Wetlands" result={constraints.wetlands} />
      <ConstraintRow  title="Waterways" result={constraints.waterways} />
      <ConstraintRow  title="Forest" result={constraints.forest} />
      <ConstraintRow  title="Biodiversity" result={constraints.biodiversity} />

      <p style={{
        margin: "12px 0 0", padding: "8px 10px",
        fontSize: 10, color: "#6b7280", lineHeight: 1.5,
        background: "#f9fafb", borderRadius: 6,
      }}>
        {constraints.disclaimer}
      </p>
    </div>
  );
}