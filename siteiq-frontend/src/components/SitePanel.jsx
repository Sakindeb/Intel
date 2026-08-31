import { useState } from "react";
import { SignInCTA } from "./SignInPrompt";
import Section from "./Section";
import ElevationProfileChart from "./ElevationProfileChart";
import FloodRiskCard from "./FloodRiskCard";
import SoilCard from "./SoilCard";
import ClimateChart from "./ClimateChart";
import SolarCard from "./SolarCard";
import LandCoverCard from "./LandCoverCard";
import ExtentSelector from "./ExtentSelector";
import ExportButton from "./ExportButton";
import LocationSearch from "./LocationSearch";
import IndicatorSummary from "./IndicatorSummary";
import PurposeSelector from "./PurposeSelector";
import SuitabilityPanel from "./SuitabilityPanel";

function OsmGroup({ title, items, renderItem }) {
  const [open, setOpen] = useState(false);
  if (!items?.length) return null;
  return (
    <div style={{ borderTop: "1px solid #f3f4f6" }}>
      <div onClick={() => setOpen(v => !v)} style={{
        display: "flex", justifyContent: "space-between", alignItems: "center",
        padding: "8px 0", cursor: "pointer", fontSize: 12,
      }}>
        <span style={{ fontWeight: 500, color: "#374151" }}>{title}</span>
        <span style={{ color: "#9ca3af" }}>
          {items.length}&nbsp;
          <svg style={{ verticalAlign: "middle" }} width="10" height="10" viewBox="0 0 10 10" fill="none">
            <path d={open ? "M2 7L5 3L8 7" : "M2 3L5 7L8 3"}
              stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </span>
      </div>
      {open && (
        <div style={{ paddingBottom: 8, paddingLeft: 4 }}>
          {items.slice(0, 6).map(renderItem)}
        </div>
      )}
    </div>
  );
}

function CategoryGroup({ icon, title, description, children }) {
  const [open, setOpen] = useState(true);
  return (
    <div style={{
      borderTop: "1px solid #e5e7eb",
      marginTop: 16,
    }}>
      <div onClick={() => setOpen(v => !v)} style={{
        display: "flex", alignItems: "flex-start", gap: 12,
        padding: "12px 0", cursor: "pointer",
        userSelect: "none",
      }}>
        <span style={{ fontSize: 18, marginTop: 2 }}>{icon}</span>
        <div style={{ minWidth: 0, flex: 1 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: "#111827" }}>
            {title}
          </div>
          {description && (
            <div style={{ fontSize: 11, color: "#6b7280", marginTop: 2, lineHeight: 1.4 }}>
              {description}
            </div>
          )}
        </div>
        <svg width="12" height="12" viewBox="0 0 12 12" fill="none" style={{
          flexShrink: 0, marginTop: 3, color: "#9ca3af",
          transform: open ? "rotate(180deg)" : "rotate(0deg)",
          transition: "transform 0.2s"
        }}>
          <path d="M2 4L6 8L10 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
      </div>
      {open && (
        <div style={{ marginLeft: 30, paddingBottom: 8 }}>
          {children}
        </div>
      )}
    </div>
  );
}

function Item({ primary, secondary }) {
  return (
    <p style={{ margin: "3px 0", fontSize: 12 }}>
      <span style={{ fontWeight: 500, color: "#111827" }}>{primary}</span>
      {secondary && <span style={{ color: "#9ca3af" }}> · {secondary}</span>}
    </p>
  );
}

// Summary one-liners
const summaries = {
  terrain:   (elev, terrain) => [elev?.elevation_m != null ? `${elev.elevation_m}m` : null, terrain?.point?.slope_class].filter(Boolean).join(" · ") || null,
  risk:      (fr)  => fr?.risk ? `${(fr.risk.level ?? "").toUpperCase()} · ${fr.risk.label ?? ""}` : null,
  soil:      (s)   => s?.texture ? s.texture.class_name : null,
  climate:   (c)   => c?.summary ? `${c.summary.annual_rainfall_mm}mm/yr · ${c.summary.wet_months?.length ?? 0} wet months` : null,
  solar:     (c)   => c?.summary ? `${(c.summary.solar_viability ?? "").toUpperCase()} · ${c.summary.annual_solar_ghi} kWh/m²/day` : null,
  lc:        (lc)  => lc?.dominant_label ? `Dominant: ${lc.dominant_label}` : null,
  osm:       (o)   => o?.summary ? `Road ${o.summary.nearest_road_m ?? "—"}m · ${o.summary.amenity_count ?? 0} amenities` : null,
};

export default function SitePanel({
  pin, elevation, terrain, osm, profile, floodRisk,
  climateSolar, soil, landCover, suitability,
  purpose, indicators, recommendation,
  terrainLoading, riskLoading, osmLoading, climateLoading, soilLoading, lcLoading,
  riskError, osmError, climateError, soilError, lcError,
  toggles, extent, onExtentChange, onPick, onPurposeChange, onGenerate, onClearRecommendation, user, onRequestSignIn,
}) {
  const [sheetOpen, setSheetOpen] = useState(false);
  const [activeView, setActiveView] = useState("facts");

  const wrap = (children) => (
    <div className={`side-pane${sheetOpen ? " open" : ""}`}>
      <div className="sheet-handle" onClick={() => setSheetOpen(v => !v)} />
      {children}
    </div>
  );

  if (!pin) return wrap(
    <div className="panel">
      <LocationSearch onSelect={onPick} variant="panel" />
      <p style={{ fontSize: 13, color: "#6b7280", margin: "12px 0 16px", lineHeight: 1.5 }}>
        Set your analysis radius, then click the map to analyze a site.
      </p>
      <ExtentSelector value={extent} onChange={onExtentChange} />
      {!user && <SignInCTA />}
      <p style={{ fontSize: 11, color: "#9ca3af", marginTop: 8 }}>
        You can also tap "Use my location" on the map.
      </p>
    </div>
  );

  const nearestWater = osm?.summary?.nearest_waterway_m;
  const floodFlag    = nearestWater != null && nearestWater < 300;

  const fullDataContent = (
    <div>
      <div style={{ marginBottom: 8, paddingBottom: 4 }}>
        <h3 style={{ fontSize: 12, fontWeight: 700, color: "#6b7280", textTransform: "uppercase", letterSpacing: "0.5px", margin: 0 }}>
          🗺️ SITE CONTEXT
        </h3>
      </div>

      {/* ⛰️ PHYSICAL ENVIRONMENT */}
      <CategoryGroup
        icon="⛰️"
        title="Physical Environment"
        description="Terrain, elevation, slope and soils"
      >
        <Section title="Terrain" summary={summaries.terrain(elevation, terrain)}
          loading={terrainLoading} loadingText="Fetching elevation and slope…" defaultOpen={true}>
          <div className="stat-grid">
            <div className="stat">
              <span className="stat-label">Elevation</span>
              <span className="stat-value">{elevation?.elevation_m ?? "—"} m</span>
            </div>
            <div className="stat">
              <span className="stat-label">Slope</span>
              <span className="stat-value">{terrain?.point?.slope_deg?.toFixed(1) ?? "—"}°</span>
            </div>
            <div className="stat">
              <span className="stat-label">Aspect</span>
              <span className="stat-value">{terrain?.point?.aspect_deg?.toFixed(0) ?? "—"}°</span>
            </div>
          </div>
          {terrain?.point?.slope_class && <p className="callout">{terrain.point.slope_class}</p>}
          {terrain?.site_buffer && (
            <div className="site-buffer">
              <h3>Within {terrain.site_buffer.radius_m}m</h3>
              <p>Elevation {terrain.site_buffer.elevation_min_m?.toFixed(0)}–{terrain.site_buffer.elevation_max_m?.toFixed(0)} m</p>
              <p>Avg slope {terrain.site_buffer.slope_mean_deg?.toFixed(1)}°, max {terrain.site_buffer.slope_max_deg?.toFixed(1)}°</p>
            </div>
          )}
          {profile && toggles.terrainProfile && <ElevationProfileChart profile={profile} />}
        </Section>

        <Section title="Soil Properties" summary={summaries.soil(soil)}
          loading={soilLoading} loadingText="Querying iSDAsoil…" error={soilError}>
          <SoilCard soil={soil} />
        </Section>
      </CategoryGroup>

      {/* 🌦️ CLIMATE & EXTREMES */}
      <CategoryGroup
        icon="🌦️"
        title="Climate & Extremes"
        description="Rainfall, temperature and climate anomalies"
      >
        <Section title="Rainfall & Temperature" summary={summaries.climate(climateSolar)}
          loading={climateLoading} loadingText="Fetching NASA POWER data…" error={climateError}>
          <ClimateChart climate={climateSolar} />
        </Section>

        <Section title="Solar Potential" summary={summaries.solar(climateSolar)}
          loading={climateLoading} loadingText="Fetching NASA POWER data…" error={climateError}>
          <SolarCard climate={climateSolar} />
        </Section>
      </CategoryGroup>

      {/* 💧 WATER & FLOODING */}
      <CategoryGroup
        icon="💧"
        title="Water & Flooding"
        description="Waterways, flood risk and water stress"
      >
        <Section title="Flood Risk" summary={summaries.risk(floodRisk)}
          loading={riskLoading} loadingText="Computing HAND flood model…" error={riskError}>
          <FloodRiskCard floodRisk={floodRisk} />
        </Section>

        <Section title="Waterways" summary={osm?.summary ? `${osm.summary.nearest_waterway_m ?? "—"}m away` : null}
          loading={osmLoading} loadingText="Querying OpenStreetMap…" error={osmError}>
          {osm && (
            <>
              {floodFlag && (
                <p style={{ margin: "0 0 10px", padding: "7px 10px", background: "#fef2f2",
                  borderLeft: "3px solid #ef4444", borderRadius: "0 6px 6px 0", fontSize: 12, color: "#b91c1c" }}>
                  Waterway within 300m — elevated flood risk.
                </p>
              )}
              <p className="section-label" style={{ marginBottom: 0 }}>
                Within {(osm.search_radius_m / 1000).toFixed(1)}km
              </p>
              <OsmGroup title="Waterways" items={osm.waterways}
                renderItem={(w, i) => <Item key={i} primary={w.name} secondary={`${w.type} · ${w.distance_m}m`} />} />
            </>
          )}
        </Section>
      </CategoryGroup>

      {/* 🌿 LAND & ECOSYSTEM */}
      <CategoryGroup
        icon="🌿"
        title="Land & Ecosystem"
        description="Vegetation, land cover and green infrastructure"
      >
        <Section title="Land Cover" summary={summaries.lc(landCover)}
          loading={lcLoading} loadingText="Fetching ESA WorldCover…" error={lcError}>
          <LandCoverCard landCover={landCover} suitability={suitability} />
        </Section>

        <Section title="Vegetation & Land Use" summary={osm?.summary ? `${osm.summary.amenity_count ?? 0} features` : null}
          loading={osmLoading} loadingText="Querying OpenStreetMap…" error={osmError}>
          {osm && (
            <>
              <p className="section-label" style={{ marginBottom: 0 }}>
                Within {(osm.search_radius_m / 1000).toFixed(1)}km
              </p>
              <OsmGroup title="Vegetation / Land use" items={osm.vegetation ?? []}
                renderItem={(v, i) => <Item key={i} primary={v.name || v.type} secondary={`${v.raw_tag} · ${v.distance_m}m`} />} />
            </>
          )}
        </Section>
      </CategoryGroup>

      {/* 🏙️ PEOPLE & INFRASTRUCTURE */}
      <CategoryGroup
        icon="🏙️"
        title="People & Infrastructure"
        description="Population, buildings, roads and critical services"
      >
        <Section title="Roads" summary={osm?.summary ? `Nearest: ${osm.summary.nearest_road_m ?? "—"}m` : null}
          loading={osmLoading} loadingText="Querying OpenStreetMap…" error={osmError}>
          {osm && (
            <>
              <p className="section-label" style={{ marginBottom: 0 }}>
                Within {(osm.search_radius_m / 1000).toFixed(1)}km
              </p>
              <OsmGroup title="Roads" items={osm.roads}
                renderItem={(r, i) => <Item key={i} primary={r.name} secondary={`${r.type} · ${r.distance_m}m`} />} />
            </>
          )}
        </Section>

        <Section title="Buildings" summary={osm?.buildings?.length ? `${osm.buildings.length} nearby` : null}
          loading={osmLoading} loadingText="Querying OpenStreetMap…" error={osmError}>
          {osm && (
            <OsmGroup title="Buildings" items={osm.buildings ?? []}
              renderItem={(b, i) => <Item key={i} primary={b.name || b.type} secondary={`${b.distance_m}m`} />} />
          )}
        </Section>

        <Section title="Amenities & Services" summary={osm?.summary ? `${osm.summary.amenity_count ?? 0} nearby` : null}
          loading={osmLoading} loadingText="Querying OpenStreetMap…" error={osmError}>
          {osm && (
            <>
              <p className="section-label" style={{ marginBottom: 0 }}>
                Within {(osm.search_radius_m / 1000).toFixed(1)}km
              </p>
              <OsmGroup title="Amenities" items={osm.amenities}
                renderItem={(a, i) => <Item key={i} primary={a.name} secondary={`${a.amenity} · ${a.distance_m}m`} />} />
            </>
          )}
        </Section>

        <Section title="Power Infrastructure" summary={osm?.power?.length ? `${osm.power.length} facilities` : null}
          loading={osmLoading} loadingText="Querying OpenStreetMap…" error={osmError}>
          {osm && (
            <OsmGroup title="Power infrastructure" items={osm.power ?? []}
              renderItem={(p, i) => <Item key={i} primary={p.type}
                secondary={p.voltage ? `${p.voltage}V · ${p.distance_m}m` : `${p.distance_m}m`} />} />
          )}
        </Section>
      </CategoryGroup>
    </div>
  );

  return wrap(
    <>
      {!sheetOpen && (
        <span className="sheet-peek-label">
          {elevation?.elevation_m != null
            ? `${elevation.elevation_m}m · ${terrain?.point?.slope_class ?? ""}`
            : terrainLoading ? "Analyzing…" : "Tap to view results"}
        </span>
      )}

      <div className="panel">
        {activeView === "assessment" ? (
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <button
              onClick={() => setActiveView("facts")}
              style={{
                alignSelf: "flex-start", padding: "7px 10px",
                background: "#f3f4f6", color: "#374151",
                border: "1px solid #e5e7eb", borderRadius: 7,
                fontSize: 12, fontWeight: 600, cursor: "pointer",
              }}
            >
              View raw data
            </button>

            <div style={{ padding: "10px 12px", background: "#f9fafb", border: "1px solid #e5e7eb", borderRadius: 8 }}>
              <p className="section-label" style={{ marginBottom: 4 }}>Suitability assessment</p>
              <p style={{ margin: "0 0 8px", fontSize: 11, color: "#6b7280", lineHeight: 1.5 }}>
                Choose the intended domain to generate a quick suitability assessment from the current site indicators.
              </p>
              <PurposeSelector value={purpose} onChange={onPurposeChange} />
              <button
                onClick={() => { onGenerate(); setActiveView("assessment"); }}
                style={{
                  width: "100%", marginTop: 8, padding: "9px 10px",
                  background: "#1f2937", color: "#fff", border: "none",
                  borderRadius: 7, fontSize: 12, fontWeight: 600, cursor: "pointer",
                }}
              >
                {recommendation ? "Generate again" : "Generate assessment"}
              </button>
            </div>

            {recommendation && (
              <>
                <SuitabilityPanel
                  recommendation={recommendation}
                  indicators={indicators}
                />
                <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 10 }}>
                  <ExportButton
                    pin={pin}
                    radiusM={extent}
                    floodRisk={floodRisk}
                    soil={soil}
                    climateSolar={climateSolar}
                    user={user}
                    recommendation={recommendation}
                    indicators={indicators}
                    purpose={purpose}
                    elevation={elevation}
                    terrain={terrain}
                    landCover={landCover}
                    osm={osm}
                    onRequestSignIn={onRequestSignIn}
                  />
                </div>
              </>
            )}
          </div>
        ) : (
          <>
            <h2>{elevation?.place_name || `${pin.lat.toFixed(4)}, ${pin.lon.toFixed(4)}`}</h2>
            <p className="coords">{pin.lat.toFixed(5)}, {pin.lon.toFixed(5)}</p>

            <LocationSearch onSelect={onPick} variant="panel" />
            <ExtentSelector value={extent} onChange={onExtentChange} />

            <div style={{ marginTop: 8, paddingBottom: 4 }}>
              <h3 style={{ fontSize: 12, fontWeight: 700, color: "#6b7280", textTransform: "uppercase", letterSpacing: "0.5px", margin: 0 }}>
                🗺️ SITE CONTEXT
              </h3>
            </div>

            {/*  PHYSICAL ENVIRONMENT */}
            <CategoryGroup
              
              title="Physical Environment"
              description="Terrain, elevation, slope and soils"
            >
              <Section title="Terrain" summary={summaries.terrain(elevation, terrain)}
                loading={terrainLoading} loadingText="Fetching elevation and slope…" defaultOpen={true}>
                <div className="stat-grid">
                  <div className="stat">
                    <span className="stat-label">Elevation</span>
                    <span className="stat-value">{elevation?.elevation_m ?? "—"} m</span>
                  </div>
                  <div className="stat">
                    <span className="stat-label">Slope</span>
                    <span className="stat-value">{terrain?.point?.slope_deg?.toFixed(1) ?? "—"}°</span>
                  </div>
                  <div className="stat">
                    <span className="stat-label">Aspect</span>
                    <span className="stat-value">{terrain?.point?.aspect_deg?.toFixed(0) ?? "—"}°</span>
                  </div>
                </div>
                {terrain?.point?.slope_class && <p className="callout">{terrain.point.slope_class}</p>}
                {terrain?.site_buffer && (
                  <div className="site-buffer">
                    <h3>Within {terrain.site_buffer.radius_m}m</h3>
                    <p>Elevation {terrain.site_buffer.elevation_min_m?.toFixed(0)}–{terrain.site_buffer.elevation_max_m?.toFixed(0)} m</p>
                    <p>Avg slope {terrain.site_buffer.slope_mean_deg?.toFixed(1)}°, max {terrain.site_buffer.slope_max_deg?.toFixed(1)}°</p>
                  </div>
                )}
                {profile && toggles.terrainProfile && <ElevationProfileChart profile={profile} />}
              </Section>

              <Section title="Soil Properties" summary={summaries.soil(soil)}
                loading={soilLoading} loadingText="Querying iSDAsoil…" error={soilError}>
                <SoilCard soil={soil} />
              </Section>
            </CategoryGroup>

            {/* 🌦️ CLIMATE & EXTREMES */}
            <CategoryGroup
              
              title="Climate & Extremes"
              description="Rainfall, temperature and climate anomalies"
            >
              <Section title="Rainfall & Temperature" summary={summaries.climate(climateSolar)}
                loading={climateLoading} loadingText="Fetching NASA POWER data…" error={climateError}>
                <ClimateChart climate={climateSolar} />
              </Section>

              <Section title="Solar Potential" summary={summaries.solar(climateSolar)}
                loading={climateLoading} loadingText="Fetching NASA POWER data…" error={climateError}>
                <SolarCard climate={climateSolar} />
              </Section>
            </CategoryGroup>

            {/* 💧 WATER & FLOODING */}
            <CategoryGroup
              
              title="Water & Flooding"
              description="Waterways, flood risk and water stress"
            >
              <Section title="Flood Risk" summary={summaries.risk(floodRisk)}
                loading={riskLoading} loadingText="Computing HAND flood model…" error={riskError}>
                <FloodRiskCard floodRisk={floodRisk} />
              </Section>

              <Section title="Waterways" summary={osm?.summary ? `${osm.summary.nearest_waterway_m ?? "—"}m away` : null}
                loading={osmLoading} loadingText="Querying OpenStreetMap…" error={osmError}>
                {osm && (
                  <>
                    {floodFlag && (
                      <p style={{ margin: "0 0 10px", padding: "7px 10px", background: "#fef2f2",
                        borderLeft: "3px solid #ef4444", borderRadius: "0 6px 6px 0", fontSize: 12, color: "#b91c1c" }}>
                        Waterway within 300m — elevated flood risk.
                      </p>
                    )}
                    <p className="section-label" style={{ marginBottom: 0 }}>
                      Within {(osm.search_radius_m / 1000).toFixed(1)}km
                    </p>
                    <OsmGroup title="Waterways" items={osm.waterways}
                      renderItem={(w, i) => <Item key={i} primary={w.name} secondary={`${w.type} · ${w.distance_m}m`} />} />
                  </>
                )}
              </Section>
            </CategoryGroup>

            {/* 🌿 LAND & ECOSYSTEM */}
            <CategoryGroup
             
              title="Land & Ecosystem"
              description="Vegetation, land cover and green infrastructure"
            >
              <Section title="Land Cover" summary={summaries.lc(landCover)}
                loading={lcLoading} loadingText="Fetching ESA WorldCover…" error={lcError}>
                <LandCoverCard landCover={landCover} suitability={suitability} />
              </Section>

              <Section title="Vegetation & Land Use" summary={osm?.summary ? `${osm.summary.amenity_count ?? 0} features` : null}
                loading={osmLoading} loadingText="Querying OpenStreetMap…" error={osmError}>
                {osm && (
                  <>
                    <p className="section-label" style={{ marginBottom: 0 }}>
                      Within {(osm.search_radius_m / 1000).toFixed(1)}km
                    </p>
                    <OsmGroup title="Vegetation / Land use" items={osm.vegetation ?? []}
                      renderItem={(v, i) => <Item key={i} primary={v.name || v.type} secondary={`${v.raw_tag} · ${v.distance_m}m`} />} />
                  </>
                )}
              </Section>
            </CategoryGroup>

            {/* 🏙️ PEOPLE & INFRASTRUCTURE */}
            <CategoryGroup
              title="People & Infrastructure"
              description="Population, buildings, roads and critical services"
            >
              <Section title="Roads" summary={osm?.summary ? `Nearest: ${osm.summary.nearest_road_m ?? "—"}m` : null}
                loading={osmLoading} loadingText="Querying OpenStreetMap…" error={osmError}>
                {osm && (
                  <>
                    <p className="section-label" style={{ marginBottom: 0 }}>
                      Within {(osm.search_radius_m / 1000).toFixed(1)}km
                    </p>
                    <OsmGroup title="Roads" items={osm.roads}
                      renderItem={(r, i) => <Item key={i} primary={r.name} secondary={`${r.type} · ${r.distance_m}m`} />} />
                  </>
                )}
              </Section>

              <Section title="Buildings" summary={osm?.buildings?.length ? `${osm.buildings.length} nearby` : null}
                loading={osmLoading} loadingText="Querying OpenStreetMap…" error={osmError}>
                {osm && (
                  <OsmGroup title="Buildings" items={osm.buildings ?? []}
                    renderItem={(b, i) => <Item key={i} primary={b.name || b.type} secondary={`${b.distance_m}m`} />} />
                )}
              </Section>

              <Section title="Amenities & Services" summary={osm?.summary ? `${osm.summary.amenity_count ?? 0} nearby` : null}
                loading={osmLoading} loadingText="Querying OpenStreetMap…" error={osmError}>
                {osm && (
                  <>
                    <p className="section-label" style={{ marginBottom: 0 }}>
                      Within {(osm.search_radius_m / 1000).toFixed(1)}km
                    </p>
                    <OsmGroup title="Amenities" items={osm.amenities}
                      renderItem={(a, i) => <Item key={i} primary={a.name} secondary={`${a.amenity} · ${a.distance_m}m`} />} />
                  </>
                )}
              </Section>

              <Section title="Power Infrastructure" summary={osm?.power?.length ? `${osm.power.length} facilities` : null}
                loading={osmLoading} loadingText="Querying OpenStreetMap…" error={osmError}>
                {osm && (
                  <OsmGroup title="Power infrastructure" items={osm.power ?? []}
                    renderItem={(p, i) => <Item key={i} primary={p.type}
                      secondary={p.voltage ? `${p.voltage}V · ${p.distance_m}m` : `${p.distance_m}m`} />} />
                )}
              </Section>
            </CategoryGroup>

            <button
              onClick={() => setActiveView("assessment")}
              style={{
                width: "100%", padding: "16px 10px",
                background: "#1f2937", color: "#fff", border: "none",
                borderRadius: 7, fontSize: 12, fontWeight: 600, cursor: "pointer",
              }}
            >
              {recommendation ? "View assessment" : "Generate assessment"}
            </button>

            <div style={{ marginTop: 10 }}>
              <ExportButton
                pin={pin}
                radiusM={extent}
                floodRisk={floodRisk}
                soil={soil}
                climateSolar={climateSolar}
                user={user}
                recommendation={recommendation}
                indicators={indicators}
                purpose={purpose}
                elevation={elevation}
                terrain={terrain}
                landCover={landCover}
                osm={osm}
                onRequestSignIn={onRequestSignIn}
              />
            </div>

            <p style={{ margin: "16px 0 0", fontSize: 10, color: "#9ca3af", lineHeight: 1.5,
              borderTop: "1px solid #f3f4f6", paddingTop: 10 }}>
              Indicative data only. Not a substitute for a licensed site survey.
              Sources: SRTM, OSM, MERIT, iSDAsoil, ESA WorldCover, NASA POWER.
            </p>
          </>
        )}
      </div>
    </>
  );
}