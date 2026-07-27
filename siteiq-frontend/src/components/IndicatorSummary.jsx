
/**
 * Compact factual summary from computed indicators.
 * No recommendations, no purpose. Pure facts at a glance.
 */

function Row({ label, value, sub }) {
  if (!value) return null;
  return (
    <div style={{
      display: "flex", justifyContent: "space-between",
      alignItems: "baseline", padding: "5px 0",
      borderBottom: "1px solid #f3f4f6", fontSize: 12,
    }}>
      <span style={{ color: "#6b7280", flexShrink: 0, marginRight: 8 }}>
        {label}
      </span>
      <div style={{ textAlign: "right" }}>
        <span style={{ fontWeight: 600, color: "#111827" }}>{value}</span>
        {sub && (
          <span style={{ fontSize: 10, color: "#9ca3af", marginLeft: 5 }}>
            {sub}
          </span>
        )}
      </div>
    </div>
  );
}

export default function IndicatorSummary({ indicators }) {
  if (!indicators) return null;

  const { terrain, flood, climate, soil, land_cover, access } = indicators;

  // Rainfall string
  const rainfallVal = climate?.annual_rainfall_mm != null
    ? `${climate.annual_rainfall_mm}mm/yr`
    : null;
  const rainfallSub = [
    climate?.rainfall_category,
    climate?.seasonality,
    climate?.wet_month_count != null
      ? `${climate.wet_month_count} wet months`
      : null,
  ].filter(Boolean).join(" · ");

  // Solar string
  const solarVal = climate?.solar_ghi_annual != null
    ? `${climate.solar_ghi_annual} kWh/m²/day`
    : null;
  const solarSub = climate?.solar_viability ?? null;

  // Temperature
  const tempVal = (climate?.temp_min_mean_c != null && climate?.temp_max_mean_c != null)
    ? `${climate.temp_min_mean_c}–${climate.temp_max_mean_c}°C`
    : null;

  // Soil string
  const soilVal = soil?.texture_class ?? null;
  const soilSub = [
    soil?.drainage_class,
    soil?.fertility_category ? `${soil.fertility_category} fertility` : null,
    soil?.ph != null ? `pH ${soil.ph} (${soil.ph_category})` : null,
  ].filter(Boolean).join(" · ");

  // Flood
  const floodVal = flood?.hand_m != null
    ? `${flood.hand_m}m above drainage`
    : null;
  const floodSub = [
    flood?.flood_risk_level ? `${flood.flood_risk_level} flood risk` : null,
    flood?.riparian_proximity ? `waterway ${flood.riparian_proximity}` : null,
  ].filter(Boolean).join(" · ");

  // Land cover
  const lcVal = land_cover?.dominant_label ?? null;
  const lcParts = [
    land_cover?.forest_pct    > 0 ? `Forest ${land_cover.forest_pct}%`    : null,
    land_cover?.cropland_pct  > 0 ? `Crops ${land_cover.cropland_pct}%`   : null,
    land_cover?.grassland_pct > 0 ? `Grass ${land_cover.grassland_pct}%`  : null,
  ].filter(Boolean);
  const lcSub = lcParts.slice(0, 3).join(" · ");

  // Access
  const accessVal = access?.nearest_road_m != null
    ? `Road ${access.nearest_road_m}m`
    : null;
  const accessSub = [
    access?.road_access_category,
    access?.grid_power != null
      ? (access.grid_power ? "grid power mapped" : "no grid power")
      : null,
    access?.amenity_count > 0
      ? `${access.amenity_count} amenities`
      : null,
  ].filter(Boolean).join(" · ");

  return (
    <div style={{
      marginTop: 14, padding: "12px 12px 6px",
      background: "#f9fafb", borderRadius: 8,
      border: "1px solid #e5e7eb",
    }}>
      <p className="section-label" style={{ marginBottom: 6 }}>
        Environmental Summary
      </p>

      <Row label="Rainfall"    value={rainfallVal} sub={rainfallSub} />
      <Row label="Temperature" value={tempVal}     sub="mean daily range" />
      <Row label="Solar"       value={solarVal}    sub={solarSub}    />
      <Row label="Soil"        value={soilVal}     sub={soilSub}     />
      <Row label="Flood"       value={floodVal}    sub={floodSub}    />
      <Row label="Land cover"  value={lcVal}       sub={lcSub}       />
      <Row label="Access"      value={accessVal}   sub={accessSub}   />
    </div>
  );
}
