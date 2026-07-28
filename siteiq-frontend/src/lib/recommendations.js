/**
 * Layer 2 — Recommendations
 *
 * Each domain function reads indicators (Layer 1) and returns:
 * {
 *   score:           number 0–100,
 *   summary:         string,
 *   strengths:       string[],
 *   considerations:  string[],
 *   recommendations: string[],
 *   domain_specific: object   (varies by domain)
 * }
 *
 * No raw API data here — only indicators.
 */

// ── Scoring helpers ────────────────────────────────────────────────────────

function clamp(v, min = 0, max = 100) {
  return Math.min(max, Math.max(min, v));
}

function scoreLabel(score) {
  if (score >= 80) return "Well suited";
  if (score >= 65) return "Suitable with considerations";
  if (score >= 50) return "Marginal — careful planning required";
  if (score >= 35) return "Poorly suited — significant constraints";
  return "Not recommended";
}

// ── RESIDENTIAL ───────────────────────────────────────────────────────────

function residential(ind) {
  const { terrain, flood, climate, soil, access } = ind;
  const strengths      = [];
  const considerations = [];
  const recommendations= [];
  let score = 60;

  // Slope
  if (terrain.slope_category === "flat" || terrain.slope_category === "gentle") {
    strengths.push("Gentle terrain — low earthworks cost");
    score += 12;
  } else if (terrain.slope_category === "moderate") {
    considerations.push("Moderate slope — retaining structures likely needed");
    score -= 8;
  } else {
    considerations.push("Steep terrain — significant grading cost");
    score -= 18;
  }

  // Flood
  if (flood.hand_category === "high" || flood.hand_category === "moderate") {
    strengths.push("Low flood exposure");
    score += 10;
  } else if (flood.hand_category === "low") {
    considerations.push("Some flood exposure — drainage design required");
    score -= 5;
  } else {
    considerations.push("High flood risk — site may be unsuitable for permanent structures");
    score -= 20;
    recommendations.push("Commission a hydrological assessment before development.");
  }

  // Soil expansion
  if (soil.expansion_risk === "high") {
    considerations.push("High clay content — expansive soil risk");
    score -= 12;
    recommendations.push("Engage a geotechnical engineer. Raft or pile foundations likely required.");
  } else if (soil.expansion_risk === "moderate") {
    considerations.push("Moderate clay — monitor for seasonal ground movement");
    score -= 5;
    recommendations.push("Increase foundation depth and use reinforced strip foundations.");
  } else {
    strengths.push("Soil texture suitable for standard foundations");
    score += 6;
  }

  // Soil pH for corrosion
  if (soil.ph != null && soil.ph < 5.5) {
    considerations.push("Acidic soil — corrosion risk for buried steel and concrete");
    recommendations.push("Specify sulphate-resisting cement and epoxy-coated rebar.");
    score -= 5;
  }

  // Organic carbon / compressibility
  if (soil.organic_carbon_pct != null && soil.organic_carbon_pct > 3) {
    considerations.push("High organic carbon — compressible soil, settlement risk");
    score -= 8;
    recommendations.push("Investigate organic layer depth. May require ground improvement.");
  }

  // Road access
  if (access.road_access_category === "immediate" || access.road_access_category === "close") {
    strengths.push("Good road access");
    score += 8;
  } else if (access.road_access_category === "moderate") {
    considerations.push("Access road to plot will be needed");
    score -= 4;
    recommendations.push(`Budget for access road construction (${access.nearest_road_m}m to nearest road).`);
  } else {
    considerations.push("Remote location — significant access road investment");
    score -= 12;
  }

  // Rainfall — water harvesting
  if (climate.annual_rainfall_mm != null) {
    if (climate.annual_rainfall_mm > 700) {
      strengths.push("Adequate rainfall for rooftop water harvesting");
      recommendations.push("Install a rainwater harvesting system sized for the dry season.");
    } else if (climate.annual_rainfall_mm > 400) {
      considerations.push("Moderate rainfall — water storage tank recommended");
    } else {
      considerations.push("Low rainfall — borehole or piped supply likely essential");
      score -= 6;
    }
  }

  // Solar
  if (climate.solar_ghi_annual != null && climate.solar_ghi_annual >= 4.5) {
    strengths.push("Excellent solar potential for off-grid or hybrid power");
    recommendations.push("Solar PV system viable — typical payback under 5 years at this irradiance.");
  }

  // Grid power
  if (access.grid_power) {
    strengths.push("Grid power infrastructure mapped nearby");
  } else {
    considerations.push("No mapped grid power — solar or generator needed");
  }

  // Earthworks timing
  if (climate.wet_months?.length > 0) {
    recommendations.push(`Schedule earthworks outside wet months (${climate.wet_months.join(", ")}).`);
  }

  return {
    score: clamp(score),
    summary: scoreLabel(clamp(score)) + " for residential development.",
    strengths,
    considerations,
    recommendations,
    domain_specific: {
      foundation_type_hint:
        soil.expansion_risk === "high"    ? "Raft or pile foundation recommended"
        : soil.expansion_risk === "moderate" ? "Reinforced strip foundation recommended"
        : "Standard strip or pad foundation suitable",
      water_supply_hint:
        climate.annual_rainfall_mm > 700  ? "Rainwater harvesting viable"
        : access.grid_power               ? "Mains supply + storage tank"
        : "Borehole investigation recommended",
    },
  };
}

// ── COMMERCIAL ────────────────────────────────────────────────────────────

function commercial(ind) {
  const { terrain, flood, soil, access, climate } = ind;
  const strengths = [], considerations = [], recommendations = [];
  let score = 60;

  // Road access is critical for commercial
  if (access.road_access_category === "immediate") {
    strengths.push("Excellent road access for goods and customers");
    score += 15;
  } else if (access.road_access_category === "close") {
    strengths.push("Good road access");
    score += 8;
  } else {
    considerations.push("Poor road access — freight costs will be elevated");
    score -= 15;
    recommendations.push("Improve access road before development. Factor haulage costs into feasibility.");
  }

  // Flat terrain for loading, parking, hardstanding
  if (terrain.slope_category === "flat" || terrain.slope_category === "gentle") {
    strengths.push("Flat terrain — suitable for large footprint structures and hardstanding");
    score += 10;
  } else if (terrain.slope_category === "moderate") {
    considerations.push("Sloped terrain — site levelling cost for commercial footprint");
    score -= 10;
  } else {
    considerations.push("Steep terrain — significant cut and fill required");
    score -= 20;
  }

  // Flood risk — asset protection
  if (["high", "moderate"].includes(flood.hand_category)) {
    strengths.push("Low flood exposure — asset protection risk is low");
    score += 8;
  } else {
    considerations.push("Flood exposure — commercial assets at risk");
    score -= 15;
    recommendations.push("Raise floor levels above estimated flood line. Install perimeter drainage.");
  }

  // Grid power
  if (access.grid_power) {
    strengths.push("Grid power available — lower energy infrastructure cost");
    score += 8;
  } else {
    considerations.push("No grid power — generator or solar investment required");
    score -= 5;
    recommendations.push("Size a solar-diesel hybrid system for operational continuity.");
  }

  // Soil
  if (soil.expansion_risk === "high") {
    considerations.push("Expansive soil — heavy foundation engineering required");
    score -= 10;
    recommendations.push("Geotechnical investigation essential before structural design.");
  }

  if (climate.solar_ghi_annual != null && climate.solar_ghi_annual >= 5.0) {
    strengths.push("High solar irradiance — on-site generation can offset operating costs");
    recommendations.push("Consider roof-mounted PV for energy cost reduction.");
  }

  return {
    score: clamp(score),
    summary: scoreLabel(clamp(score)) + " for commercial / light industrial use.",
    strengths, considerations, recommendations,
    domain_specific: {
      access_note: `Nearest road: ${access.nearest_road_m != null ? `${access.nearest_road_m}m` : "unknown"}`,
      power_note:  access.grid_power ? "Grid connected" : "Off-grid — power infrastructure needed",
    },
  };
}

// ── AGRICULTURE ───────────────────────────────────────────────────────────

const CROP_THRESHOLDS = [
  { name: "Maize",     minMm: 500,  maxMm: 1200, minPh: 5.5, maxClay: 60, minTemp: 10 },
  { name: "Beans",     minMm: 400,  maxMm: 900,  minPh: 5.5, maxClay: 55, minTemp: 10 },
  { name: "Potatoes",  minMm: 500,  maxMm: 1000, minPh: 5.0, maxClay: 50, minTemp: 5  },
  { name: "Sorghum",   minMm: 300,  maxMm: 750,  minPh: 5.5, maxClay: 65, minTemp: 12 },
  { name: "Millet",    minMm: 250,  maxMm: 600,  minPh: 5.0, maxClay: 60, minTemp: 12 },
  { name: "Wheat",     minMm: 400,  maxMm: 900,  minPh: 6.0, maxClay: 50, minTemp: 5  },
  { name: "Sunflower", minMm: 350,  maxMm: 700,  minPh: 5.5, maxClay: 55, minTemp: 10 },
  { name: "Cowpea",    minMm: 300,  maxMm: 700,  minPh: 5.5, maxClay: 60, minTemp: 15 },
  { name: "Cassava",   minMm: 500,  maxMm: 1500, minPh: 5.0, maxClay: 65, minTemp: 18 },
  { name: "Sweet potato",minMm:450, maxMm: 1200, minPh: 5.5, maxClay: 55, minTemp: 15 },
  { name: "Kale (sukuma)",minMm:500,maxMm: 1500, minPh: 5.5, maxClay: 60, minTemp: 8  },
  { name: "Tomatoes",  minMm: 400,  maxMm: 800,  minPh: 5.5, maxClay: 50, minTemp: 10 },
  { name: "Avocado",   minMm: 600,  maxMm: 1200, minPh: 5.5, maxClay: 55, minTemp: 10 },
  { name: "Coffee",    minMm: 800,  maxMm: 2000, minPh: 5.5, maxClay: 55, minTemp: 10 },
  { name: "Tea",       minMm: 1200, maxMm: 3000, minPh: 4.5, maxClay: 55, minTemp: 8  },
];

function agriculture(ind) {
  const { terrain, flood, soil, climate, access } = ind;
  const strengths = [], considerations = [], recommendations = [];
  let score = 60;

  // Slope
  if (terrain.slope_category === "flat" || terrain.slope_category === "gentle") {
    strengths.push("Suitable terrain for mechanised farming");
    score += 10;
  } else if (terrain.slope_category === "moderate") {
    considerations.push("Moderate slope — contour farming recommended to reduce erosion");
    score -= 6;
    recommendations.push("Plant along contours. Consider terracing for permanent crops.");
  } else {
    considerations.push("Steep slope — row cropping not recommended. High erosion risk.");
    score -= 18;
  }

  // Rainfall
  const mm = climate.annual_rainfall_mm;
  if (mm != null) {
    if (mm > 800)       { strengths.push("Good rainfall supports most food crops"); score += 12; }
    else if (mm > 500)  { strengths.push("Adequate rainfall for staple crops"); score += 6; }
    else if (mm > 350)  { considerations.push("Marginal rainfall — drought-tolerant varieties essential"); score -= 6; }
    else                { considerations.push("Low rainfall — rain-fed agriculture high risk"); score -= 15; }

    if (climate.seasonality === "bimodal") {
      strengths.push("Bimodal rainfall — potential for two cropping seasons per year");
      recommendations.push(`Plant with onset of long rains (${climate.wet_months?.slice(0,2).join(", ")}) and short rains.`);
    }
  }

  // Soil fertility
  if (soil.fertility_category === "high") {
    strengths.push("High organic carbon — naturally fertile soil");
    score += 8;
  } else if (soil.fertility_category === "low" || soil.fertility_category === "very low") {
    considerations.push("Low soil fertility — input investment required");
    score -= 8;
    recommendations.push("Apply compost or manure at 5–10 t/ha before first season. Test soil annually.");
  }

  // pH
  if (soil.ph != null) {
    if (soil.ph < 5.0) {
      considerations.push("Strongly acidic soil — most crops will underperform");
      score -= 12;
      recommendations.push("Apply agricultural lime at 2–4 t/ha to raise pH. Retest after 3 months.");
    } else if (soil.ph < 5.5) {
      recommendations.push("Apply lime to raise pH above 5.5 before planting.");
      score -= 5;
    }
  }

  // Drainage
  if (soil.drainage_class === "very slow" || soil.drainage_class === "slow") {
    considerations.push("Poor soil drainage — waterlogging risk in wet season");
    recommendations.push("Install field drainage channels before wet season planting.");
  }

  // Flood / moisture
  if (flood.hand_category === "very low" || flood.hand_category === "low") {
    considerations.push("Low-lying position — waterlogging risk for upland crops");
    recommendations.push("Consider flood-tolerant crops (cassava, sweet potato) for low areas.");
  } else {
    strengths.push("Good drainage position — low waterlogging risk");
    score += 6;
  }

  // Road access for market
  if (access.nearest_road_m != null && access.nearest_road_m > 1500) {
    considerations.push("Poor road access — post-harvest losses will be high for perishables");
    score -= 8;
    recommendations.push("Focus on non-perishable crops or value-added processing to reduce transport urgency.");
  } else {
    strengths.push("Road access viable for produce transport");
  }

  // Solar for irrigation
  if (climate.solar_ghi_annual != null && climate.solar_ghi_annual >= 4.5) {
    recommendations.push("Solar-powered irrigation pump viable — reduces diesel dependency.");
  }

  // Recommend crops
  const suitableCrops = CROP_THRESHOLDS.filter(crop => {
    const rainOk  = mm == null || (mm >= crop.minMm && mm <= crop.maxMm);
    const phOk    = soil.ph == null || soil.ph >= crop.minPh;
    const clayOk  = soil.clay_pct == null || soil.clay_pct <= crop.maxClay;
    const tempOk  = climate.temp_min_mean_c == null || climate.temp_min_mean_c >= crop.minTemp;
    return rainOk && phOk && clayOk && tempOk;
  }).map(c => c.name);

  return {
    score: clamp(score),
    summary: scoreLabel(clamp(score)) + " for rain-fed agriculture.",
    strengths, considerations, recommendations,
    domain_specific: {
      recommended_crops:   suitableCrops.slice(0, 8),
      irrigation_needed:   mm != null && mm < 500,
      cropping_seasons:    climate.seasonality === "bimodal" ? 2 : 1,
      lime_needed:         soil.ph != null && soil.ph < 5.5,
    },
  };
}

// ── PASTORALISM ───────────────────────────────────────────────────────────

function pastoralism(ind) {
  const { terrain, flood, soil, climate, access, land_cover } = ind;
  const strengths = [], considerations = [], recommendations = [];
  let score = 60;

  // Rainfall for pasture
  const mm = climate.annual_rainfall_mm;
  if (mm > 600)       { strengths.push("Good rainfall supports reliable pasture growth"); score += 12; }
  else if (mm > 350)  { considerations.push("Semi-arid — stocking rates must be managed carefully"); score -= 5;
    recommendations.push("Implement rotational grazing to prevent overgrazing in dry seasons."); }
  else                { considerations.push("Arid conditions — high livestock stress risk in dry season"); score -= 15;
    recommendations.push("Establish water points and feed reserves before dry season."); }

  // Existing land cover
  if (land_cover.grassland_pct > 40) {
    strengths.push(`Good grassland cover (${land_cover.grassland_pct}%) — direct grazing possible`);
    score += 10;
  } else if (land_cover.forest_pct > 40) {
    considerations.push("Dense forest cover — browse available but low carrying capacity");
  } else if (land_cover.cropland_pct > 40) {
    considerations.push("Active cropland — conflict risk if converting to pasture");
    recommendations.push("Negotiate land use transition carefully. Pasture establishment takes 1–2 seasons.");
  }

  // Slope — herd mobility
  if (terrain.slope_category === "flat" || terrain.slope_category === "gentle") {
    strengths.push("Low-relief terrain — good herd mobility");
    score += 8;
  } else if (terrain.slope_deg != null && terrain.slope_deg > 25) {
    considerations.push("Steep terrain — injury risk for livestock, limits vehicle access");
    score -= 8;
  }

  // Water access
  if (flood.waterway_dist_m != null && flood.waterway_dist_m < 1000) {
    strengths.push(`Surface water within ${flood.waterway_dist_m}m — natural water source`);
    score += 8;
  } else {
    considerations.push("No nearby surface water — water infrastructure essential");
    score -= 8;
    recommendations.push("Install water troughs fed by borehole or rainwater harvesting tanks.");
  }

  // Wet months for dry season planning
  if (climate.dry_months?.length > 3) {
    recommendations.push(`${climate.dry_months.length} dry months (${climate.dry_months.join(", ")}) — plan feed reserves and destocking strategy.`);
  }

  if (climate.solar_ghi_annual >= 4.5) {
    recommendations.push("Solar-powered borehole pump viable for reliable water supply.");
  }

  return {
    score: clamp(score),
    summary: scoreLabel(clamp(score)) + " for pastoralism / livestock keeping.",
    strengths, considerations, recommendations,
    domain_specific: {
      water_infrastructure_needed: flood.waterway_dist_m == null || flood.waterway_dist_m > 1000,
      dry_season_months:           climate.dry_months?.length ?? 0,
      grassland_coverage_pct:      land_cover.grassland_pct ?? 0,
    },
  };
}

// ── GREENHOUSE ────────────────────────────────────────────────────────────

function greenhouse(ind) {
  const { terrain, flood, soil, climate, access } = ind;
  const strengths = [], considerations = [], recommendations = [];
  let score = 60;

  // Solar — critical for greenhouse
  const ghi = climate.solar_ghi_annual;
  if (ghi >= 5.5)      { strengths.push(`Exceptional solar irradiance (${ghi} kWh/m²/day) — ideal for year-round production`); score += 15; }
  else if (ghi >= 4.5) { strengths.push(`Good solar irradiance (${ghi} kWh/m²/day)`); score += 8; }
  else if (ghi >= 3.5) { considerations.push("Moderate solar irradiance — supplemental lighting may be needed for some crops"); score -= 5; }
  else                 { considerations.push("Low irradiance — high-light crops will underperform"); score -= 12; }

  // Flat land for structure
  if (terrain.slope_category === "flat" || terrain.slope_category === "gentle") {
    strengths.push("Level ground — minimal site preparation for greenhouse structure");
    score += 10;
  } else {
    considerations.push("Sloping terrain — levelling required before structure installation");
    score -= 8;
    recommendations.push("Level a minimum of 20% slope gradient before foundation work.");
  }

  // Flood risk — infrastructure protection
  if (flood.hand_category === "high" || flood.hand_category === "moderate") {
    strengths.push("Low flood risk — greenhouse infrastructure protected");
    score += 8;
  } else {
    considerations.push("Flood exposure — greenhouse structure and crops at risk");
    score -= 12;
    recommendations.push("Raise greenhouse floor level. Install perimeter drainage channels.");
  }

  // Water supply
  const mm = climate.annual_rainfall_mm;
  if (mm > 600) {
    strengths.push("Adequate rainfall for water harvesting supplementation");
    recommendations.push("Install guttering and storage tanks to capture roof runoff for irrigation.");
  } else {
    considerations.push("Low rainfall — dedicated water supply essential");
    recommendations.push("Borehole or mains water connection required. Size storage for dry season.");
    score -= 5;
  }

  // Road access for inputs/outputs
  if (access.road_access_category === "immediate" || access.road_access_category === "close") {
    strengths.push("Good road access — viable for high-value fresh produce supply chains");
    score += 8;
  } else {
    considerations.push("Poor road access will increase input costs and reduce produce freshness");
    score -= 10;
  }

  // Soil pH if planting in ground
  if (soil.ph != null && (soil.ph < 5.5 || soil.ph > 7.5)) {
    considerations.push("Soil pH outside optimal range — raised beds or soilless media recommended");
    recommendations.push("Use peat-based or coco coir growing media in raised beds to control root zone pH.");
  }

  if (climate.solar_ghi_annual >= 5.0) {
    recommendations.push("Consider agrivoltaic design — partial solar panels over greenhouse reduces heat stress and generates power.");
  }

  return {
    score: clamp(score),
    summary: scoreLabel(clamp(score)) + " for greenhouse / horticulture.",
    strengths, considerations, recommendations,
    domain_specific: {
      solar_rating:          climate.solar_viability ?? "unknown",
      water_source_needed:   mm == null || mm < 600,
      soilless_recommended:  soil.ph != null && (soil.ph < 5.5 || soil.ph > 7.5),
    },
  };
}

// ── CONSERVATION ──────────────────────────────────────────────────────────

function conservation(ind) {
  const { terrain, flood, soil, climate, land_cover, access } = ind;
  const strengths = [], considerations = [], recommendations = [];
  let score = 60;

  // Existing natural cover
  if (land_cover.forest_pct > 30) {
    strengths.push(`Existing forest cover (${land_cover.forest_pct}%) — protect, don't convert`);
    score += 15;
    recommendations.push("Demarcate forest boundary. Register as community forest if applicable.");
  }
  if (land_cover.grassland_pct > 30) {
    strengths.push(`Natural grassland (${land_cover.grassland_pct}%) — important biodiversity habitat`);
    score += 8;
  }
  if (land_cover.water_wetland_pct > 5) {
    strengths.push("Wetland or water bodies present — high conservation and carbon value");
    score += 10;
    recommendations.push("Wetlands are legally protected in Kenya. Avoid drainage or infill activities.");
  }

  // Soil carbon
  if (soil.organic_carbon_pct != null) {
    if (soil.organic_carbon_pct > 2) {
      strengths.push(`Good soil carbon stock (${soil.organic_carbon_pct}%) — sequestration value`);
      score += 8;
      recommendations.push("Avoid tillage and burning — maintain carbon stock intact.");
    } else {
      recommendations.push("Low soil carbon — restoration planting will build carbon over time.");
    }
  }

  // Rainfall for vegetation
  const mm = climate.annual_rainfall_mm;
  if (mm > 800)       { strengths.push("High rainfall — supports forest establishment"); score += 8; }
  else if (mm > 500)  { strengths.push("Adequate rainfall for woodland and grassland conservation"); score += 4; }
  else                { considerations.push("Low rainfall — use drought-adapted native species for restoration"); }

  // Slope for erosion prevention
  if (terrain.slope_deg != null && terrain.slope_deg > 15) {
    strengths.push("Steep terrain — conservation is highest-value use to prevent erosion");
    score += 10;
    recommendations.push("Plant deep-rooted native species on slopes to stabilise soil.");
  }

  // Remote from development
  if (access.road_access_category === "remote") {
    strengths.push("Low road access — reduced development and encroachment pressure");
    score += 5;
  } else {
    considerations.push("Accessible location — establish clear boundaries to prevent encroachment");
    recommendations.push("Install boundary markers and signage. Engage community in management.");
  }

  // Flood / riparian
  if (flood.riparian_proximity === "immediate" || flood.riparian_proximity === "close") {
    strengths.push("Riparian zone — critical water catchment area worth protecting");
    score += 8;
    recommendations.push("Plant riparian buffer strip with native trees. Minimum 30m from waterway.");
  }

  return {
    score: clamp(score),
    summary: scoreLabel(clamp(score)) + " for conservation and restoration.",
    strengths, considerations, recommendations,
    domain_specific: {
      existing_natural_pct:   land_cover.forest_pct + land_cover.grassland_pct,
      carbon_sequestration:   soil.organic_carbon_pct != null && soil.organic_carbon_pct > 1 ? "high potential" : "moderate potential",
      wetland_present:        land_cover.water_wetland_pct > 5,
    },
  };
}

// ── Domain registry ────────────────────────────────────────────────────────

export const DOMAINS = {
  residential:  { label: "Residential",            icon: "🏠", fn: residential  },
  commercial:   { label: "Commercial / Industrial", icon: "🏭", fn: commercial   },
  agriculture:  { label: "Agriculture",             icon: "🌾", fn: agriculture  },
  pastoralism:  { label: "Pastoralism",             icon: "🐄", fn: pastoralism  },
  greenhouse:   { label: "Greenhouse / Horticulture",icon:"🌿", fn: greenhouse   },
  conservation: { label: "Conservation",            icon: "🌲", fn: conservation },
};

export function generateRecommendation(indicators, purpose) {
  const domain = DOMAINS[purpose];
  if (!domain) throw new Error(`Unknown purpose: ${purpose}`);
  return {
    purpose,
    purpose_label: domain.label,
    generated_at:  new Date().toISOString(),
    ...domain.fn(indicators),
  };
}