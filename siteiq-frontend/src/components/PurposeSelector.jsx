
import { DOMAINS } from "../lib/recommendations";

const DESCRIPTIONS = {
  residential:  "Houses, apartments, homesteads",
  commercial:   "Shops, offices, light industry",
  agriculture:  "Rain-fed crops and food production",
  pastoralism:  "Livestock, grazing, ranching",
  greenhouse:   "Protected horticulture",
  conservation: "Restoration and reforestation",
};

export default function PurposeSelector({ value, onChange }) {
  return (
    <div style={{ marginTop: 16 }}>
      <p className="section-label" style={{ marginBottom: 8 }}>
        Select intended use
      </p>
      <div style={{
        display: "grid",
        gridTemplateColumns: "1fr 1fr",
        gap: 7,
      }}>
        {Object.entries(DOMAINS).map(([key, { label, icon }]) => {
          const active = value === key;
          return (
            <button
              key={key}
              onClick={() => onChange(key)}
              style={{
                display: "flex",
                flexDirection: "column",
                alignItems: "flex-start",
                gap: 3,
                padding: "10px 11px",
                background: active ? "#1f2937" : "#f9fafb",
                border: `1.5px solid ${active ? "#1f2937" : "#e5e7eb"}`,
                borderRadius: 8,
                cursor: "pointer",
                textAlign: "left",
                transition: "all 0.12s",
              }}
              onMouseEnter={e => {
                if (!active) e.currentTarget.style.borderColor = "#9ca3af";
              }}
              onMouseLeave={e => {
                if (!active) e.currentTarget.style.borderColor = "#e5e7eb";
              }}
            >
              <span style={{ fontSize: 18, lineHeight: 1 }}>{icon}</span>
              <span style={{
                fontSize: 12, fontWeight: 600,
                color: active ? "#fff" : "#111827",
                fontFamily: "var(--font-body)",
              }}>
                {label}
              </span>
              <span style={{
                fontSize: 10, color: active ? "#9ca3af" : "#6b7280",
                lineHeight: 1.3,
              }}>
                {DESCRIPTIONS[key]}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
