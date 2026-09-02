import { useState } from "react";
import { MapContainer, TileLayer, Marker, useMapEvents, Circle, Polyline, useMap } from "react-leaflet";
import { useEffect } from "react";
import "leaflet/dist/leaflet.css";
import L from "leaflet";
import OsmOverlay, { OsmLegend } from "./OsmOverlay";
import LocationControl from "./LocationControl";
import ContourLayer from "./ContourLayer";
import LandCoverOverlay from "./LandCoverOverlay";
import { SoilImageLayer, SoilControls } from "./SoilMapOverlay";
import TemperatureOverlay from "./TemperatureOverlay";

delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
  iconUrl:       "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
  shadowUrl:     "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
});

function offsetLatLon(lat, lon, distanceM, bearingDeg) {
  const R = 6371000;
  const b = (bearingDeg * Math.PI) / 180;
  const lat1 = (lat * Math.PI) / 180;
  const lon1 = (lon * Math.PI) / 180;
  const lat2 = Math.asin(
    Math.sin(lat1) * Math.cos(distanceM / R) +
    Math.cos(lat1) * Math.sin(distanceM / R) * Math.cos(b)
  );
  const lon2 = lon1 + Math.atan2(
    Math.sin(b) * Math.sin(distanceM / R) * Math.cos(lat1),
    Math.cos(distanceM / R) - Math.sin(lat1) * Math.sin(lat2)
  );
  return [lat2 * (180 / Math.PI), lon2 * (180 / Math.PI)];
}

function ClickHandler({ onPick }) {
  useMapEvents({ click(e) { onPick(e.latlng.lat, e.latlng.lng); } });
  return null;
}

function FlyToPin({ pin }) {
  const map = useMap();
  useEffect(() => {
    if (pin) map.flyTo([pin.lat, pin.lon], 15, { duration: 1.2 });
  }, [pin, map]);
  return null;
}


function RainfallOverlay({ pin, rainfallMap, extent }) {
  if (!pin || !rainfallMap?.tile_url) return null;

  const rainfall = Number(rainfallMap?.annual_rainfall_mm ?? rainfallMap?.rainfall_mm);
  const fillColor = !Number.isFinite(rainfall)
    ? "#3b82f6"
    : rainfall < 400
      ? "#dbeafe"
      : rainfall < 800
        ? "#93c5fd"
        : rainfall < 1200
          ? "#60a5fa"
          : rainfall < 1600
            ? "#2563eb"
            : "#1e3a8a";

  return (
    <>
      <TileLayer
        key={`${pin.lat}-${pin.lon}-${extent ?? 500}-${rainfallMap.tile_url}`}
        url={rainfallMap.tile_url}
        opacity={0.55}
        attribution="CHIRPS rainfall · UCSB-CHG"
      />
      <Circle
        center={[pin.lat, pin.lon]}
        radius={rainfallMap.radius_m ?? extent ?? 500}
        pathOptions={{
          color: fillColor,
          fillColor,
          fillOpacity: 0.10,
          weight: 2,
          dashArray: "6 4",
        }}
      />
    </>
  );
}

function TemperatureLegend({ temperatureMap, temperatureData }) {
  if (!temperatureMap?.tile_url) return null;
  return (
    <div style={{ position: "absolute", right: 12, bottom: 12, zIndex: 1000, background: "rgba(255,255,255,0.94)", padding: "10px 12px", borderRadius: 8, boxShadow: "0 1px 6px rgba(0,0,0,0.2)", fontSize: 12, lineHeight: 1.35, minWidth: 175 }}>
      <div style={{ fontWeight: 700, marginBottom: 6 }}>Daytime land surface temperature (°C)</div>
      <div style={{ height: 8, borderRadius: 3, marginBottom: 4, background: "linear-gradient(to right, #313695, #74add1, #ffffbf, #f46d43, #a50026)" }} />
      <div style={{ display: "flex", justifyContent: "space-between" }}><span>{temperatureMap.min_c ?? 15}</span><span>{temperatureMap.max_c ?? 40}</span></div>
      {temperatureData && (
        <div style={{ marginTop: 7, paddingTop: 7, borderTop: "1px solid #e5e7eb" }}>
          <div><strong>Mean:</strong> {Number.isFinite(Number(temperatureData.mean_temperature_c)) ? `${Number(temperatureData.mean_temperature_c).toFixed(2)}°C` : "—"}</div>
          <div><strong>Maximum:</strong> {Number.isFinite(Number(temperatureData.maximum_temperature_c)) ? `${Number(temperatureData.maximum_temperature_c).toFixed(2)}°C` : "—"}</div>
        </div>
      )}
      <div style={{ marginTop: 5, opacity: 0.7 }}>MODIS MOD11A2.061 · 5-year mean · ~1 km</div>
    </div>
  );
}

function ElevationBufferOverlay({ pin, terrain }) {
  if (!pin || !terrain?.site_buffer) return null;
  return (
    <Circle
      center={[pin.lat, pin.lon]}
      radius={terrain.site_buffer.radius_m}
      pathOptions={{
        color: "#374151", fillColor: "#374151",
        fillOpacity: 0.07, weight: 1.5, dashArray: "5 4",
      }}
    />
  );
}

function TerrainProfileOverlay({ pin, profile }) {
  if (!pin || !profile) return null;
  const half = profile.length_m / 2;
  const N = offsetLatLon(pin.lat, pin.lon, half, 0);
  const S = offsetLatLon(pin.lat, pin.lon, half, 180);
  const E = offsetLatLon(pin.lat, pin.lon, half, 90);
  const W = offsetLatLon(pin.lat, pin.lon, half, 270);
  return (
    <>
      <Polyline positions={[N, [pin.lat, pin.lon], S]}
        pathOptions={{ color: "#6b7280", weight: 1.5, dashArray: "6 4", opacity: 0.7 }} />
      <Polyline positions={[W, [pin.lat, pin.lon], E]}
        pathOptions={{ color: "#6b7280", weight: 1.5, dashArray: "6 4", opacity: 0.7 }} />
    </>
  );
}

export default function MapView({ pin, osm, terrain, profile, elevGrid, toggles, extent, climateData, rainfallMap, temperatureData, temperatureMap, onPick }) {
  const center = pin ? [pin.lat, pin.lon] : [-1.2833, 36.8167];  // Nairobi, Kenya

  // soilLayer state lives here so it can be shared between
  // SoilImageLayer (inside MapContainer) and SoilControls (outside)
  const [soilLayer, setSoilLayer] = useState("clay");

  return (
    <div style={{ position: "relative", height: "100%", width: "100%" }}>

      {/* ── Leaflet map ─────────────────────────────────────────────── */}
      <MapContainer
        center={center}
        zoom={pin ? 14 : 10}
        style={{ height: "100%", width: "100%" }}
        zoomControl={false}
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        <ClickHandler onPick={onPick} />
        <FlyToPin pin={pin} />
        {pin && <Marker position={[pin.lat, pin.lon]} />}

        {/* Rainfall — CHIRPS 5-year average annual rainfall raster */}
        {toggles.rainfall && <RainfallOverlay pin={pin} rainfallMap={rainfallMap} extent={extent} />}
        {toggles.temperature && <TemperatureOverlay pin={pin} temperatureMap={temperatureMap} extent={extent} />}

        {/* Terrain */}
        {toggles.elevationBuffer && <ElevationBufferOverlay pin={pin} terrain={terrain} />}
        {toggles.terrainProfile  && <TerrainProfileOverlay pin={pin} profile={profile} />}
        {toggles.contours        && <ContourLayer gridData={elevGrid} />}

        {/* OSM */}
        {toggles.osmContext && <OsmOverlay osm={osm} />}

        {/* Land cover — ImageOverlay must be inside MapContainer */}
        {toggles.landCover && pin && (
          <LandCoverOverlay pin={pin} radiusM={extent ?? 500} />
        )}

      </MapContainer>

      {/* ── Overlays outside MapContainer (plain HTML, no Leaflet context) ── */}

      {/* GPS locate button */}
      <LocationControl onLocate={onPick} />

      {/* OSM legend */}
      {osm && toggles.osmContext && <OsmLegend />}

      {rainfallMap?.tile_url && pin && toggles.rainfall && (
        <div style={{
          position: "absolute", right: 12, bottom: toggles.temperature ? 150 : 12, zIndex: 1000,
          background: "rgba(255,255,255,0.94)", padding: "10px 12px",
          borderRadius: 8, boxShadow: "0 1px 6px rgba(0,0,0,0.2)",
          fontSize: 12, lineHeight: 1.35, minWidth: 155,
        }}>
          <div style={{ fontWeight: 700, marginBottom: 6 }}>Annual rainfall (mm)</div>
          <div style={{ display: "flex", height: 8, borderRadius: 3, overflow: "hidden", marginBottom: 4 }}>
            {["#dbeafe", "#93c5fd", "#60a5fa", "#2563eb", "#1e3a8a"].map((c, i) => (
              <span key={i} style={{ flex: 1, background: c }} />
            ))}
          </div>
          <div style={{ display: "flex", justifyContent: "space-between" }}>
            <span>0</span><span>400</span><span>800</span><span>1200</span><span>1600+</span>
          </div>
          <div style={{ marginTop: 5, opacity: 0.7 }}>CHIRPS · 5-year mean</div>
        </div>
      )}

      {temperatureMap?.tile_url && pin && toggles.temperature && (
        <TemperatureLegend temperatureMap={temperatureMap} temperatureData={temperatureData} />
      )}
    </div>
  );
}