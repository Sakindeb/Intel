import { useState } from "react";
import IndicatorSummary from "./IndicatorSummary";

const SCORE_COLOR = (s) =>
  s >= 80 ? "#22c55e" : s >= 65 ? "#84cc16" : s >= 50 ? "#f59e0b" : "#ef4444";

function ScoreRing({ score }) {
  const r   = 36;
  const circ = 2 * Math.PI * r;
  const fill  = (score / 100) * circ;
  const color = SCORE_COLOR(score);

  return (
    <div style={{ position: "relative", width: 88, height: 88, flexShrink: 0 }}>
      <svg width="88" height="88" style={{ transform: "rotate(-90deg)" }}>
        <circle cx="44" cy="44" r={r} fill="none" stroke="#e5e7eb" strokeWidth="7" />
        <circle cx="44" cy="44" r={r} fill="none" stroke={color} strokeWidth="7"
          strokeDasharray={`${fill} ${circ}`} strokeLinecap="round" />
      </svg>
      <div style={{
        position: "absolute", inset: 0,
        display: "flex", flexDirection: "column",
        alignItems: "center", justifyContent: "center",
      }}>
        <span style={{ fontSize: 20, fontWeight: 700, color: "#111827", lineHeight: 1 }}>
          {score}
        </span>
        <span style={{ fontSize: 9, color: "#9ca3af" }}>/ 100</span>
      </div>
    </div>
  );
}

function Tag({ text, type }) {
  const colors = {
    strength:      { bg: "#f0fdf4", border: "#86efac", text: "#15803d" },
    consideration: { bg: "#fffbeb", border: "#fcd34d", text: "#92400e" },
    action:        { bg: "#eff6ff", border: "#93c5fd", text: "#1e40af" },
  };
  const c = colors[type] ?? colors.action;
  return (
    <div style={{
      padding: "6px 10px", borderRadius: 6,
      background: c.bg, border: `1px solid ${c.border}`,
      fontSize: 12, color: c.text, lineHeight: 1.5,
    }}>
      {type === "strength"      && "✅ "}
      {type === "consideration" && "⚠️ "}
      {type === "action"        && "→ "}
      {text}
    </div>
  );
}

function Accordion({ title, children, defaultOpen = false }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div style={{ borderTop: "1px solid #e5e7eb" }}>
      <div
        onClick={() => setOpen(v => !v)}
        style={{
          display: "flex", justifyContent: "space-between", alignItems: "center",
          padding: "10px 0", cursor: "pointer",
        }}
      >
        <span style={{ fontSize: 12, fontWeight: 600, color: "#374151" }}>{title}</span>
        <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
          <path d={open ? "M2 8L6 4L10 8" : "M2 4L6 8L10 4"}
            stroke="#9ca3af" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </div>
      {open && <div style={{ paddingBottom: 14 }}>{children}</div>}
    </div>
  );
}

export default function SuitabilityPanel({ recommendation, indicators, purpose, onReset, fullDataChildren }) {
  if (!recommendation) return null;

  const { score, summary, strengths = [], considerations = [], recommendations: actions = [], domain_specific } = recommendation;
  const color = SCORE_COLOR(score);

  return (
    <div style={{ marginTop: 4 }}>

      {/* ── Score header ── */}
      <div style={{
        display: "flex", alignItems: "center", gap: 16,
        padding: "16px", background: "#f9fafb",
        borderRadius: 10, border: "1px solid #e5e7eb",
        marginBottom: 14,
      }}>
        <ScoreRing score={score} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <p style={{ margin: "0 0 4px", fontSize: 11, fontWeight: 600,
            textTransform: "uppercase", letterSpacing: "0.05em", color: "#9ca3af" }}>
            {recommendation.purpose_label}
          </p>
          <p style={{ margin: "0 0 8px", fontSize: 14, fontWeight: 700,
            color: "#111827", lineHeight: 1.3 }}>
            {summary}
          </p>
          <div style={{
            display: "inline-block", padding: "2px 10px",
            background: color + "18", border: `1px solid ${color}`,
            borderRadius: 20, fontSize: 10, fontWeight: 700,
            textTransform: "uppercase", letterSpacing: "0.05em", color,
          }}>
            {score >= 80 ? "Well Suited"
              : score >= 65 ? "Suitable"
              : score >= 50 ? "Marginal"
              : "Poorly Suited"}
          </div>
        </div>
      </div>

      {/* ── Strengths ── */}
      {strengths.length > 0 && (
        <div style={{ marginBottom: 10 }}>
          <p className="section-label" style={{ marginBottom: 6 }}>Site Strengths</p>
          <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
            {strengths.map((s, i) => <Tag key={i} text={s} type="strength" />)}
          </div>
        </div>
      )}

      {/* ── Considerations ── */}
      {considerations.length > 0 && (
        <div style={{ marginBottom: 10 }}>
          <p className="section-label" style={{ marginBottom: 6 }}>Considerations</p>
          <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
            {considerations.map((c, i) => <Tag key={i} text={c} type="consideration" />)}
          </div>
        </div>
      )}

      {/* ── Recommendations ── */}
      {actions.length > 0 && (
        <div style={{ marginBottom: 10 }}>
          <p className="section-label" style={{ marginBottom: 6 }}>Recommendations</p>
          <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
            {actions.map((a, i) => <Tag key={i} text={a} type="action" />)}
          </div>
        </div>
      )}

      {/* ── Domain-specific extras ── */}
      {domain_specific?.recommended_crops?.length > 0 && (
        <div style={{ marginBottom: 10 }}>
          <p className="section-label" style={{ marginBottom: 6 }}>Recommended Crops</p>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 5 }}>
            {domain_specific.recommended_crops.map((crop, i) => (
              <span key={i} style={{
                padding: "3px 9px", background: "#f0fdf4",
                border: "1px solid #86efac", borderRadius: 20,
                fontSize: 11, color: "#15803d", fontWeight: 500,
              }}>
                {crop}
              </span>
            ))}
          </div>
        </div>
      )}

      {domain_specific?.foundation_type_hint && (
        <div style={{
          padding: "8px 10px", background: "#eff6ff",
          border: "1px solid #93c5fd", borderRadius: 6,
          fontSize: 11, color: "#1e40af", marginBottom: 10,
        }}>
          🏗 Foundation: {domain_specific.foundation_type_hint}
        </div>
      )}

      {/* ── Environmental summary (indicators) ── */}
      <IndicatorSummary indicators={indicators} />

      {/* ── Full data accordion ── */}
      {fullDataChildren && (
        <div style={{ marginTop: 14 }}>
          <Accordion title="Full Data ▶  raw measurements and charts">
            {fullDataChildren}
          </Accordion>
        </div>
      )}

      {/* ── Reset button ── */}
      <button
        onClick={onReset}
        style={{
          marginTop: 14, width: "100%", padding: "8px",
          background: "#f3f4f6", color: "#374151",
          border: "1px solid #e5e7eb", borderRadius: 7,
          fontSize: 12, fontFamily: "var(--font-body)", cursor: "pointer",
        }}
      >
        ← Change domain / view raw data
      </button>
    </div>
  );
}
