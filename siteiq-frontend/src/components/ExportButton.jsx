import { useState } from "react";
import { getAuthHeader } from "../lib/supabase";
import { saveAnalysis } from "../api";

const API_BASE = import.meta.env.VITE_API_BASE || "http://localhost:8000";

function DownloadIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/>
      <polyline points="7 10 12 15 17 10"/>
      <line x1="12" y1="15" x2="12" y2="3"/>
    </svg>
  );
}

function Spinner() {
  return (
    <span style={{
      display: "inline-block", width: 12, height: 12,
      border: "2px solid rgba(255,255,255,0.3)",
      borderTopColor: "#fff", borderRadius: "50%",
      animation: "spin 0.7s linear infinite",
    }} />
  );
}

async function downloadPdf(url, filename) {
  const resp = await fetch(url);
  if (!resp.ok) throw new Error(`${resp.status}`);
  const blob = await resp.blob();
  const link = document.createElement("a");
  link.href  = URL.createObjectURL(blob);
  link.download = filename;
  link.click();
  URL.revokeObjectURL(link.href);
}

export default function ExportButton({ pin, radiusM, floodRisk, soil, climateSolar, user, recommendation, indicators, purpose, elevation, terrain, landCover, osm, onRequestSignIn }) {
  const [open,    setOpen]    = useState(false);
  const [title,   setTitle]   = useState("Site Intelligence Report");
  const [loading, setLoading] = useState(null);
  const [error,   setError]   = useState(null);
  const [includeFactualData, setIncludeFactualData] = useState(true);
  const [saveMode, setSaveMode] = useState("none");
  const [saveStatus, setSaveStatus] = useState("idle");
  const [saveMessage, setSaveMessage] = useState("");
  const [siteName, setSiteName] = useState("");
  const [notes, setNotes] = useState("");

  if (!pin) return null;

  const safeName = `${pin.lat.toFixed(4)}_${pin.lon.toFixed(4)}`;

  async function handleTopo() {
    setLoading("topo"); setError(null);
    try {
      const url = `${API_BASE}/topo-pdf?lat=${pin.lat}&lon=${pin.lon}&radius_m=${radiusM}&title=${encodeURIComponent(title)}`;
      await downloadPdf(url, `topo_${safeName}.pdf`);
    } catch (e) { setError(`Topo failed: ${e.message}`); }
    finally { setLoading(null); }
  }

  async function handleSiteDataReport() {
    setLoading("site-data"); setError(null);
    try {
      const headers = await getAuthHeader();
      const resp = await fetch(`${API_BASE}/site-report-pdf`, {
        method:  "POST",
        headers: { "Content-Type": "application/json", ...headers },
        body: JSON.stringify({
          lat: pin.lat, lon: pin.lon, radius_m: radiusM, title,
          flood_risk:    floodRisk    ?? null,
          soil:          soil         ?? null,
          climate_solar: climateSolar ?? null,
        }),
      });
      if (!resp.ok) throw new Error(`${resp.status}`);
      const blob = await resp.blob();
      const link = document.createElement("a");
      link.href  = URL.createObjectURL(blob);
      link.download = `site_data_${safeName}.pdf`;
      link.click();
      URL.revokeObjectURL(link.href);
    } catch (e) { setError(`Site data export failed: ${e.message}`); }
    finally { setLoading(null); }
  }

  async function handleAssessmentReport() {
    setLoading("assessment"); setError(null);
    try {
      const headers = await getAuthHeader();
      const resp = await fetch(`${API_BASE}/assessment-report-pdf`, {
        method:  "POST",
        headers: { "Content-Type": "application/json", ...headers },
        body: JSON.stringify({
          lat: pin.lat, lon: pin.lon, radius_m: radiusM, title,
          recommendation: recommendation ?? null,
          indicators: indicators ?? null,
          purpose: purpose ?? null,
          include_factual_data: includeFactualData,
          elevation: elevation ?? null,
          terrain: terrain ?? null,
          flood_risk: floodRisk ?? null,
          soil: soil ?? null,
          climate_solar: climateSolar ?? null,
          land_cover: landCover ?? null,
          osm: osm ?? null,
        }),
      });
      if (!resp.ok) throw new Error(`${resp.status}`);
      const blob = await resp.blob();
      const link = document.createElement("a");
      link.href  = URL.createObjectURL(blob);
      link.download = `assessment_report_${safeName}.pdf`;
      link.click();
      URL.revokeObjectURL(link.href);
    } catch (e) { setError(`Assessment export failed: ${e.message}`); }
    finally { setLoading(null); }
  }

  async function handleSave() {
    if (!pin) return;
    if (!user) {
      setSaveStatus("warning");
      setSaveMessage("Sign in to save this analysis and access it later.");
      onRequestSignIn?.();
      return;
    }
    if (!recommendation) {
      setSaveStatus("warning");
      setSaveMessage("Generate an assessment first before saving this analysis.");
      return;
    }

    if (!siteName.trim()) {
      setSaveStatus("warning");
      setSaveMessage("Please enter a site name before saving.");
      return;
    }

    setLoading("save"); setError(null); setSaveStatus("saving"); setSaveMessage("");
    try {
      await saveAnalysis({
        site_name: siteName.trim(),
        notes: notes.trim() || null,
        lat: pin.lat,
        lon: pin.lon,
        radius_m: radiusM,
        elevation,
        terrain,
        flood_risk: floodRisk,
        soil,
        climate_solar: climateSolar,
        land_cover: landCover,
        osm_context: osm,
        indicators,
        recommendation,
      });
      setSaveStatus("saved");
      setSaveMessage("Saved successfully.");
    } catch (e) {
      const msg = e?.response?.data?.detail ?? e.message ?? "Unknown error";
      setSaveStatus("error");
      setSaveMessage(`Save failed: ${msg}`);
    } finally {
      setLoading(null);
    }
  }

  const btnStyle = (color, disabled) => ({
    display: "flex", alignItems: "center", gap: 10, padding: "10px 12px",
    background: disabled ? "#9ca3af" : color, color: "#fff",
    border: "none", borderRadius: 7, fontSize: 12,
    fontFamily: "var(--font-body)", fontWeight: 500,
    cursor: disabled ? "default" : "pointer",
    width: "100%", textAlign: "left",
  });

  return (
    <div style={{ marginTop: 18, borderTop: "1px solid #e5e7eb", paddingTop: 14 }}>
      <p className="section-label">Export</p>

      {!open ? (
        <button onClick={() => setOpen(true)} style={btnStyle("#1f2937", false)}>
          <DownloadIcon /> Export Options
        </button>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <label style={{ fontSize: 11, color: "#6b7280", fontWeight: 500 }}>Title</label>
          <input value={title} onChange={e => setTitle(e.target.value)} style={{
            padding: "7px 10px", border: "1px solid #e5e7eb", borderRadius: 6,
            fontSize: 13, fontFamily: "var(--font-body)", outline: "none", width: "100%",
          }} />

          <button onClick={handleSiteDataReport} disabled={!!loading} style={btnStyle("#1f2937", !!loading)}>
            {loading === "site-data" ? <Spinner /> : <DownloadIcon />}
            <div>
              <div>Site data export</div>
              <div style={{ fontSize: 10, color: "#9ca3af", fontWeight: 400 }}>
                Full site report data · terrain + flood + soil + climate + solar + context
              </div>
            </div>
          </button>

          {user ? (
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              <label style={{ fontSize: 11, color: "#6b7280", fontWeight: 500 }}>Assessment export options</label>
              <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12, color: "#374151" }}>
                <input type="checkbox" checked={includeFactualData} onChange={e => setIncludeFactualData(e.target.checked)} />
                Include factual data in the assessment report
              </label>
              <button onClick={handleAssessmentReport} disabled={!!loading} style={btnStyle("#374151", !!loading)}>
                {loading === "assessment" ? <Spinner /> : <DownloadIcon />}
                <div>
                  <div>Assessment report export</div>
                  <div style={{ fontSize: 10, color: "#9ca3af", fontWeight: 400 }}>
                    Includes the assessment card summary and optional factual site data
                  </div>
                </div>
              </button>
            </div>
          ) : (
            <div style={{
              display: "flex", alignItems: "center", justifyContent: "space-between",
              padding: "10px 12px", background: "#f9fafb",
              border: "1px dashed #e5e7eb", borderRadius: 7,
            }}>
              <div>
                <p style={{ margin: 0, fontSize: 12, fontWeight: 500, color: "#374151" }}>Assessment report export</p>
                <p style={{ margin: 0, fontSize: 10, color: "#9ca3af" }}>Sign in to unlock · assessment summary PDF</p>
              </div>
              <span style={{ fontSize: 16 }}>🔒</span>
            </div>
          )}

          <div style={{ display: "flex", flexDirection: "column", gap: 8, padding: "10px 12px", background: "#f9fafb", border: "1px solid #e5e7eb", borderRadius: 7 }}>
            <label style={{ fontSize: 11, color: "#6b7280", fontWeight: 500 }}>Save options</label>
            {!user ? (
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                <p style={{ margin: 0, fontSize: 12, color: "#374151", lineHeight: 1.5 }}>
                  Save this assessment and revisit it later.
                </p>
                <p style={{ margin: 0, fontSize: 11, color: "#6b7280" }}>
                  Sign in to unlock saving and access your saved analyses.
                </p>
              </div>
            ) : (
              <>
                <label style={{ fontSize: 12, color: "#374151" }}>Site name</label>
                <input value={siteName} onChange={e => { setSiteName(e.target.value); setSaveStatus("idle"); setSaveMessage(""); }} placeholder="e.g. Wundanyi Plot" style={{ padding: "7px 10px", border: "1px solid #e5e7eb", borderRadius: 6, fontSize: 13, fontFamily: "var(--font-body)", outline: "none" }} />
                <label style={{ fontSize: 12, color: "#374151" }}>Notes (optional)</label>
                <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={3} placeholder="Observations, next steps…" style={{ padding: "7px 10px", border: "1px solid #e5e7eb", borderRadius: 6, fontSize: 13, fontFamily: "var(--font-body)", resize: "vertical", outline: "none" }} />
              </>
            )}
            {saveStatus === "warning" && <p style={{ fontSize: 12, color: "#f59e0b", margin: 0 }}>{saveMessage}</p>}
            {saveStatus === "error" && <p style={{ fontSize: 12, color: "#ef4444", margin: 0 }}>{saveMessage}</p>}
            {saveStatus === "saved" && <p style={{ fontSize: 12, color: "#22c55e", margin: 0 }}>{saveMessage}</p>}
            <button onClick={handleSave} disabled={!!loading} style={btnStyle("#1f2937", !!loading)}>
              {loading === "save" ? <Spinner /> : <DownloadIcon />}
              <div>
                <div>{user ? "Save analysis" : "Sign in to save"}</div>
                <div style={{ fontSize: 10, color: "#9ca3af", fontWeight: 400 }}>
                  {user ? "Save the assessment with factual site data" : "Create an account to save and revisit this analysis"}
                </div>
              </div>
            </button>
          </div>

          {error && <p style={{ fontSize: 12, color: "#ef4444", margin: 0 }}>{error}</p>}

          <button onClick={() => { setOpen(false); setError(null); setSaveStatus("idle"); setSaveMessage(""); }} style={{
            padding: "7px", background: "#f3f4f6", color: "#6b7280",
            border: "1px solid #e5e7eb", borderRadius: 6,
            fontSize: 12, fontFamily: "var(--font-body)", cursor: "pointer",
          }}>
            Cancel
          </button>
        </div>
      )}
    </div>
  );
}