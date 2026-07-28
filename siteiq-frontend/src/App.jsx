import { useState, useCallback, useEffect, useRef } from "react";
import MapView from "./components/MapView";
import SitePanel from "./components/SitePanel";
import LayersMenu from "./components/LayersMenu";
import FeedbackButton from "./components/FeedbackButton";
import AuthButton from "./components/AuthButton";
import SavedAnalyses from "./components/SavedAnalyses";
import { SignInModal } from "./components/SignInPrompt";
import { supabase } from "./lib/supabase";
import {
  getElevation, getTerrain, getTerrainProfile,
  getOsmContext, getFloodRisk, getElevationGrid,
  getClimateSolar, getSoil, getLandCover, getLandUseSuitability,
} from "./api";
import { computeIndicators } from "./lib/indicators";
import { generateRecommendation } from "./lib/recommendations";
import "./App.css";

const DEFAULT_TOGGLES = {
  osmContext:      false,
  elevationBuffer: true,
  terrainProfile:  true,
  contours:        false,
  landCover:       false,
  soilMap:         false,
};

const settle = (p, tag) =>
  p.then(v => v).catch(e => { console.warn(`${tag}:`, e?.message); return null; });

export default function App() {
  const [pin,          setPin]          = useState(null);
  const [elevation,    setElevation]    = useState(null);
  const [terrain,      setTerrain]      = useState(null);
  const [profile,      setProfile]      = useState(null);
  const [osm,          setOsm]          = useState(null);
  const [floodRisk,    setFloodRisk]    = useState(null);
  const [elevGrid,     setElevGrid]     = useState(null);
  const [climateSolar, setClimateSolar] = useState(null);
  const [soil,         setSoil]         = useState(null);
  const [landCover,    setLandCover]    = useState(null);
  const [suitability,  setSuitability]  = useState(null);
  const [purpose,      setPurpose]      = useState("residential");
  const [indicators,   setIndicators]   = useState(null);
  const [recommendation, setRecommendation] = useState(null);
  const [toggles,      setToggles]      = useState(DEFAULT_TOGGLES);
  const [extent,       setExtent]       = useState(500);

  // ── Auth state ────────────────────────────────────────────────────────────
  const [user,           setUser]           = useState(null);
  const [session,        setSession]        = useState(null);
  const [showSignInModal,setShowSignInModal] = useState(false);
  const hasPrompted                          = useRef(false);

  useEffect(() => {
    // Restore existing session on page load (handles post-OAuth redirect)
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setUser(session?.user ?? null);
    });

    // Keep state in sync on sign-in / sign-out / token refresh
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (_event, session) => {
        setSession(session);
        setUser(session?.user ?? null);
      }
    );

    return () => subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (user) setShowSignInModal(false);
  }, [user]);

  // Per-section loading
  const [terrainLoading, setTerrainLoading] = useState(false);
  const [riskLoading,    setRiskLoading]    = useState(false);
  const [osmLoading,     setOsmLoading]     = useState(false);
  const [climateLoading, setClimateLoading] = useState(false);
  const [soilLoading,    setSoilLoading]    = useState(false);
  const [lcLoading,      setLcLoading]      = useState(false);

  // Per-section errors
  const [riskError,    setRiskError]    = useState(false);
  const [osmError,     setOsmError]     = useState(false);
  const [climateError, setClimateError] = useState(false);
  const [soilError,    setSoilError]    = useState(false);
  const [lcError,      setLcError]      = useState(false);

  const handleToggle = useCallback((key) => {
    setToggles(prev => ({ ...prev, [key]: !prev[key] }));
  }, []);

  const fetchSite = useCallback((lat, lon, radiusM) => {
    // Reset
    setElevation(null); setTerrain(null);  setProfile(null);
    setOsm(null);       setFloodRisk(null); setElevGrid(null);
    setClimateSolar(null); setSoil(null);
    setLandCover(null); setSuitability(null);
    setIndicators(null); setRecommendation(null);
    setRiskError(false); setOsmError(false);
    setClimateError(false); setSoilError(false); setLcError(false);

    setTerrainLoading(true); setRiskLoading(true);
    setOsmLoading(true);     setClimateLoading(true);
    setSoilLoading(true);    setLcLoading(true);

    // ── Wave 1: terrain ──────────────────────────────────────────
    Promise.allSettled([
      getElevation(lat, lon),
      getTerrain(lat, lon, radiusM),
      getTerrainProfile(lat, lon, Math.min(radiusM * 2, 5000)),
    ]).then(([e, t, p]) => {
      if (e.status === "fulfilled") setElevation(e.value);
      if (t.status === "fulfilled") setTerrain(t.value);
      if (p.status === "fulfilled") setProfile(p.value);
      setTerrainLoading(false);

      // Show sign-in prompt once per session after first real results
      if (!user && !hasPrompted.current) {
        hasPrompted.current = true;
        setTimeout(() => setShowSignInModal(true), 1500); // small delay feels natural
      }
    });

    // Elevation grid (contours — silent)
    settle(getElevationGrid(lat, lon, radiusM), "grid").then(setElevGrid);

    // ── Independent fetches ───────────────────────────────────────
    settle(getFloodRisk(lat, lon, radiusM, null), "flood")
      .then(d => { setFloodRisk(d); if (!d) setRiskError(true); setRiskLoading(false); });

    settle(getSoil(lat, lon), "soil")
      .then(d => { setSoil(d); if (!d) setSoilError(true); setSoilLoading(false); });

    settle(getClimateSolar(lat, lon), "climate")
      .then(d => { setClimateSolar(d); if (!d) setClimateError(true); setClimateLoading(false); });

    // Land cover + suitability together
    settle(getLandCover(lat, lon, radiusM), "landcover")
      .then(d => {
        setLandCover(d);
        if (!d) { setLcError(true); setLcLoading(false); return; }
        setLcLoading(false);
        // Fire suitability with what we have (terrain from wave 1 may not be done yet — pass nulls, will refine)
        settle(getLandUseSuitability(lat, lon, {
          dominant_class: d.dominant_class,
        }), "suitability").then(setSuitability);
      });

    // ── OSM → refine flood risk ───────────────────────────────────
    settle(getOsmContext(lat, lon, Math.max(radiusM, 500)), "osm")
      .then(d => {
        setOsm(d);
        if (!d) { setOsmError(true); setOsmLoading(false); return; }
        setOsmLoading(false);
        const wDist = d?.summary?.nearest_waterway_m ?? null;
        if (wDist !== null) {
          settle(getFloodRisk(lat, lon, radiusM, wDist), "flood-refined")
            .then(d2 => { if (d2) setFloodRisk(d2); });
        }
      });
  }, []);

  const handleGenerate = useCallback(() => {
    const nextIndicators = computeIndicators({
      terrain,
      elevation,
      floodRisk,
      soil,
      climateSolar,
      landCover,
      osm,
    });
    setIndicators(nextIndicators);
    setRecommendation(generateRecommendation(nextIndicators, purpose));
  }, [terrain, elevation, floodRisk, soil, climateSolar, landCover, osm, purpose]);

  const handlePick = useCallback((lat, lon) => {
    setPin({ lat, lon });
    fetchSite(lat, lon, extent);
  }, [extent, fetchSite]);

  const handleExtentChange = useCallback((newExtent) => {
    setExtent(newExtent);
    if (pin) fetchSite(pin.lat, pin.lon, newExtent);
  }, [pin, fetchSite]);

  /**
   * Restores the full panel from a saved analysis row returned by GET /analyses/:id.
   * Sets all data state directly — no API re-fetch needed.
   */
  const handleLoadAnalysis = useCallback((data) => {
    const site = data.sites ?? {};

    // Restore pin from site coordinates
    setPin({ lat: site.lat ?? data.lat, lon: site.lon ?? data.lon });
    setExtent(data.radius_m ?? 500);

    // Restore each data layer
    setElevation(data.elevation   ?? null);
    setTerrain(data.terrain       ?? null);
    setProfile(null);                          // profile not saved — will re-fetch if needed
    setFloodRisk(data.flood_risk  ?? null);
    setSoil(data.soil             ?? null);
    setClimateSolar(data.climate_solar ?? null);
    setLandCover(data.land_cover  ?? null);
    setOsm(data.osm_context       ?? null);
    setSuitability(null);
    setIndicators(data.indicators ?? null);
    setRecommendation(data.recommendation ?? null);
    setPurpose(data.purpose ?? "residential");
    setElevGrid(null);

    // Clear all loading + error states
    setTerrainLoading(false); setRiskLoading(false);
    setOsmLoading(false);     setClimateLoading(false);
    setSoilLoading(false);    setLcLoading(false);
    setRiskError(false);      setOsmError(false);
    setClimateError(false);   setSoilError(false);   setLcError(false);
  }, []);

  return (
    <div className="app">
      <header className="app-header">
        <div className="app-header-title">
          <h1>Site Intel</h1>
          <span className="app-header-sub">Understand land before changing it</span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          {/* Saved analyses drawer — only visible when signed in */}
          <SavedAnalyses user={user} onLoadAnalysis={handleLoadAnalysis} />
          <LayersMenu toggles={toggles} onToggle={handleToggle} user={user} />
          <AuthButton user={user} onSignOut={() => { setUser(null); setSession(null); }} />
        </div>
      </header>

      <div className="app-body">
        <div className="map-pane">
          <MapView
            pin={pin} osm={osm} terrain={terrain}
            profile={profile} elevGrid={elevGrid}
            toggles={toggles} extent={extent}
            onPick={handlePick}
          />
        </div>
        <SitePanel
          pin={pin} elevation={elevation} terrain={terrain}
          osm={osm} profile={profile} floodRisk={floodRisk}
          climateSolar={climateSolar} soil={soil}
          landCover={landCover} suitability={suitability}
          purpose={purpose} indicators={indicators} recommendation={recommendation}
          terrainLoading={terrainLoading} riskLoading={riskLoading}
          osmLoading={osmLoading} climateLoading={climateLoading}
          soilLoading={soilLoading} lcLoading={lcLoading}
          riskError={riskError} osmError={osmError}
          climateError={climateError} soilError={soilError} lcError={lcError}
          toggles={toggles} extent={extent}
          onExtentChange={handleExtentChange}
          onPick={handlePick}
          onPurposeChange={setPurpose}
          onGenerate={handleGenerate}
          onClearRecommendation={() => setRecommendation(null)}
          user={user}
        />
      </div>

      <footer className="app-footer">
        <span>Made by <a href="mailto:sakin@example.com">Sakin</a> · 2026</span>
        <span>·</span>
        <span>OSM, NASA, ESA WorldCover, MERIT, iSDAsoil</span>
      </footer>
      <FeedbackButton />
      <SignInModal open={showSignInModal} onClose={() => setShowSignInModal(false)} />
    </div>
  );
}