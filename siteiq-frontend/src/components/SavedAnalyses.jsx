
import { useState, useEffect, useCallback } from "react";
import { listAnalyses, getAnalysis, deleteAnalysis } from "../api";

const RISK_COLORS = {
  high:          "#ef4444",
  "medium-high": "#f97316",
  medium:        "#f59e0b",
  low:           "#22c55e",
};

function AnalysisRow({ analysis, onLoad, onDelete }) {
  const [deleting, setDeleting] = useState(false);
  const site      = analysis.sites ?? {};
  const riskLevel = analysis.risk_level;
  const elevM     = analysis.elevation_m;

  async function handleDelete(e) {
    e.stopPropagation();
    if (!confirm(`Delete "${site.name ?? "this analysis"}"? Cannot be undone.`)) return;
    setDeleting(true);
    try {
      await deleteAnalysis(analysis.id);
      onDelete(analysis.id);
    } catch {
      setDeleting(false);
    }
  }

  return (
    <div
      onClick={() => onLoad(analysis.id)}
      style={{
        padding: "12px 14px", borderBottom: "1px solid #f3f4f6",
        cursor: "pointer", display: "flex",
        justifyContent: "space-between", alignItems: "flex-start",
        transition: "background 0.1s",
      }}
      onMouseEnter={e => e.currentTarget.style.background = "#f9fafb"}
      onMouseLeave={e => e.currentTarget.style.background = "transparent"}
    >
      <div style={{ minWidth: 0, flex: 1 }}>
        {/* Site name */}
        <p style={{
          margin: "0 0 2px", fontSize: 13, fontWeight: 600, color: "#111827",
          overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
        }}>
          {site.name ?? "Unnamed Site"}
        </p>

        {/* Coordinates */}
        <p style={{
          margin: "0 0 6px", fontSize: 10,
          color: "#9ca3af", fontFamily: "var(--font-mono)",
        }}>
          {site.lat?.toFixed(4)}, {site.lon?.toFixed(4)}
          {analysis.radius_m && ` · ${analysis.radius_m}m`}
        </p>

        {/* Metrics row */}
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
          {elevM != null && (
            <span style={{
              fontSize: 10, color: "#374151",
              background: "#f3f4f6", padding: "2px 6px", borderRadius: 4,
            }}>
              {Number(elevM).toFixed(0)}m
            </span>
          )}
          {riskLevel && RISK_COLORS[riskLevel] && (
            <span style={{
              fontSize: 10, color: "#fff", padding: "2px 6px", borderRadius: 4,
              background: RISK_COLORS[riskLevel],
              textTransform: "uppercase", fontWeight: 600, letterSpacing: "0.04em",
            }}>
              {riskLevel}
            </span>
          )}
          <span style={{ fontSize: 10, color: "#9ca3af" }}>
            {new Date(analysis.created_at).toLocaleDateString("en-GB", {
              day: "numeric", month: "short", year: "numeric",
            })}
          </span>
        </div>

        {analysis.notes && (
          <p style={{ margin: "6px 0 0", fontSize: 11, color: "#6b7280", lineHeight: 1.4 }}>
            {analysis.notes.length > 80
              ? `${analysis.notes.slice(0, 80)}…`
              : analysis.notes}
          </p>
        )}
      </div>

      {/* Delete */}
      <button
        onClick={handleDelete}
        disabled={deleting}
        title="Delete"
        style={{
          marginLeft: 8, flexShrink: 0, background: "none",
          border: "none", color: "#d1d5db", cursor: "pointer",
          fontSize: 14, padding: "2px 4px", borderRadius: 4,
        }}
        onMouseEnter={e => e.currentTarget.style.color = "#ef4444"}
        onMouseLeave={e => e.currentTarget.style.color = "#d1d5db"}
      >
        {deleting ? "…" : "✕"}
      </button>
    </div>
  );
}

export default function SavedAnalyses({ user, onLoadAnalysis, onRequestSignIn }) {
  const [open,     setOpen]     = useState(false);
  const [analyses, setAnalyses] = useState([]);
  const [loading,  setLoading]  = useState(false);
  const [error,    setError]    = useState(null);

  const fetchList = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    setError(null);
    try {
      const data = await listAnalyses();
      setAnalyses(data);
    } catch (e) {
      setError(e?.response?.data?.detail ?? e.message);
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    if (open) fetchList();
  }, [open, fetchList]);

  async function handleLoad(analysisId) {
    try {
      const data = await getAnalysis(analysisId);
      onLoadAnalysis(data);
      setOpen(false);
    } catch (e) {
      alert(`Could not load analysis: ${e?.response?.data?.detail ?? e.message}`);
    }
  }

  function handleDelete(deletedId) {
    setAnalyses(prev => prev.filter(a => a.id !== deletedId));
  }

  function handleOpen() {
    if (!user) {
      onRequestSignIn?.();
      return;
    }
    setOpen(true);
  }

  return (
    <>
      {/* Header trigger */}
      <button
        onClick={handleOpen}
        title="My saved analyses"
        style={{
          display: "flex", alignItems: "center", gap: 6,
          padding: "5px 10px",
          background: "rgba(255,255,255,0.10)",
          border: "1px solid rgba(255,255,255,0.20)",
          borderRadius: 6, color: "#d1d5db", fontSize: 12,
          fontFamily: "var(--font-body)", cursor: "pointer", whiteSpace: "nowrap",
        }}
      >
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none"
          stroke="currentColor" strokeWidth="2" strokeLinecap="round">
          <path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z"/>
          <polyline points="9 22 9 12 15 12 15 22"/>
        </svg>
        Saved
      </button>

      {/* Drawer */}
      {open && user && (
        <div
          onClick={() => setOpen(false)}
          style={{
            position: "fixed", inset: 0, zIndex: 4000,
            background: "rgba(0,0,0,0.35)",
          }}
        >
          <div
            onClick={e => e.stopPropagation()}
            style={{
              position: "fixed", top: 0, right: 0, bottom: 0,
              width: "min(380px, 100vw)",
              background: "#fff",
              boxShadow: "-4px 0 24px rgba(0,0,0,0.15)",
              display: "flex", flexDirection: "column",
              zIndex: 4001,
            }}
          >
            {/* Header */}
            <div style={{
              padding: "16px 14px 12px",
              borderBottom: "1px solid #e5e7eb",
              display: "flex", justifyContent: "space-between", alignItems: "center",
              background: "#1f2937",
            }}>
              <div>
                <p style={{ margin: 0, fontSize: 14, fontWeight: 600, color: "#fff" }}>
                  Saved Analyses
                </p>
                <p style={{ margin: 0, fontSize: 11, color: "#9ca3af" }}>
                  {analyses.length} {analyses.length === 1 ? "site" : "sites"} saved
                </p>
              </div>
              <button
                onClick={() => setOpen(false)}
                style={{
                  background: "rgba(255,255,255,0.10)", border: "none",
                  color: "#9ca3af", cursor: "pointer",
                  borderRadius: 6, padding: "4px 8px", fontSize: 14,
                }}
              >
                ✕
              </button>
            </div>

            {/* Body */}
            <div style={{ flex: 1, overflowY: "auto" }}>
              {loading && (
                <p style={{ padding: 20, fontSize: 13, color: "#9ca3af", textAlign: "center" }}>
                  Loading…
                </p>
              )}
              {error && (
                <p style={{ padding: 20, fontSize: 12, color: "#ef4444", textAlign: "center" }}>
                  {error}
                </p>
              )}
              {!loading && !error && analyses.length === 0 && (
                <div style={{ padding: "40px 20px", textAlign: "center" }}>
                  <p style={{ fontSize: 28, marginBottom: 8 }}>📍</p>
                  <p style={{ fontSize: 13, color: "#6b7280", lineHeight: 1.5 }}>
                    No saved analyses yet.<br />
                    Drop a pin, run an analysis,<br />then click "Save this analysis".
                  </p>
                </div>
              )}
              {!loading && analyses.map(a => (
                <AnalysisRow
                  key={a.id}
                  analysis={a}
                  onLoad={handleLoad}
                  onDelete={handleDelete}
                />
              ))}
            </div>

            {/* Footer */}
            <div style={{
              padding: "10px 14px",
              borderTop: "1px solid #e5e7eb",
              fontSize: 10, color: "#9ca3af", textAlign: "center",
            }}>
              Click an analysis to restore the full panel
            </div>
          </div>
        </div>
      )}
    </>
  );
}
