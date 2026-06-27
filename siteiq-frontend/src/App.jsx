import { useState, useCallback, useEffect } from "react";
import MapView from "./components/MapView";
import SitePanel from "./components/SitePanel";
import LayersMenu from "./components/LayersMenu";
import { Analytics } from "@vercel/analytics/next";
import {
  getElevation, getTerrain, getTerrainProfile,
  getOsmContext, getFloodRisk, getElevationGrid,
} from "./api";
import "./App.css";

const DEFAULT_TOGGLES = {
  osmContext:      false,
  elevationBuffer: true,
  terrainProfile:  true,
  contours:        false,
};

export default function App() {
  const [pin,       setPin]       = useState(null);
  const [elevation, setElevation] = useState(null);
  const [terrain,   setTerrain]   = useState(null);
  const [profile,   setProfile]   = useState(null);
  const [osm,       setOsm]       = useState(null);
  const [floodRisk, setFloodRisk] = useState(null);
  const [elevGrid,  setElevGrid]  = useState(null);
  const [loading,   setLoading]   = useState(false);
  const [error,     setError]     = useState(null);
  const [toggles,   setToggles]   = useState(DEFAULT_TOGGLES);
  const [extent,    setExtent]    = useState(500);   // radius in metres

  const handleToggle = useCallback((key) => {
    setToggles(prev => ({ ...prev, [key]: !prev[key] }));
  }, []);

  const fetchSite = useCallback(async (lat, lon, radiusM) => {
    setLoading(true);
    setError(null);
    setElevation(null); setTerrain(null); setProfile(null);
    setOsm(null); setFloodRisk(null); setElevGrid(null);

    const ok = (r, tag) => {
      if (r.status === "fulfilled") return r.value;
      console.warn(`${tag} failed:`, r.reason?.message ?? r.reason);
      return null;
    };

    try {
      // Wave 1 — fast, always needed
      const w1 = await Promise.allSettled([
        getElevation(lat, lon),
        getTerrain(lat, lon, radiusM),
        getTerrainProfile(lat, lon, Math.min(radiusM * 2, 5000)),
      ]);
      const elevData    = ok(w1[0], "elevation");
      const terrainData = ok(w1[1], "terrain");
      const profileData = ok(w1[2], "profile");
      setElevation(elevData);
      setTerrain(terrainData);
      setProfile(profileData);

      // Wave 2 — slower, all independent
      const w2 = await Promise.allSettled([
        getOsmContext(lat, lon),
        getFloodRisk(lat, lon, radiusM, null),
        getElevationGrid(lat, lon, radiusM),
      ]);
      const osmData   = ok(w2[0], "osm");
      const floodData = ok(w2[1], "flood");
      const gridData  = ok(w2[2], "grid");
      setOsm(osmData);
      setElevGrid(gridData);

      // Always set flood risk — refine with waterway distance if OSM succeeded
      const wDist = osmData?.summary?.nearest_waterway_m ?? null;
      if (osmData && wDist !== null) {
        const w3 = await Promise.allSettled([getFloodRisk(lat, lon, radiusM, wDist)]);
        setFloodRisk(ok(w3[0], "flood-refined") ?? floodData);
      } else {
        setFloodRisk(floodData);  // always set even if OSM failed
      }

    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  // New pin → fetch
  const handlePick = useCallback((lat, lon) => {
    setPin({ lat, lon });
    fetchSite(lat, lon, extent);
  }, [extent, fetchSite]);

  // Extent change with existing pin → re-fetch extent-sensitive endpoints
  const handleExtentChange = useCallback((newExtent) => {
    setExtent(newExtent);
    if (pin) fetchSite(pin.lat, pin.lon, newExtent);
  }, [pin, fetchSite]);

  return (
    <div className="app">
      <header className="app-header">
        <div className="app-header-title">
          <h1>Site Intelligence</h1>
          <span className="app-header-sub">Of Course We'll Have A Look :)</span>
        </div>
        <LayersMenu toggles={toggles} onToggle={handleToggle} />
      </header>

      <div className="app-body">
        <div className="map-pane">
          <MapView
            pin={pin}
            osm={osm}
            terrain={terrain}
            profile={profile}
            elevGrid={elevGrid}
            toggles={toggles}
            onPick={handlePick}
          />
        </div>
        <SitePanel
          pin={pin}
          elevation={elevation}
          terrain={terrain}
          osm={osm}
          profile={profile}
          floodRisk={floodRisk}
          loading={loading}
          error={error}
          toggles={toggles}
          extent={extent}
          onExtentChange={handleExtentChange}
        />
      </div>

      <footer className="app-footer">
        <span>Made by <a href="mailto:sakindeborah@outlook.com">Sakin</a> · 2026</span>
        <span>·</span>
        <span>Open source · Data: OSM, NASA, ESA, MERIT</span>
      </footer>
    </div>
  );
}