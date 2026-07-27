/**
 * Layer 1 — Indicators
 *
 * Pure factual functions. No recommendations, no purpose awareness.
 * Each function takes raw API data and returns structured facts only.
 * These become the ML feature vector when saved.
 */

// ── Terrain ────────────────────────────────────────────────────────────────

export function terrainIndicators(terrain, elevation) {
  const elevM    = elevation?.elevation_m ?? null;
  const slopeDeg = terrain?.point?.slope_deg ?? null;
  const aspectDeg= terrain?.point?.aspect_deg ?? null;
  const elevMin  = terrain?.site_buffer?.elevation_min_m ?? null;
  const elevMax  = terrain?.site_buffer?.elevation_max_m ?? null;
  const slopeMean= terrain?.site_buffer?.slope_mean_deg ?? null;
  const slopeMax = terrain?.site_buffer?.slope_max_deg ?? null;

  const slopeCategory =
    slopeDeg == null  ? null
    : slopeDeg < 2    ? "flat"
    : slopeDeg < 8    ? "gentle"
    : slopeDeg < 16   ? "moderate"
    : slopeDeg < 30   ? "steep"
    : "very steep";

  const aspectDir =
    aspectDeg == null            ? null
    : aspectDeg < 22.5           ? "N"
    : aspectDeg < 67.5           ? "NE"
    : aspectDeg < 112.5          ? "E"
    : aspectDeg < 157.5          ? "SE"
    : aspectDeg < 202.5          ? "S"
    : aspectDeg < 247.5          ? "SW"
    : aspectDeg < 292.5          ? "W"
    : aspectDeg < 337.5          ? "NW"
    : "N";

  return {
    elevation_m:    elevM,
    slope_deg:      slopeDeg != null ? +slopeDeg.toFixed(1) : null,
    slope_category: slopeCategory,
    aspect_deg:     aspectDeg != null ? +aspectDeg.toFixed(0) : null,
    aspect_direction: aspectDir,
    elevation_range_m: (elevMin != null && elevMax != null)
      ? +(elevMax - elevMin).toFixed(0) : null,
    slope_mean_deg: slopeMean != null ? +slopeMean.toFixed(1) : null,
    slope_max_deg:  slopeMax  != null ? +slopeMax.toFixed(1)  : null,
  };
}

// ── Flood ──────────────────────────────────────────────────────────────────

export function floodIndicators(floodRisk) {
  const handM      = floodRisk?.inputs?.hand_m ?? null;
  const slopeDeg   = floodRisk?.inputs?.slope_deg ?? null;
  const waterwayM  = floodRisk?.inputs?.waterway_dist_m ?? null;
  const bufferMinM = floodRisk?.hand?.buffer_min_m ?? null;
  const riskLevel  = floodRisk?.risk?.level ?? null;

  const handCategory =
    handM == null  ? null
    : handM < 5    ? "very low"
    : handM < 10   ? "low"
    : handM < 20   ? "moderate"
    : "high";

  return {
    hand_m:             handM != null ? +handM.toFixed(1) : null,
    hand_category:      handCategory,
    hand_buffer_min_m:  bufferMinM != null ? +bufferMinM.toFixed(1) : null,
    flood_risk_level:   riskLevel,
    waterway_dist_m:    waterwayM,
    riparian_proximity: waterwayM != null
      ? (waterwayM < 100 ? "immediate"
         : waterwayM < 300 ? "close"
         : waterwayM < 1000 ? "moderate"
         : "distant")
      : null,
  };
}

// ── Climate ────────────────────────────────────────────────────────────────

export function climateIndicators(climateSolar) {
  const monthly    = climateSolar?.monthly ?? [];
  const summary    = climateSolar?.summary ?? {};
  const annualMm   = summary.annual_rainfall_mm ?? null;
  const wetMonths  = summary.wet_months ?? [];

  // Determine seasonality pattern from monthly data
  let seasonality = null;
  if (monthly.length === 12) {
    const rainByMonth = monthly.map(m => m.rainfall_mm);
    const mean = annualMm / 12;
    const peaks = rainByMonth.filter((v, i) => {
      const prev = rainByMonth[(i + 11) % 12];
      const next = rainByMonth[(i + 1)  % 12];
      return v > mean * 1.3 && v > prev && v > next;
    });
    seasonality = peaks.length >= 2 ? "bimodal"
                : peaks.length === 1 ? "unimodal"
                : "uniform";
  }

  const annualCategory =
    annualMm == null  ? null
    : annualMm < 250  ? "arid"
    : annualMm < 500  ? "semi-arid"
    : annualMm < 800  ? "sub-humid"
    : annualMm < 1200 ? "humid"
    : "very humid";

  // Temperature stats from monthly data
  const tMaxValues = monthly.map(m => m.temp_max_c).filter(Boolean);
  const tMinValues = monthly.map(m => m.temp_min_c).filter(Boolean);

  return {
    annual_rainfall_mm:   annualMm,
    rainfall_category:    annualCategory,
    wet_months:           wetMonths,
    dry_months:           monthly.map(m => m.month)
                            .filter(m => !wetMonths.includes(m)),
    wet_month_count:      wetMonths.length,
    seasonality,
    temp_max_mean_c:      tMaxValues.length
      ? +(tMaxValues.reduce((a,b)=>a+b,0)/tMaxValues.length).toFixed(1) : null,
    temp_min_mean_c:      tMinValues.length
      ? +(tMinValues.reduce((a,b)=>a+b,0)/tMinValues.length).toFixed(1) : null,
    solar_ghi_annual:     summary.annual_solar_ghi ?? null,
    solar_viability:      summary.solar_viability ?? null,
    period:               climateSolar?.period ?? null,
  };
}

// ── Soil ───────────────────────────────────────────────────────────────────

export function soilIndicators(soil) {
  const props   = soil?.properties ?? {};
  const texture = soil?.texture    ?? {};

  const drainageClass =
    props.clay_pct == null     ? null
    : props.clay_pct > 60      ? "very slow"
    : props.clay_pct > 35      ? "slow"
    : props.clay_pct > 18      ? "moderate"
    : props.sand_pct > 70      ? "rapid"
    : "well drained";

  const phCategory =
    props.ph == null   ? null
    : props.ph < 4.5   ? "extremely acidic"
    : props.ph < 5.5   ? "strongly acidic"
    : props.ph < 6.5   ? "moderately acidic"
    : props.ph < 7.5   ? "neutral"
    : props.ph < 8.5   ? "mildly alkaline"
    : "strongly alkaline";

  const fertilityCategory =
    props.oc_pct == null  ? null
    : props.oc_pct > 3    ? "high"
    : props.oc_pct > 1.5  ? "moderate"
    : props.oc_pct > 0.5  ? "low"
    : "very low";

  return {
    clay_pct:          props.clay_pct ?? null,
    sand_pct:          props.sand_pct ?? null,
    silt_pct:          props.silt_pct ?? null,
    ph:                props.ph       ?? null,
    ph_category:       phCategory,
    organic_carbon_pct: props.oc_pct  ?? null,
    fertility_category: fertilityCategory,
    texture_class:     texture.class_name ?? null,
    drainage_class:    drainageClass,
    expansion_risk:    props.clay_pct != null
      ? (props.clay_pct > 50 ? "high"
         : props.clay_pct > 35 ? "moderate" : "low")
      : null,
  };
}

// ── Land cover ─────────────────────────────────────────────────────────────

export function landCoverIndicators(landCover) {
  const classes  = landCover?.classes ?? [];
  const domClass = landCover?.dominant_class ?? null;
  const domLabel = landCover?.dominant_label ?? null;

  const builtPct     = classes.find(c => c.class_id === 50)?.percent ?? 0;
  const forestPct    = classes.find(c => c.class_id === 10)?.percent ?? 0;
  const croplandPct  = classes.find(c => c.class_id === 40)?.percent ?? 0;
  const grasslandPct = classes.find(c => c.class_id === 30)?.percent ?? 0;
  const waterPct     = (classes.find(c => c.class_id === 80)?.percent ?? 0)
                     + (classes.find(c => c.class_id === 90)?.percent ?? 0);

  return {
    dominant_class:    domClass,
    dominant_label:    domLabel,
    built_up_pct:      +builtPct.toFixed(1),
    forest_pct:        +forestPct.toFixed(1),
    cropland_pct:      +croplandPct.toFixed(1),
    grassland_pct:     +grasslandPct.toFixed(1),
    water_wetland_pct: +waterPct.toFixed(1),
    naturalness:       forestPct + grasslandPct > 60 ? "high"
                       : builtPct > 30 ? "low" : "moderate",
    source:            landCover?.source ?? "ESA WorldCover v200",
  };
}

// ── OSM / access ───────────────────────────────────────────────────────────

export function accessIndicators(osm) {
  const s = osm?.summary ?? {};

  const roadCategory =
    s.nearest_road_m == null   ? null
    : s.nearest_road_m < 100   ? "immediate"
    : s.nearest_road_m < 500   ? "close"
    : s.nearest_road_m < 1500  ? "moderate"
    : "remote";

  const waterCategory =
    s.nearest_waterway_m == null  ? null
    : s.nearest_waterway_m < 100  ? "immediate"
    : s.nearest_waterway_m < 300  ? "close"
    : s.nearest_waterway_m < 1000 ? "moderate"
    : "distant";

  return {
    nearest_road_m:       s.nearest_road_m      ?? null,
    road_access_category: roadCategory,
    nearest_waterway_m:   s.nearest_waterway_m  ?? null,
    waterway_proximity:   waterCategory,
    grid_power:           s.grid_connected       ?? null,
    amenity_count:        s.amenity_count        ?? 0,
  };
}

// ── Master function ────────────────────────────────────────────────────────

export function computeIndicators({ terrain, elevation, floodRisk, soil, climateSolar, landCover, osm }) {
  return {
    terrain:   terrainIndicators(terrain, elevation),
    flood:     floodIndicators(floodRisk),
    climate:   climateIndicators(climateSolar),
    soil:      soilIndicators(soil),
    land_cover: landCoverIndicators(landCover),
    access:    accessIndicators(osm),
    computed_at: new Date().toISOString(),
  };
}